import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";

// 크레딧 만료 임박 안내 (F9) — vercel.json cron이 매일 1회 호출한다.
//
// 대상: 크레딧을 보유하고 유효기간 만료가 REMIND_BEFORE_DAYS일 앞으로 다가온
// 사용자. 조회 창을 [만료 6일 전, 7일 전)으로 잡아 매일 실행 시 사용자당
// 정확히 한 번만 발송된다. (재충전으로 만료일이 미래로 옮겨지면 새 만료일이
// 다가올 때 다시 안내되는데, 이는 의도된 동작)
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

const REMIND_BEFORE_DAYS = 7;
const MAX_PER_RUN = 200; // 안전 상한 (Resend 무료 티어 일 100통 — 초과 시 플랜 확인)
const SITE_URL = "https://mathocr.ai.kr";
const CHARGE_URL = `${SITE_URL}/charge`;
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
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
  const windowStart = new Date(
    Date.now() + (REMIND_BEFORE_DAYS - 1) * dayMs
  ).toISOString();
  const windowEnd = new Date(
    Date.now() + REMIND_BEFORE_DAYS * dayMs
  ).toISOString();

  const supabase = createAdminClient();
  // onboarding_welcome_sent_at(0018)은 온보딩 환영 메일과의 중복 방지용.
  // 0018 미적용 환경에서는 컬럼 없이 재조회해 기존 동작을 유지한다(폴백).
  let { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, credits, expires_at, marketing_opt_in, onboarding_welcome_sent_at")
    .gt("credits", 0)
    .gte("expires_at", windowStart)
    .lt("expires_at", windowEnd)
    .limit(MAX_PER_RUN);

  if (error && /onboarding_welcome_sent_at/.test(error.message)) {
    console.warn("[expiry-reminder] 0018 미적용 — 온보딩 중복 방지 없이 진행");
    const legacy = await supabase
      .from("profiles")
      .select("id, email, credits, expires_at, marketing_opt_in")
      .gt("credits", 0)
      .gte("expires_at", windowStart)
      .lt("expires_at", windowEnd)
      .limit(MAX_PER_RUN);
    profiles = (legacy.data ?? []).map((p) => ({
      ...p,
      onboarding_welcome_sent_at: null,
    }));
    error = legacy.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 온보딩 환영 메일(0018)을 최근 7일 안에 받은 사용자는 건너뛴다 — 환영 메일이
  // 같은 만료일을 이미 고지했기 때문. 얼리버드 무료 크레딧(유효 7일)은 지급
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
    (p) => p.email && p.expires_at && !welcomeRecent(p)
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

  const targets = candidates
    .map((p) => ({ ...p, kind: decideKind(p) }))
    .filter((p): p is typeof p & { kind: "marketing" | "neutral" } => p.kind !== null);

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY, // 운영 점검용 (값은 노출 안 함)
      window: { start: windowStart, end: windowEnd },
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
        },
        body: JSON.stringify({ from: FROM, to: p.email, subject, html }),
      });
      if (resp.ok) {
        sent += 1;
      } else {
        failed.push(p.email);
      }
    } catch {
      failed.push(p.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({ count: targets.length, sent, failed });
}
