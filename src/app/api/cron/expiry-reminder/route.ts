import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { REPLY_TO } from "@/lib/mail";

// 크레딧 만료 임박 안내 (F9) — vercel.json cron이 매일 1회(00:00 UTC) 호출한다.
//
// 대상: 크레딧을 보유하고 유효기간 만료가 REMIND_BEFORE_DAYS일 안으로 다가온 사용자.
//
// 중복 방지 방식 (2026-08-12 변경 — 고치기 전에 반드시 읽을 것):
//   조회 창은 [지금, 만료 7일 전) 이고, 중복은 **창이 아니라 expiry_reminder_sent_at
//   마커(0024)** 가 막는다. 예전에는 창이 [만료 6일 전, 7일 전) 하루짜리라 창 자체가
//   중복을 막았지만, 그 구조는 한 번 실패하면 다음 날 창이 지나가 **영구 유실**이었다.
//   지금은 실패해도 마커가 안 찍히므로 다음 실행이 자동으로 재시도한다.
//   ⚠️ 창을 다시 좁히거나 마커 로직을 지우면 전원에게 중복 발송된다(광고성 메일 포함).
//   0024 미적용 환경에서는 usingMarker=false 로 옛 하루짜리 창에 자동 폴백한다.
//
// (재충전으로 만료일이 미래로 옮겨지면 새 만료일이 다가올 때 다시 안내되는데,
//  이는 의도된 동작 — 마커가 새 창보다 과거가 되어 재진입한다)
//
// 정책(2026-07-09 확정): 만료 후 연장·복구는 없다. 약관 제6조가 이 사전 안내를
// 전제하므로 cron 등록을 해제하지 말 것.
//
// 마케팅 동의 분기 (LA-09, 정보통신망법 제50조):
//   - marketing_opt_in=false/null → 중립형: 만료일·소멸 크레딧 수만 사실 고지
//     (소비자 보호 목적의 서비스 안내 — 충전 유도 CTA·혜택 문구 없음).
//     단, **유료 결제 이력(payments.status=completed)이 있는 계정에만** 보낸다
//     (2026-07-13 §4-2 결정 (ii): 무료 제공분만 보유한 비동의자에게는 소멸
//     안내도 광고성으로 해석될 여지(KISA)가 있어 발송하지 않는다. 유료 구매분
//     소멸 안내는 계약 이행 통지 성격이라 유지).
//   - marketing_opt_in=true → 재구매 유도 포함: 제목 "(광고)" 표기 + 수신거부
//     링크(kind=user — profiles.marketing_opt_in 해제) + 발신 사업자 표기.
//
// 이메일 인증 게이트 (LA-09 보강, 2026-07-13): email_confirmed_at 이 없는
// 계정은 광고형·중립형 모두 발송하지 않는다 — 타인 이메일로 가입만 해 둔
// 경우 그 이메일 소유자가 원치 않는 메일을 받게 되는 경로 차단. 조회 실패
// 시에도 발송하지 않는다(fail-closed).

export const dynamic = "force-dynamic";
// 조회 창이 하루 → 7일로 넓어져 후보가 늘 수 있다. 후보 1명당 인증여부 조회 1회 +
// 발송당 0.6초 대기를 순차로 돌므로, 형제 cron(expiry-regrant)과 동일하게 상한을 올린다.
// 없으면 기본 실행시간(10~15초)에서 잘려 그날 한 통도 못 나갈 수 있다.
export const maxDuration = 300;

const REMIND_BEFORE_DAYS = 7;
const MAX_PER_RUN = 200; // 발송 안전 상한 (Resend 무료 티어 일 100통 — 초과 시 플랜 확인)
// 조회 상한은 발송 상한과 분리한다 (2026-08-12).
//   창이 7일로 넓어지면서 "이미 안내를 받은 사람"도 함께 조회된다. 조회를 200으로
//   자르면 만료가 임박한(=이미 받은) 사람들이 앞자리를 채우고 **오늘의 실제 대상이
//   통째로 잘린다** — 에러 없이 발송 0건이 되는 조용한 실패다.
//   가입 무료 크레딧이 7일 유효라 이 인원은 가입 수에 비례해 계속 늘어난다.
const FETCH_LIMIT = 1000;
const SITE_URL = "https://mathocr.ai.kr";
const CHARGE_URL = `${SITE_URL}/charge`;
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
// 답장 주소 — 발신은 수신 불가(noreply)라 답장을 실제 문의 주소로 돌린다 (lib/mail.ts)
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

function formatKst(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso));
}

// 메일 공통 골격 — 로고 + 만료 사실 고지(크레딧 수·만료일·소멸 안내)까지는
// 동의 여부와 무관한 사실 정보라 두 템플릿이 공유한다.
function factsHtml(credits: number, dateStr: string): string {
  return `
  <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>
  <h1 style="font-size:20px;margin:20px 0 12px;">크레딧 만료 예정 안내</h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.</p>
  <div style="background:#f5f3ff;border-radius:12px;padding:16px 20px;margin:0 0 16px;">
    <p style="margin:0;font-size:15px;">
      보유하신 크레딧 <strong>${credits}개</strong>의 유효기간이<br />
      <strong style="color:#7c3aed;">${dateStr}</strong>까지입니다.
    </p>
  </div>
  <p style="margin:0 0 16px;">
    유효기간이 지나면 남은 크레딧은 자동으로 소멸되며,
    <strong>복구나 환불이 되지 않습니다.</strong>
  </p>`;
}

// 중립형 (마케팅 비동의자) — 소멸 예정 사실만 고지하고 끝낸다.
// 충전 유도 CTA·혜택 문구가 없으므로 광고성 정보가 아니다 → "(광고)" 표기 불요.
function buildNeutralEmail(credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `[AI MathOCR] 보유 크레딧 ${credits}개가 ${dateStr}에 만료됩니다`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${factsHtml(credits, dateStr)}
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 보유 크레딧의 만료 예정을 알려드리는 서비스 안내 메일입니다.<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a>
  </p>
</div>`;
  return { subject, html };
}

// 광고형 (마케팅 동의자) — 재구매 유도(연장 안내 + 충전 CTA)를 포함하므로
// 제목 "(광고)" 표기 + 수신거부 링크 + 발신 사업자 표기를 붙인다.
function buildMarketingEmail(userId: string, credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `(광고) [AI MathOCR] 보유 크레딧 ${credits}개가 ${dateStr}에 만료됩니다`;
  // CRON_SECRET 인증을 통과한 뒤라 토큰은 항상 생성되지만, 만약을 대비해
  // 토큰이 없으면 수신거부 링크 없는 광고 메일이 나가지 않도록 마이페이지로 안내한다.
  const token = unsubscribeToken(userId, "user");
  // 영문 병기(Unsubscribe) — 정보통신망법 시행령의 한·영 표기 권고 반영
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${factsHtml(credits, dateStr)}
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">💡 남은 크레딧을 지키는 방법</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      만료 <strong>전에</strong> 크레딧을 새로 충전하시면, 지금 남아 있는
      크레딧도 사라지지 않고 <strong>새로 충전한 크레딧의 유효기간까지 함께
      연장</strong>됩니다. 예를 들어 오늘 30일 플랜을 충전하면, 기존 크레딧도
      오늘부터 30일 뒤까지 그대로 사용하실 수 있습니다.
    </p>
  </div>
  <a href="${CHARGE_URL}"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    충전하고 유효기간 연장하기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 크레딧 만료 예정 안내와 함께, 마케팅 수신에 동의하신 분께
    충전 혜택 정보를 담아 보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
  return { subject, html };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const dayMs = 24 * 60 * 60 * 1000;
  const nowIso = new Date().toISOString();
  const windowEnd = new Date(
    Date.now() + REMIND_BEFORE_DAYS * dayMs
  ).toISOString();
  // 하루짜리 창의 하한(기존 동작) — 0024 미적용 폴백에서만 쓴다.
  const legacyWindowStart = new Date(
    Date.now() + (REMIND_BEFORE_DAYS - 1) * dayMs
  ).toISOString();

  const supabase = createAdminClient();

  // 0024(expiry_reminder_sent_at) 적용 후 기본 경로:
  //   창을 "지금 ~ 만료 7일 전"으로 **넓히고**, 발송 마커로 중복을 막는다.
  //   이렇게 하면 cron 이 하루 걸러뛰거나 개별 발송이 실패해도 다음 실행이 자동 복구한다.
  //   (기존의 하루짜리 창은 한 번 놓치면 영구 유실이었다 — 2026-08-11 감사 B-1)
  //
  //   재충전으로 expires_at 이 미래로 밀리면 sent_at 이 그보다 과거가 되므로
  //   `expiry_reminder_sent_at < expires_at - 7일` 조건이 다시 참이 되어 재안내된다.
  //   그 판정은 SQL 로 표현하기 번거로워 아래 코드에서 처리한다.
  //
  // 정렬(.order)을 넣어 MAX_PER_RUN 절단이 결정적이 되게 한다 — 정렬이 없으면
  // 대상이 많을 때 특정 사용자가 매번 뒤로 밀려 영영 못 받을 수 있었다.
  let usingMarker = true;
  let { data: profiles, error } = await supabase
    .from("profiles")
    .select(
      "id, email, credits, expires_at, marketing_opt_in, onboarding_welcome_sent_at, expiry_reminder_sent_at"
    )
    .gt("credits", 0)
    .gte("expires_at", nowIso)
    .lt("expires_at", windowEnd)
    .order("expires_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(FETCH_LIMIT);

  // 0024 미적용 환경 — 기존 하루짜리 창 그대로 동작시킨다(발송이 멈추지 않게).
  if (error && /expiry_reminder_sent_at/.test(error.message)) {
    console.warn("[expiry-reminder] 0024 미적용 — 발송 기록 없이 기존 창으로 진행");
    usingMarker = false;
    const legacy = await supabase
      .from("profiles")
      .select("id, email, credits, expires_at, marketing_opt_in, onboarding_welcome_sent_at")
      .gt("credits", 0)
      .gte("expires_at", legacyWindowStart)
      .lt("expires_at", windowEnd)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(FETCH_LIMIT);
    profiles = (legacy.data ?? []).map((p) => ({
      ...p,
      expiry_reminder_sent_at: null,
    }));
    error = legacy.error;
  }

  if (error && /onboarding_welcome_sent_at/.test(error.message)) {
    console.warn("[expiry-reminder] 0018 미적용 — 온보딩 중복 방지 없이 진행");
    usingMarker = false;
    const legacy = await supabase
      .from("profiles")
      .select("id, email, credits, expires_at, marketing_opt_in")
      .gt("credits", 0)
      .gte("expires_at", legacyWindowStart)
      .lt("expires_at", windowEnd)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(FETCH_LIMIT);
    profiles = (legacy.data ?? []).map((p) => ({
      ...p,
      onboarding_welcome_sent_at: null,
      expiry_reminder_sent_at: null,
    }));
    error = legacy.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 마커 경로에서만: 이번 만료일에 대해 이미 보낸 사람을 제외한다.
  // 기준은 "현재 만료일의 안내 창(만료 7일 전) 이후에 보냈는가" —
  // 재충전으로 만료일이 밀리면 옛 발송은 새 창보다 과거라 다시 대상이 된다.
  function alreadyReminded(p: {
    expires_at: string | null;
    expiry_reminder_sent_at?: string | null;
  }): boolean {
    if (!usingMarker || !p.expiry_reminder_sent_at || !p.expires_at) return false;
    const windowOpensAt = Date.parse(p.expires_at) - REMIND_BEFORE_DAYS * dayMs;
    return Date.parse(p.expiry_reminder_sent_at) >= windowOpensAt;
  }

  // 온보딩 환영 메일(0018)을 최근 7일 안에 받은 사용자는 건너뛴다 — 환영 메일이
  // 같은 만료일을 이미 고지했기 때문. 가입 무료 크레딧(유효 7일)은 지급
  // 다음 날 곧바로 이 "만료 7일 전" 창에 걸리므로, 이 예외가 없으면 환영 메일과
  // 만료 안내가 하루 이틀 사이에 연달아 나간다. 충전으로 만료일이 미래로 옮겨진
  // 경우에는 새 만료가 다가올 때쯤 환영 발송이 7일보다 오래전이라 정상 발송된다.
  const welcomeRecentCutoff = Date.now() - 7 * dayMs;
  function welcomeRecent(p: { onboarding_welcome_sent_at?: string | null }): boolean {
    return (
      !!p.onboarding_welcome_sent_at &&
      Date.parse(p.onboarding_welcome_sent_at) > welcomeRecentCutoff
    );
  }

  const candidates = (profiles ?? []).filter(
    (p) => p.email && p.expires_at && !welcomeRecent(p) && !alreadyReminded(p)
  );

  // (1) 이메일 인증 확인 — 미인증(또는 조회 실패)이면 어떤 메일도 보내지 않는다.
  const confirmedById = new Map<string, boolean>();
  for (const p of candidates) {
    let confirmed = false;
    try {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(p.id);
      if (userError) {
        console.warn("[expiry-reminder] user lookup failed — skipping (fail-closed)", {
          user_id: p.id,
          error: userError.message,
        });
      } else {
        confirmed = !!userData?.user?.email_confirmed_at;
      }
    } catch (lookupError) {
      console.warn("[expiry-reminder] user lookup threw — skipping (fail-closed)", {
        user_id: p.id,
        error: lookupError instanceof Error ? lookupError.message : String(lookupError),
      });
    }
    confirmedById.set(p.id, confirmed);
  }

  // (2) 유료 결제 이력 — 비동의자 중립형 발송 자격 (§4-2 결정 (ii))
  // amount > 0 필수(2026-07-22 수정): 프로모션 상환·운영자 지급도 payments 에
  // status=completed, amount=0 으로 기록되므로, 금액 필터가 없으면 무료 크레딧만
  // 받은 비동의자가 '유료 구매자'로 오판되어 §4-2 (ii)가 금지한 소멸 안내를 받는다.
  const paidUserIds = new Set<string>();
  if (candidates.length > 0) {
    const { data: paidRows, error: paidError } = await supabase
      .from("payments")
      .select("user_id")
      .eq("status", "completed")
      .gt("amount", 0)
      .in("user_id", candidates.map((p) => p.id));
    if (paidError) {
      // 조회 실패 시 비동의자 중립형은 전부 건너뛴다(fail-closed) —
      // 다음 날 창이 지나가 버리는 손실보다 무동의 발송 리스크 회피를 우선.
      console.warn("[expiry-reminder] payments lookup failed", {
        error: paidError.message,
      });
    }
    for (const row of paidRows ?? []) {
      if (row.user_id) paidUserIds.add(row.user_id);
    }
  }

  // (2b) 최근 재지급(re_earlybird, expiry-regrant cron) 수신자 — 재지급 광고 메일이
  // 만료일(지급+7일)을 이미 고지했으므로, 7일 내에는 광고형 만료 임박 메일을 다시
  // 보내지 않는다(2026-07-22 — 이틀 연속 광고 메일 방지). 중립형은 유지: 비동의
  // 유료 사용자는 재지급을 조용히 받았기 때문에 이 안내가 유일한 고지다.
  const recentRegrantIds = new Set<string>();
  if (candidates.length > 0) {
    const { data: regrantCode } = await supabase
      .from("promo_codes")
      .select("id")
      .eq("code", "re_earlybird")
      .maybeSingle();
    if (regrantCode) {
      const { data: regrants, error: regrantsError } = await supabase
        .from("promo_redemptions")
        .select("user_id")
        .eq("promo_code_id", regrantCode.id)
        .gte("created_at", new Date(Date.now() - 7 * dayMs).toISOString())
        .in("user_id", candidates.map((p) => p.id));
      if (regrantsError) {
        // 조회 실패 시 억제 없이 기존 동작 유지 (최악이 중복 광고 1통 — 발송 누락보다 낫다)
        console.warn("[expiry-reminder] regrant lookup failed — 중복 억제 없이 진행", {
          error: regrantsError.message,
        });
      }
      for (const r of regrants ?? []) {
        if (r.user_id) recentRegrantIds.add(r.user_id);
      }
    }
  }

  // (3) 발송 종류 판정: marketing(광고형) / neutral(중립형) / null(발송 안 함)
  function decideKind(p: {
    id: string;
    marketing_opt_in: boolean | null;
  }): "marketing" | "neutral" | null {
    if (!confirmedById.get(p.id)) return null; // 미인증 — 전면 제외
    if (p.marketing_opt_in === true) {
      return recentRegrantIds.has(p.id) ? null : "marketing"; // 재지급 7일 내 — 광고형 중복 억제
    }
    return paidUserIds.has(p.id) ? "neutral" : null; // 비동의자는 유료 구매자만
  }

  const allTargets = candidates
    .map((p) => ({ ...p, kind: decideKind(p) }))
    .filter((p): p is typeof p & { kind: "marketing" | "neutral" } => p.kind !== null);

  // 발송 상한은 **판정이 끝난 뒤** 적용한다 — 조회 단계에서 자르면 이미 안내를 받은
  // 사람들이 앞자리를 채워 오늘의 실제 대상이 통째로 잘린다. 잘린 사람은 마커가
  // 안 찍히므로 다음 실행에서 자동으로 이어서 발송된다(유실 아님).
  const targets = allTargets.slice(0, MAX_PER_RUN);
  const deferred = allTargets.length - targets.length;
  if (deferred > 0) {
    console.warn("[expiry-reminder] 발송 상한 초과 — 다음 실행으로 이월", {
      total: allTargets.length,
      sending: targets.length,
      deferred,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY, // 운영 점검용 (값은 노출 안 함)
      // usingMarker=false 면 0024 미적용 상태(하루짜리 창·재시도 없음)라는 뜻
      usingMarker,
      window: { start: usingMarker ? nowIso : legacyWindowStart, end: windowEnd },
      candidates: candidates.length,
      count: targets.length,
      // 창에 걸린 전원을 판정 근거와 함께 보여준다 — 제외 사유 검증용
      recipients: candidates.map((p) => ({
        email: p.email,
        credits: p.credits,
        expires_at: p.expires_at,
        marketing_opt_in: p.marketing_opt_in === true,
        confirmed: confirmedById.get(p.id) === true,
        has_paid: paidUserIds.has(p.id),
        recent_regrant: recentRegrantIds.has(p.id), // 재지급 7일 내 → 광고형 억제 사유
        // marketing=광고형, neutral=중립형, null=발송 안 함
        send: decideKind(p),
      })),
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 키가 없으면 발송만 건너뛴다 — cron 자체는 정상 종료해 알람 소음을 줄인다.
    return NextResponse.json(
      { error: "RESEND_API_KEY 미설정 — 발송 건너뜀", count: targets.length },
      { status: 503 }
    );
  }

  let sent = 0;
  const failed: string[] = [];
  for (const p of targets) {
    const { subject, html } =
      p.kind === "marketing"
        ? buildMarketingEmail(p.id, p.credits, p.expires_at)
        : buildNeutralEmail(p.credits, p.expires_at);
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // 같은 만료일에 대한 재시도가 중복 메일이 되지 않게 한다.
          // ⚠️ 이것만 믿으면 안 된다 — Resend 멱등키 보관은 24시간 수준이고 이 cron 도
          // 하루 1회라, 마커 기록이 실패한 경우의 재시도는 경계를 넘길 수 있다.
          // 중복 방지의 주 수단은 어디까지나 expiry_reminder_sent_at 마커다.
          "Idempotency-Key": `expiry-reminder:${p.id}:${p.expires_at}`,
        },
        body: JSON.stringify({
          from: FROM,
          reply_to: REPLY_TO,
          to: p.email,
          subject,
          html,
        }),
      });
      if (resp.ok) {
        sent += 1;
        // 발송 성공을 기록한다 — 실패해도 메일은 이미 나갔으므로 경고만 남긴다.
        // (기록 실패 시 최악은 다음 실행의 중복 시도인데, 위 Idempotency-Key 가 막는다)
        if (usingMarker) {
          const { error: markError } = await supabase
            .from("profiles")
            .update({ expiry_reminder_sent_at: new Date().toISOString() })
            .eq("id", p.id);
          if (markError) {
            console.warn("[expiry-reminder] 발송 기록 실패", {
              user_id: p.id,
              error: markError.message,
            });
          }
        }
      } else {
        failed.push(p.email);
      }
    } catch {
      failed.push(p.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  // failed 가 남아도 마커를 안 찍었으므로 다음 실행이 자동으로 재시도한다
  // (0024 적용 전에는 재시도 없이 유실됐다).
  return NextResponse.json({
    count: targets.length,
    sent,
    failed,
    deferred, // 발송 상한 초과로 다음 실행에 넘긴 수 (마커 미기록이라 유실 아님)
    retryable: usingMarker,
  });
}
