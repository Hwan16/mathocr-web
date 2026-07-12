import { createHash } from "crypto";

// OCR 프록시 방어 (LA-04 임시 방어).
//
// /api/ocr/claude·mathpix는 로그인 + 크레딧 보유만 확인하고 외부 유료 API를
// 대신 호출해 준다. 이 모듈은 그 통로가 "내 API 키로 공짜 LLM 쓰기"나
// 비용 폭주에 악용되지 않도록 다음을 제공한다:
//   1. 시스템 프롬프트 SHA-256 허용 목록 — 데스크톱 앱이 보내는 고정 프롬프트만 통과
//   2. 사용자별 일일 호출 상한 — 단일 계정의 대량 호출 차단
//   3. 공급자별 일일 비용 상한 + 50/80/100% 경보(관리자 메일) — 비용 폭탄의 최종 방어선
//   4. 구조화 사용량 로그 — Vercel 함수 로그에서 사용 패턴·악용 추적
//
// 카운터는 Upstash Redis(공유)로 유지하고, Redis 장애 시 인스턴스 메모리로
// 폴백한다. 폴백은 인스턴스별 카운트라 느슨해지지만(rate-limit.ts와 같은 한계)
// 상한 자체는 계속 작동한다 — 완전 fail-open이던 기존 동작의 보강.
// 근본 해결(변환 티켓에 호출 결속)은 LA-04 근본 항목에서 별도 진행.

export type OcrProvider = "claude" | "mathpix";

// ── 1. 시스템 프롬프트 허용 목록 ─────────────────────────────
// 데스크톱 structure_analyzer.py의 SYSTEM_PROMPT / SOLUTION_SYSTEM_PROMPT.
// 프롬프트 본문은 수정 금지(CLAUDE.md)라 해시가 사실상 고정이다.
// 구버전 앱 호환을 위해 v1.4.0·v1.6.0 시절 해시도 포함 (v1.7.0부터 현행).
// 프롬프트를 부득이 바꾸는 릴리스에서는 여기에 새 해시를 먼저 추가·배포할 것.
const ALLOWED_SYSTEM_PROMPT_HASHES = new Set<string>([
  // SYSTEM_PROMPT (v2.0.7~현행) — 테두리 박스 정의 확장(일반 박스 포함)
  "f3fabf2e91e747aec4fef74df9bf366c7b0613c5d25cb5ba4b06969e4c094549",
  // SYSTEM_PROMPT (v1.7.0~v2.0.6)
  "1d5489828e6424494da64a44a2e2c5df339fde16374df0b72f33d976d0f82ceb",
  // SOLUTION_SYSTEM_PROMPT (v1.4.0~현행, 변경 이력 없음)
  "a53e24e2b599c75cb107d476ce1887cefc4ab34895c719b472e5927ea6572980",
  // SYSTEM_PROMPT (v1.6.0)
  "0d54844bfffcb95a75f76e494a81c0c8c4264d86c780d4a43bf5d714655454df",
  // SYSTEM_PROMPT (v1.4.0~v1.5.x)
  "3ff95bd73896dbdd1d39719a4d0626cd189d451adb7009d2b1306ec8d1ab449c",
]);

// 긴급 탈출구: 코드 배포 없이 env로 해시 추가 (쉼표 구분 64자 hex)
function extraPromptHashes(): string[] {
  return (process.env.OCR_EXTRA_PROMPT_HASHES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{64}$/.test(s));
}

export function isAllowedSystemPrompt(system: string): boolean {
  const hash = createHash("sha256").update(system, "utf8").digest("hex");
  return (
    ALLOWED_SYSTEM_PROMPT_HASHES.has(hash) || extraPromptHashes().includes(hash)
  );
}

// ── 상한 설정 ────────────────────────────────────────────────
// 일일 비용 상한 (USD). 정상 규모(사용자 수십 명) 대비 넉넉하고,
// 사고가 나도 하루 손실이 이 금액에서 멈춘다. env로 조정 가능.
const DEFAULT_DAILY_COST_LIMIT_USD: Record<OcrProvider, number> = {
  claude: 20,
  mathpix: 10,
};
// 사용자당 일일 호출 상한. 정상 최대치(교사 1명이 하루 종일 변환)보다 크게:
// 50문제 변환 1건 ≈ 문제·해설 각 1회씩 최대 200호출 → 하루 4건 = 800.
const DEFAULT_USER_DAILY_CALL_LIMIT = 800;

export function dailyCostLimitUsd(provider: OcrProvider): number {
  const env =
    provider === "claude"
      ? process.env.OCR_DAILY_COST_LIMIT_CLAUDE_USD
      : process.env.OCR_DAILY_COST_LIMIT_MATHPIX_USD;
  const parsed = Number(env);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DAILY_COST_LIMIT_USD[provider];
}

function userDailyCallLimit(): number {
  const parsed = Number(process.env.OCR_USER_DAILY_CALL_LIMIT);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_USER_DAILY_CALL_LIMIT;
}

// ── 비용 추정 ────────────────────────────────────────────────
// claude-sonnet-4-6 단가 (USD/1M tokens, 2026-07 기준):
// 입력 $3 · 출력 $15 · 캐시 쓰기(5분 TTL) $3.75 · 캐시 읽기 $0.30
const CLAUDE_USD_PER_MTOK = {
  input: 3,
  output: 15,
  cacheWrite: 3.75,
  cacheRead: 0.3,
};

export function estimateClaudeCostUsd(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}): number {
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  return (
    (n(usage.input_tokens) * CLAUDE_USD_PER_MTOK.input +
      n(usage.output_tokens) * CLAUDE_USD_PER_MTOK.output +
      n(usage.cache_creation_input_tokens) * CLAUDE_USD_PER_MTOK.cacheWrite +
      n(usage.cache_read_input_tokens) * CLAUDE_USD_PER_MTOK.cacheRead) /
    1_000_000
  );
}

export function mathpixCostPerCallUsd(): number {
  const parsed = Number(process.env.MATHPIX_COST_PER_CALL_USD);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.004;
}

// ── Redis 헬퍼 (rate-limit.ts와 같은 Upstash REST, 실패 시 null) ──
const REDIS_TIMEOUT_MS = 2000;

async function redisPipeline(
  commands: (string | number)[][]
): Promise<unknown[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(commands.map((c) => c.map(String))),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[ocr-guard] upstash http error", { status: res.status });
      return null;
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return null;
    return data.map((entry) => (entry as { result?: unknown })?.result);
  } catch (error) {
    console.warn("[ocr-guard] upstash unreachable, falling back to memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── 인스턴스 메모리 폴백 카운터 ──
const globalGuard = globalThis as typeof globalThis & {
  __mathocrOcrGuardCounters?: Map<string, number>;
};
const memCounters =
  globalGuard.__mathocrOcrGuardCounters ?? new Map<string, number>();
globalGuard.__mathocrOcrGuardCounters = memCounters;

function memIncr(key: string, delta: number): number {
  // 지난 날짜 키가 쌓이지 않게 가끔 청소 (키에 날짜가 포함됨)
  if (memCounters.size > 2000) {
    const today = kstDayKey();
    for (const k of memCounters.keys()) {
      if (!k.includes(today)) memCounters.delete(k);
    }
  }
  const next = (memCounters.get(key) ?? 0) + delta;
  memCounters.set(key, next);
  return next;
}

// KST 기준 일자 키 — 운영자(한국)의 하루와 일치시킨다
function kstDayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

const TWO_DAYS_S = 2 * 24 * 60 * 60;

// ── 2. 사용자별 일일 호출 상한 ──────────────────────────────
export async function checkAndCountUserCall(
  provider: OcrProvider,
  userId: string
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = userDailyCallLimit();
  const key = `ocrcalls:${provider}:${userId}:${kstDayKey()}`;

  const results = await redisPipeline([
    ["INCR", key],
    ["EXPIRE", key, TWO_DAYS_S],
  ]);
  const count = results ? Number(results[0]) : NaN;
  const finalCount = Number.isFinite(count) ? count : memIncr(key, 1);

  return { allowed: finalCount <= limit, count: finalCount, limit };
}

// ── 3. 공급자별 일일 비용 상한 + 경보 ────────────────────────
// 카운터는 마이크로달러(정수) 단위 — Redis INCRBY는 정수만 받는다.
function costKey(provider: OcrProvider): string {
  return `ocrcost:${provider}:${kstDayKey()}`;
}

/** 상한 도달 여부 — 외부 API 호출 "전"에 검사한다. */
export async function isDailyCostBlocked(
  provider: OcrProvider
): Promise<{ blocked: boolean; spentUsd: number; limitUsd: number }> {
  const limitUsd = dailyCostLimitUsd(provider);
  const key = costKey(provider);
  const results = await redisPipeline([["GET", key]]);
  const raw = results ? Number(results[0]) : NaN;
  const spentMicro = Number.isFinite(raw) ? raw : (memCounters.get(key) ?? 0);
  const spentUsd = spentMicro / 1e6;
  return { blocked: spentUsd >= limitUsd, spentUsd, limitUsd };
}

const ALERT_THRESHOLD_PCTS = [50, 80, 100];
const ADMIN_ALERT_EMAIL = "aimathocr.official@gmail.com";
const ALERT_FROM = "AI MathOCR <noreply@mathocr.ai.kr>";

/** 호출 비용을 적립하고, 50/80/100% 문턱을 처음 넘는 순간 경보를 보낸다. */
export async function recordCost(
  provider: OcrProvider,
  usd: number
): Promise<void> {
  if (!(usd > 0)) return;
  const key = costKey(provider);
  const deltaMicro = Math.max(1, Math.round(usd * 1e6));

  const results = await redisPipeline([
    ["INCRBY", key, deltaMicro],
    ["EXPIRE", key, TWO_DAYS_S],
  ]);
  const newRaw = results ? Number(results[0]) : NaN;
  const newMicro = Number.isFinite(newRaw)
    ? newRaw
    : memIncr(key, deltaMicro);
  const oldMicro = newMicro - deltaMicro;

  const limitMicro = dailyCostLimitUsd(provider) * 1e6;
  for (const pct of ALERT_THRESHOLD_PCTS) {
    const threshold = (limitMicro * pct) / 100;
    if (oldMicro < threshold && newMicro >= threshold) {
      await sendCostAlert(provider, pct, newMicro / 1e6, limitMicro / 1e6);
    }
  }
}

async function sendCostAlert(
  provider: OcrProvider,
  pct: number,
  spentUsd: number,
  limitUsd: number
): Promise<void> {
  // 동시 요청이 같은 문턱을 함께 넘는 드문 경우의 중복 메일을 SETNX로 억제.
  // Redis 불능이면 그냥 보낸다 (경보 누락보다 중복이 낫다).
  const dedupeKey = `ocrcost:alerted:${provider}:${kstDayKey()}:${pct}`;
  const results = await redisPipeline([
    ["SET", dedupeKey, "1", "NX", "EX", TWO_DAYS_S],
  ]);
  if (results && results[0] === null) return; // 이미 다른 요청이 발송

  const summary = `[MathOCR 비용 경보] ${provider} 일일 비용 ${pct}% 도달 — $${spentUsd.toFixed(2)} / $${limitUsd.toFixed(2)}`;
  console.error(`[ocr-guard] ${summary}`);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: ADMIN_ALERT_EMAIL,
        subject: summary,
        html: `<div style="font-family:'Malgun Gothic',sans-serif;line-height:1.7;">
  <p><strong>${provider}</strong> OCR 프록시의 오늘(KST) 추정 비용이 일일 상한의 <strong>${pct}%</strong>에 도달했습니다.</p>
  <p>현재 $${spentUsd.toFixed(2)} / 상한 $${limitUsd.toFixed(2)}${pct >= 100 ? " — <strong>이후 호출은 자정(KST)까지 차단됩니다.</strong>" : ""}</p>
  <p style="font-size:12px;color:#888;">비정상 사용이 의심되면 Vercel 함수 로그에서 tag=ocr_usage 로그를 확인하세요.
  상한 조정: Vercel env OCR_DAILY_COST_LIMIT_${provider.toUpperCase()}_USD</p>
</div>`,
      }),
    });
  } catch (error) {
    console.error("[ocr-guard] alert mail failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 4. 구조화 사용량 로그 ────────────────────────────────────
export function logOcrUsage(entry: {
  provider: OcrProvider;
  user_id: string;
  ok: boolean;
  status: number;
  duration_ms: number;
  est_cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  blocked_reason?: string;
}): void {
  console.log(
    JSON.stringify({ tag: "ocr_usage", at: new Date().toISOString(), ...entry })
  );
}
