// 가입 급증 감시 — 2026-08-08 어뷰징 사고 후속.
//
// 배경: 08-07 밤 자동 프로그램이 3시간 동안 계정 30개를 만들어 무료 크레딧을
//   털어갔는데, 사용자가 다음 날 직접 가입자 목록을 보고 눈치채기 전까지
//   아무도 몰랐다. 일회용 메일 차단(lib/disposable-email.ts)은 이미 알려진
//   도메인만 막으므로, 목록에 없는 새 도메인이나 진짜 메일 계정을 쓰면 통과한다.
//   → "막는 것"과 별개로 "빨리 아는 것"이 필요하다.
//
// 임계값 근거 (2026-08-08 전체 가입 기록 실측):
//   정상 가입은 이동 1시간 창 최대 2명(48회는 1명, 3회는 2명).
//   어뷰징 때는 같은 창에 최대 11명. 경계가 뚜렷해 5명이면 오경보 없이 잡힌다.
//   실제로 5를 적용했다면 사고 당시 5번째 계정(약 28분 시점)에서 울렸다 — 30개가
//   아니라 5개 선에서 끊을 수 있었다.
//
// 오경보 비용은 메일 1통뿐이고 가입을 막지도 않으므로, 둔감한 쪽보다
// 민감한 쪽으로 잡는다. 마케팅이 터져 진짜로 가입이 몰리면 그때 env로 올린다.

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendAdminAlert } from "@/lib/admin-alert";

const WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_SIGNUP_THRESHOLD = 5;
const DEFAULT_BLOCKED_THRESHOLD = 5;

function threshold(envName: string, fallback: number): number {
  const parsed = Number(process.env[envName]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * 경보 1회/시간으로 제한한다.
 * checkRateLimit(limit=1)을 재사용 — 첫 호출만 allowed=true라 그대로 중복 억제가 된다.
 * Redis 장애 시에는 인스턴스 메모리로 폴백하므로 최악의 경우 중복 메일이 몇 통
 * 더 갈 수 있다. 경보 누락보다 중복이 낫다는 판단(ocr-guard와 같은 방침).
 */
async function claimAlertSlot(kind: string): Promise<boolean> {
  const { allowed } = await checkRateLimit(`signupalert:${kind}`, 1, WINDOW_MS);
  return allowed;
}

const kst = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

// 경보 메일에 들어가는 값 중 이메일 도메인·주소는 공격자가 정하는 문자열이다.
// 이스케이프 없이 HTML에 끼우면 경보 본문에 공격자가 쓴 링크·안내문이
// 신뢰된 문구처럼 렌더링될 수 있다 (교차 리뷰 반영).
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * 가입 성공 직후 호출. 최근 1시간 가입 수가 임계를 넘으면 관리자에게 메일.
 * 어떤 이유로도 예외를 밖으로 내보내지 않는다 — 경보 때문에 가입이 실패하면 안 된다.
 */
export async function checkSignupSurge(): Promise<void> {
  try {
    const limit = threshold("SIGNUP_ALERT_THRESHOLD", DEFAULT_SIGNUP_THRESHOLD);
    const since = new Date(Date.now() - WINDOW_MS).toISOString();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("email, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("[signup-alert] 최근 가입 조회 실패", { error: error.message });
      return;
    }
    const recent = data ?? [];
    if (recent.length < limit) return;
    if (!(await claimAlertSlot("surge"))) return;

    // 도메인 쏠림은 어뷰징의 가장 빠른 단서라 메일 맨 위에 세운다.
    const byDomain = new Map<string, number>();
    for (const r of recent) {
      const d = (r.email ?? "").split("@")[1]?.toLowerCase() || "(알 수 없음)";
      byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
    }
    const domainRows = [...byDomain.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([d, c]) => `<li><strong>${c}건</strong> — ${escapeHtml(d)}</li>`)
      .join("");
    const listRows = recent
      .map((r) => `<li>${kst(r.created_at)} — ${escapeHtml(r.email ?? "")}</li>`)
      .join("");

    await sendAdminAlert(
      `[MathOCR 가입 급증] 최근 1시간 ${recent.length}명 가입 (임계 ${limit}명)`,
      `<p>최근 1시간 동안 <strong>${recent.length}명</strong>이 가입했습니다. 평소 같은 창의 최대치는 2명입니다.</p>
  <p><strong>도메인 분포</strong></p><ul>${domainRows}</ul>
  <p><strong>가입 목록 (KST)</strong></p><ul>${listRows}</ul>
  <p style="font-size:13px;color:#555;">한 도메인에 몰려 있거나 처음 보는 도메인이면 어뷰징을 의심하세요.</p>
  <p style="font-size:13px;color:#555;"><strong>대응 순서</strong><br />
  ① <strong>Vercel 환경변수 <code>BLOCKED_EMAIL_DOMAINS</code>에 도메인 추가</strong> —
  ⚠️ 저장만 하면 반영되지 않습니다. 저장 후 반드시
  <strong>Vercel → 프로젝트 → Deployments 탭 → 상단 필터를 Production 으로 → 가장 최근 Production 배포의
  ⋯ 메뉴 → Redeploy</strong>까지 눌러야 적용됩니다(1~2분 소요).
  목록 맨 위가 Preview 배포일 수 있으니 <strong>반드시 Production 인지 확인</strong>하세요.
  반영 확인: 차단된 도메인으로 가입을 한 번 시도해 막히는지 보면 됩니다.
  이 단계를 빼먹으면 막은 줄 알았는데 계속 뚫립니다.<br />
  ② 해당 계정 크레딧 회수·정지 — 현재 관리자 화면에는 회수 기능이 없어 Supabase 콘솔에서 처리해야 합니다.</p>
  <p style="font-size:12px;color:#888;">마케팅이 터져 진짜로 몰린 것이라면 <code>SIGNUP_ALERT_THRESHOLD</code>를 올리세요(이것도 Redeploy 필요).</p>`
    );
  } catch (error) {
    console.warn("[signup-alert] 급증 감시 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── 차단 사유 구분 (2026-08-19) ──
//
// 종전에는 4가지 차단(일회용 메일·별칭·지메일 점·데이터센터 IP)이 카운터
// 하나를 공유하고 메일 문구가 일회용 메일용으로 고정돼 있었다. 그 결과
// 별칭(+) 공격이 와도 경보가 "일회용 메일 공격"이라 주장하며 마지막 차단
// 도메인(예: outlook.com — 정상 대형 메일사)을 차단 목록에 넣으라고 잘못
// 안내했다. 사유별로 카운터·문구를 분리하고, 오탐률을 측정할 수 있도록
// 모든 차단을 blocked_signups 테이블(0027)에 남긴다.
export type BlockedSignupReason =
  | "disposable_email"
  | "plus_alias"
  | "dotted_gmail"
  | "datacenter_ip";

const BLOCKED_REASON_COPY: Record<
  BlockedSignupReason,
  { name: string; guidance: string }
> = {
  disposable_email: {
    name: "일회용(임시) 메일",
    guidance: `상대가 목록에 없는 새 도메인으로 갈아타면 통과할 수 있으니, 이어서
  <strong>가입 급증 경보</strong>가 오는지 지켜보세요. 새 도메인을 막으려면 Vercel 환경변수
  <code>BLOCKED_EMAIL_DOMAINS</code>에 추가한 뒤 <strong>반드시 Production Redeploy</strong>까지
  해야 반영됩니다.`,
  },
  plus_alias: {
    name: "메일 별칭(+)",
    guidance: `⚠️ 아래 도메인은 <strong>차단 대상이 아닙니다</strong> — 막힌 것은 주소의
  별칭(+) 부분이고, 도메인 자체는 정상 메일사(예: outlook.com)일 수 있습니다.
  이 도메인을 <code>BLOCKED_EMAIL_DOMAINS</code>에 넣으면 정상 고객까지 막히니 넣지 마세요.
  별칭 차단을 풀어야 한다면 env <code>ALLOW_PLUS_ALIAS_SIGNUP=true</code> + Production Redeploy.`,
  },
  dotted_gmail: {
    name: "지메일 점(.) 주소",
    guidance: `⚠️ <code>gmail.com</code>은 차단 목록에 넣으면 안 됩니다 — 막힌 것은 점(.)이
  들어간 주소 형태이고, 사용자에게는 점을 뺀 주소로 재시도하라고 안내되고 있습니다.
  같은 메일함이 점 조합으로 여러 계정을 만드는 것을 막는 방어가 정상 동작한 것입니다.`,
  },
  datacenter_ip: {
    name: "VPN·데이터센터 IP",
    guidance: `이 차단은 이메일 도메인과 무관하게 <strong>접속 IP</strong>가 데이터센터·VPN
  대역이라 막힌 것입니다. 정상 고객 오탐이 의심되면(예: 특정 통신사·기관) Vercel 함수
  로그의 IP를 확인하고, 허용하려면 env <code>ALLOWED_IP_CIDRS</code>에 대역 추가 +
  Production Redeploy가 필요합니다.`,
  },
};

/**
 * 어뷰징 방어가 가입을 막았을 때 호출. (1) 차단 기록을 blocked_signups에 남기고
 * (2) 같은 사유의 차단이 1시간 임계를 넘으면 관리자에게 사유별 문구로 메일.
 *
 * 가입 급증 감시만으로는 "차단이 잘 돼서 계정이 안 생긴" 공격을 영영 모른다.
 * 공격이 다시 왔다는 사실 자체가 정보라 별도 신호로 둔다 (도메인을 바꿔 오면
 * 결국 급증 감시 쪽이 잡는다).
 */
export async function checkBlockedSignupSurge(
  reason: BlockedSignupReason,
  domain: string | null,
  ip: string | null = null
): Promise<void> {
  // (1) 차단 기록 — 사유별 건수·오탐 측정용 (0027). 기록 실패가 차단 응답을
  // 막으면 안 되고, 0027 적용 전에는 테이블이 없어 실패하는 것이 정상이다.
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("blocked_signups")
      .insert({ reason, email_domain: domain, ip });
    if (error) {
      console.warn("[signup-alert] 차단 기록 실패", { reason, error: error.message });
    }
  } catch (error) {
    console.warn("[signup-alert] 차단 기록 실패", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // (2) 사유별 임계 감시 + 경보 메일. 사유를 번갈아 써서 사유별 임계를 전부
  // 피하는 공격도 놓치지 않도록, 전체 합산 카운터(종전 동작)도 함께 본다 —
  // 중복 메일 가능성보다 경보 누락이 나쁘다는 기존 방침.
  try {
    const limit = threshold("SIGNUP_BLOCKED_ALERT_THRESHOLD", DEFAULT_BLOCKED_THRESHOLD);
    const safeDomain = escapeHtml(domain ?? "(알 수 없음)");
    const footer = `<p style="font-size:12px;color:#888;">사유별 차단 내역은 Supabase의 <code>blocked_signups</code> 표에서
  확인할 수 있습니다 (시각·도메인·IP 포함).</p>`;

    // limit회까지는 allowed=true, 넘어서는 순간 false — 그 순간을 문턱 통과로 본다.
    const [perReason, aggregate] = await Promise.all([
      checkRateLimit(`signupalert:blockedcount:${reason}`, limit, WINDOW_MS),
      checkRateLimit("signupalert:blockedcount", limit, WINDOW_MS),
    ]);

    if (!perReason.allowed && (await claimAlertSlot(`blocked:${reason}`))) {
      const copy = BLOCKED_REASON_COPY[reason];
      await sendAdminAlert(
        `[MathOCR 어뷰징 차단] ${copy.name} 가입 시도가 1시간에 ${limit}건을 넘었습니다`,
        `<p><strong>${copy.name}</strong> 사유로 가입이 최근 1시간 동안 <strong>${limit}건 넘게</strong> 차단됐습니다.</p>
  <p>마지막 차단 도메인: <strong>${safeDomain}</strong></p>
  <p style="font-size:13px;color:#555;">차단은 정상 작동 중이라 계정은 생기지 않았습니다.</p>
  <p style="font-size:13px;color:#555;">${copy.guidance}</p>
  ${footer}`
      );
      return; // 사유별 경보가 나갔으면 합산 경보는 생략 (같은 사건 중복 방지)
    }

    if (!aggregate.allowed && (await claimAlertSlot("blocked"))) {
      await sendAdminAlert(
        `[MathOCR 어뷰징 차단] 여러 사유의 가입 차단이 1시간에 ${limit}건을 넘었습니다`,
        `<p>사유를 바꿔 가며 가입을 시도하는 패턴이 최근 1시간 동안 합산 <strong>${limit}건 넘게</strong> 차단됐습니다.</p>
  <p>마지막 차단: <strong>${escapeHtml(BLOCKED_REASON_COPY[reason].name)}</strong> / 도메인 <strong>${safeDomain}</strong></p>
  <p style="font-size:13px;color:#555;">차단은 정상 작동 중이라 계정은 생기지 않았습니다.
  <code>blocked_signups</code> 표에서 사유 분포를 확인하세요.</p>
  ${footer}`
      );
    }
  } catch (error) {
    console.warn("[signup-alert] 차단 감시 실패", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
