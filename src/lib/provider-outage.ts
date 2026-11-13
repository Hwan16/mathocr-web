// AI 제공사(Claude) 장애 대응 — 순수 로직 (D-059, 2026-11-14).
// 라우트·cron·관리자 발송과 단위 테스트가 함께 쓴다(외부 호출·별칭 import 없음).
//
// 전체 흐름
//  1) /api/ocr/claude 가 끝내 제공사 5xx(과부하·서버 오류·연결 실패)로 실패하면 응답에
//     provider_outage: true 를 싣고 "장애 시작"을 공유 저장소에 남긴다(provider-outage-store.ts).
//     앱(다음 버전부터)은 이 표시가 있는 실패로 변환을 멈췄을 때만 "제공사 장애 + 정상화되면
//     메일로 알려드림" 안내를 띄운다 — 회원 인터넷 끊김·하루 한도 때는 메일을 약속하지 않는다.
//  2) 앱이 장애로 변환을 멈추면 /api/logs 에 ai_service_down 오류가 온다 → 관리자 메일
//     "회원 변환 중단"(30분에 1통).
//  3) cron(/api/cron/outage-watch, 10분마다)이 장애 기록이 있을 때만 Claude 에 짧은 확인
//     요청을 보내고, 응답하면 기록을 지운다. 회원이 멈췄던 장애면 관리자에게 "정상화 확인" 메일.
//  4) 회원 복구 안내 메일은 /api/admin/outage-notice — 대상 확인(dry run) → 사용자 승인 → send=1.

/** 제공사 쪽 장애로 볼 상태 코드 — 5xx(500 api_error·529 overloaded·연결 실패 500 등).
 *  4xx(요청 형식·한도·키 문제)는 장애가 아니라 우리 쪽 문제라 제외한다. */
export function isProviderOutageStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 500 && status <= 599;
}

/** 한 번의 Claude 호출이 '제공사 장애'였는지 — 메일 약속은 확실할 때만 한다(Codex 검토 반영).
 *  - 제공사가 실제로 돌려준 5xx(본문이 JSON 이 아니어도 — 앞단 502 페이지 등)
 *  - 제공사 응답을 기다리다 시간 초과
 *  제외: 우리 서버의 연결 실패(network)·제공사 4xx·응답 해석 실패(2xx/4xx 본문 깨짐). */
export function isProviderOutageAttempt(attempt: {
  upstreamStatus?: number;
  transport?: "timeout" | "network";
}): boolean {
  if (attempt.transport === "timeout") return true;
  return attempt.upstreamStatus !== undefined && isProviderOutageStatus(attempt.upstreamStatus);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 관리자 화면·로그용 이메일 가리기 — "ab***@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length))}***${email.slice(at)}`;
}

/** "11월 13일 22:40" (한국 시간) */
export function formatKst(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${hh}:${mm}`;
}

/** "1시간 20분" / "35분" */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

// ── 장애로 멈춘 회원 모으기 (error_logs 의 conversion_error · category=ai_service_down) ──

export type OutageLogRow = {
  user_id: string | null;
  conversion_id: string | null;
  created_at: string;
  metadata: unknown;
};

export type AffectedMember = {
  user_id: string;
  first_at: string;
  last_at: string;
  failures: number;
  /** 서버가 '제공사 장애'로 표시한 실패였는지(앱 다음 버전부터 기록) */
  provider_outage: boolean;
  details: string[];
  conversion_ids: string[];
};

function metadataOf(row: OutageLogRow): Record<string, unknown> {
  return typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
    ? (row.metadata as Record<string, unknown>)
    : {};
}

export function aggregateAffected(rows: OutageLogRow[]): AffectedMember[] {
  const byUser = new Map<string, AffectedMember>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const meta = metadataOf(row);
    if (meta.category !== "ai_service_down") continue;
    const detail = typeof meta.service_detail === "string" ? meta.service_detail.trim() : "";
    const current = byUser.get(row.user_id);
    if (!current) {
      byUser.set(row.user_id, {
        user_id: row.user_id,
        first_at: row.created_at,
        last_at: row.created_at,
        failures: 1,
        provider_outage: meta.provider_outage === true,
        details: detail ? [detail] : [],
        conversion_ids: row.conversion_id ? [row.conversion_id] : [],
      });
      continue;
    }
    current.failures += 1;
    if (row.created_at < current.first_at) current.first_at = row.created_at;
    if (row.created_at > current.last_at) current.last_at = row.created_at;
    if (meta.provider_outage === true) current.provider_outage = true;
    if (detail && !current.details.includes(detail)) current.details.push(detail);
    if (row.conversion_id && !current.conversion_ids.includes(row.conversion_id)) {
      current.conversion_ids.push(row.conversion_id);
    }
  }
  return [...byUser.values()].sort((a, b) => a.first_at.localeCompare(b.first_at));
}

// 제공사 장애가 아닌 '멈춤' — 하루 한도·분당 한도·회원 인터넷 끊김(앱 api_client 의 네트워크
// 문구들). 구버전 앱은 이것들도 ai_service_down 으로 보내므로 복구 메일 대상에서 걸러낸다.
const NOT_OUTAGE_DETAIL =
  /일일 처리 한도|오늘 처리 가능한 횟수|분당 시도|인터넷 연결|서버에 연결할 수 없습니다|네트워크 오류|서버 응답 시간이 초과|서버 응답을 해석할 수 없습니다|파일을 올리/;

export function outageNoticeEligibility(
  member: AffectedMember,
  includeLegacy: boolean
): { eligible: boolean; reason: string } {
  if (member.provider_outage) return { eligible: true, reason: "provider_outage" };
  if (!includeLegacy) return { eligible: false, reason: "legacy_app_not_included" };
  // 구버전은 '제공사 장애' 표시가 없으니 보수적으로 — 원인 문구가 하나라도 있고, 그중
  // 한도·네트워크가 아닌 것(Overloaded 등 제공사 원문)이 있을 때만 포함한다.
  if (member.details.length === 0) return { eligible: false, reason: "legacy_no_detail" };
  if (member.details.every((d) => NOT_OUTAGE_DETAIL.test(d))) {
    return { eligible: false, reason: "limit_or_network" };
  }
  return { eligible: true, reason: "legacy_included" };
}

/** 회원 메일 발송 대상을 dry run 때와 똑같은지 확인하는 지문(정렬한 회원 ID 의 짧은 요약).
 *  dry run 결과의 fingerprint 를 send=1 요청에 그대로 넘겨야 발송된다 — 승인 뒤 대상이
 *  늘거나 바뀌면 거절(Codex 검토 반영). */
export function targetFingerprint(userIds: string[]): string {
  const text = [...userIds].sort().join(",");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${userIds.length}-${hash.toString(16).padStart(8, "0")}`;
}

// ── 회원 복구 안내 메일 (비광고 서비스 안내) ──
// ⚠️ 프로모션·충전 유도·수신거부 링크를 넣지 말 것 — 한 문장이라도 섞이면 광고성 정보가 되어
//    마케팅 미동의 회원 발송이 정보통신망법 제50조 위반이 된다(terms-notice 와 같은 원칙).
// 문구를 바꾸면 첫 발송 전에 사용자 확인을 다시 받는다(대외 발송 관문).

export const OUTAGE_NOTICE_SUBJECT = "[AI MathOCR] 변환 서비스가 정상화되었습니다";

export function buildOutageNoticeHtml(firstFailedAt: string): string {
  const when = formatKst(firstFailedAt);
  const whenText = when ? `${escapeHtml(when)}쯤` : "얼마 전";
  return `<div style="font-family:'Malgun Gothic',sans-serif;font-size:15px;line-height:1.8;color:#18181b;">
<p>안녕하세요, AI MathOCR입니다.</p>
<p>${whenText} AI 인식 서비스 제공사의 장애로 변환이 중단되어 불편을 드렸습니다.<br>다시 한번 사과드립니다.</p>
<p>지금은 서비스가 정상화되어 변환을 다시 이용하실 수 있습니다.<br>중단된 변환에 차감되었던 크레딧은 자동으로 반환되었습니다.</p>
<p>궁금한 점은 이 메일에 답장해 주세요.<br>감사합니다.</p>
<p>AI MathOCR 드림</p>
</div>`;
}

// ── 관리자 알림 메일 본문 (sendAdminAlert 가 글꼴 틀을 씌운다) ──

export const STATUS_PAGE_URL = "https://status.claude.com";

export function buildStoppedAlert(input: {
  at: Date;
  detail: string;
  providerOutage: boolean;
  outageSince: string | null;
  outageDetail: string | null;
  userId: string;
  conversionId: string | null;
}): { subject: string; html: string } {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(formatKst(input.at))}</b> 회원 변환이 AI 서비스 오류로 중단됐어요.`);
  if (input.outageSince) {
    lines.push(
      `서버가 <b>제공사(Claude) 장애</b>를 감지한 상태예요 — 시작 ${escapeHtml(formatKst(input.outageSince))}` +
        (input.outageDetail ? ` (${escapeHtml(input.outageDetail)})` : "")
    );
    lines.push("정상화되면 10분 안에 '정상화 확인' 메일을 다시 보내 드려요.");
  } else {
    lines.push(
      "서버는 제공사 장애를 감지하지 못했어요 — 회원 인터넷 끊김·하루 한도·우리 서버 문제일 수 있어요."
    );
  }
  lines.push(
    `앱이 받은 안내: ${input.detail ? escapeHtml(input.detail) : "(없음)"}` +
      ` · 새 안내창(메일 약속) 표시: ${input.providerOutage ? "예" : "아니오(구버전 앱이거나 제공사 장애 아님)"}`
  );
  lines.push(
    `회원 ${escapeHtml(input.userId.slice(0, 8))}…` +
      (input.conversionId ? ` · 변환 ${escapeHtml(input.conversionId.slice(0, 8))}…` : "")
  );
  lines.push(`상태 페이지: <a href="${STATUS_PAGE_URL}">${STATUS_PAGE_URL}</a>`);
  lines.push("<span style='color:#71717a'>같은 알림은 30분에 한 통으로 묶어요. 중단된 변환의 크레딧은 앱이 자동 반환해요.</span>");
  return {
    subject: input.outageSince
      ? "[MathOCR] 제공사 장애로 회원 변환 중단"
      : "[MathOCR] 회원 변환이 AI 서비스 오류로 중단",
    html: lines.map((l) => `<p style="margin:0 0 8px">${l}</p>`).join(""),
  };
}

export function buildRecoveredAlert(input: {
  since: string;
  recoveredAt: Date;
  probeModel: string;
  affected: number;
  eligible: number;
  truncated?: boolean;
}): { subject: string; html: string } {
  const duration = formatDuration(input.recoveredAt.getTime() - new Date(input.since).getTime());
  const plus = input.truncated ? "+ (기록이 많아 일부만 셈)" : "";
  const lines = [
    `<b>${escapeHtml(formatKst(input.recoveredAt))}</b> Claude 가 다시 정상 응답해요 (확인 모델 ${escapeHtml(input.probeModel)}).`,
    `장애 기록: ${escapeHtml(formatKst(input.since))}부터 약 ${escapeHtml(duration)}.`,
    `이 기간에 변환이 멈춘 회원 <b>${input.affected}명${plus}</b> · 복구 안내 메일 대상(새 버전 앱에서 메일을 약속받은 회원) <b>${input.eligible}명${plus}</b>.`,
    "Claude Code 에 <b>'장애 복구 메일 보내'</b>라고 말하면 대상을 다시 확인하고 발송 승인을 받아요.",
    `<span style='color:#71717a'>대상 확인: GET /api/admin/outage-notice?since=${escapeHtml(input.since)}&amp;until=${escapeHtml(input.recoveredAt.toISOString())} (CRON_SECRET 필요). 발송은 그 결과의 fingerprint 를 붙여 send=1.</span>`,
  ];
  return {
    subject: "[MathOCR] AI 서비스 정상화 확인",
    html: lines.map((l) => `<p style="margin:0 0 8px">${l}</p>`).join(""),
  };
}
