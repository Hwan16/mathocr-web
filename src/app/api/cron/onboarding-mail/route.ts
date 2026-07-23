import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { REPLY_TO } from "@/lib/mail";

// 온보딩 메일 2통 (마케팅 백로그 §6-2) — vercel.json cron이 매시 30분에 호출한다.
//
// ① 환영 메일: 크레딧 지급(이메일 인증 후 첫 로그인) 직후 1회.
//    "무료 크레딧 N개, M/D까지 — 지금 첫 시험지를 변환해 보세요" + 다운로드·시작 가이드.
//    매시 실행이므로 지급 후 최대 1시간 안에 나간다.
// ② D+4 리마인드: 환영 메일로부터 4일이 지나도 변환 이력이 없는 사용자에게 1회.
//    7일 유효기간을 압박이 아니라 행동 유도로 — 남은 3일 안에 첫 변환을 해보게.
//
// 발송 자격 (두 메일 공통, 정보통신망법 제50조):
//   - profiles.marketing_opt_in = true (LA-09 동의자 한정 — 컨설팅 문서 §6-2 잠긴 스펙)
//   - email_confirmed_at 존재 (LA-09 보강과 동일한 fail-closed — 조회 실패 시 미발송)
//   - 크레딧 보유 + 유효기간 이내 (본문이 만료일을 언급하므로 사실과 어긋나지 않게)
//   두 메일 모두 이용 유도 CTA가 있는 광고성 정보 → 제목 "(광고)" + 수신거부 링크
//   + 발신 사업자 표기 (expiry-reminder의 광고형 템플릿과 동일한 요건).
//
// 정확히 1회 보장: profiles.onboarding_welcome_sent_at / onboarding_reminder_sent_at
// (0018). 발송 성공 직후 기록한다 — 기록 실패 시 다음 실행에서 1회 재발송될 수
// 있으나(가능성 낮음), 발송 실패를 기록해 버려 메일이 영영 안 가는 것보다 낫다.
//
// 만료 안내(expiry-reminder)와의 중복 방지: 얼리버드 무료 크레딧은 유효기간이
// 7일이라 지급 다음 날 곧바로 "만료 7일 전" 창에 걸린다. 환영 메일이 만료일을
// 이미 고지하므로, expiry-reminder는 최근 7일 내 환영 메일을 받은 사용자를
// 건너뛴다 (해당 로직은 expiry-reminder 쪽에 있음).
//
// 0018 마이그레이션 미적용 환경: 조회가 컬럼 부재로 실패하면 발송하지 않고
// 503 migration_pending을 반환한다 (fail-closed — 중복 발송 위험 원천 차단).

export const dynamic = "force-dynamic";

const WELCOME_LOOKBACK_DAYS = 7; // 가입 7일 이전 계정은 환영 대상에서 제외 (롤아웃 시 과거 가입자 일괄 발송 방지)
const REMINDER_AFTER_DAYS = 4; // 환영 메일 후 4일 경과 시 리마인드
const REMINDER_STALE_DAYS = 6; // 6일이 지났으면 리마인드도 보내지 않음 (만료 직전·직후의 뒷북 방지)
const MAX_PER_KIND = 50; // 실행당 발송 상한 (Resend 일 한도 보호 — 시간당 실행이라 밀린 분은 다음 시간에)
const SITE_URL = "https://mathocr.ai.kr";
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

function adFooterHtml(userId: string): string {
  // CRON_SECRET 인증을 통과한 뒤라 토큰은 항상 생성되지만, 만약을 대비해
  // 토큰이 없으면 수신거부 링크 없는 광고 메일이 나가지 않도록 마이페이지로 안내한다.
  const token = unsubscribeToken(userId, "user");
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  return `
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 보유 크레딧 안내와 이용 안내를 담아
    보내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>`;
}

function headerHtml(): string {
  return `
  <p style="font-size:18px;font-weight:700;margin:0 0 4px;">
    AI Math<span style="color:#7c3aed;">OCR</span>
  </p>`;
}

// ① 환영 메일 — 지급 사실 + 만료일 + 첫 변환 3단계 + 다운로드 CTA
function buildWelcomeEmail(userId: string, credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const subject = `(광고) [AI MathOCR] 무료 크레딧 ${credits}개 지급 완료 — ${dateStr}까지 사용할 수 있어요`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${headerHtml()}
  <h1 style="font-size:20px;margin:20px 0 12px;">무료 크레딧이 들어왔어요 🎉</h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.<br />가입해 주셔서 감사합니다.</p>
  <div style="background:#f5f3ff;border-radius:12px;padding:16px 20px;margin:0 0 16px;">
    <p style="margin:0;font-size:15px;">
      무료 크레딧 <strong>${credits}개</strong>(1크레딧 = 문제 1개)가 지급되었고,<br />
      <strong style="color:#7c3aed;">${dateStr}</strong>까지 사용하실 수 있습니다.
    </p>
  </div>
  <p style="margin:0 0 16px;">
    사용 기간이 길지 않으니, 갖고 계신 시험지 한 세트로 지금 바로
    시작해 보세요. <strong>처음이어도 2분이면 충분합니다.</strong>
  </p>
  <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
    <p style="margin:0 0 8px;font-weight:700;">첫 변환, 이렇게 하면 됩니다</p>
    <p style="margin:0;font-size:14px;color:#3f3f46;">
      1️⃣ 아래 버튼으로 프로그램을 설치하고 로그인<br />
      2️⃣ 시험지 PDF나 사진을 올리고, 문제 영역을 드래그로 지정<br />
      3️⃣ [변환하기] — 수식까지 편집 가능한 한글(HWP) 파일 완성
    </p>
  </div>
  <a href="${SITE_URL}/#download"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    프로그램 다운로드
  </a>
  <p style="margin:12px 0 0;text-align:center;font-size:13px;">
    <a href="${SITE_URL}/#guide" style="color:#7c3aed;">📺 2분 사용법 영상 보기</a>
  </p>
${adFooterHtml(userId)}
</div>`;
  return { subject, html };
}

// ② D+4 리마인드 — 아직 변환 이력이 없는 사용자에게, 남은 기간 안내 + 재시도 유도
function buildReminderEmail(userId: string, credits: number, expiresAtIso: string) {
  const dateStr = formatKst(expiresAtIso);
  const daysLeft = Math.max(
    1,
    Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );
  const subject = `(광고) [AI MathOCR] 무료 크레딧 ${credits}개가 아직 그대로예요 — ${dateStr}에 사라집니다`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
${headerHtml()}
  <h1 style="font-size:20px;margin:20px 0 12px;">무료 크레딧, 아직 사용 전이시네요</h1>
  <p style="margin:0 0 16px;">안녕하세요, AI MathOCR입니다.</p>
  <div style="background:#f5f3ff;border-radius:12px;padding:16px 20px;margin:0 0 16px;">
    <p style="margin:0;font-size:15px;">
      무료 크레딧 <strong>${credits}개</strong>가 남아 있고,
      <strong style="color:#7c3aed;">${dateStr}</strong>(약 ${daysLeft}일 뒤)에 만료됩니다.<br />
      만료된 크레딧은 복구되지 않습니다.
    </p>
  </div>
  <p style="margin:0 0 16px;">
    시험지 한 장만 변환해 보셔도 이 프로그램이 시간을 얼마나 아껴 주는지
    바로 아실 수 있어요. <strong>처음이어도 2분이면 충분합니다</strong> —
    사용법 영상을 보며 그대로 따라 해 보세요.
  </p>
  <a href="${SITE_URL}/#download"
     style="display:block;text-align:center;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:700;">
    프로그램 다운로드
  </a>
  <p style="margin:12px 0 0;text-align:center;font-size:13px;">
    <a href="${SITE_URL}/#guide" style="color:#7c3aed;">📺 2분 사용법 영상 보기</a>
  </p>
${adFooterHtml(userId)}
</div>`;
  return { subject, html };
}

type ProfileRow = {
  id: string;
  email: string | null;
  credits: number;
  expires_at: string | null;
  marketing_opt_in: boolean | null;
  created_at: string;
  onboarding_welcome_sent_at: string | null;
  onboarding_reminder_sent_at: string | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";

  const dayMs = 24 * 60 * 60 * 1000;
  const supabase = createAdminClient();

  // ── ① 환영 메일 후보: 동의 + 미발송 + 최근 가입 + 유효한 크레딧 보유 ──
  const { data: welcomeRows, error: welcomeError } = await supabase
    .from("profiles")
    .select(
      "id, email, credits, expires_at, marketing_opt_in, created_at, onboarding_welcome_sent_at, onboarding_reminder_sent_at"
    )
    .eq("marketing_opt_in", true)
    .is("onboarding_welcome_sent_at", null)
    .gt("credits", 0)
    .gte("created_at", new Date(Date.now() - WELCOME_LOOKBACK_DAYS * dayMs).toISOString())
    .limit(MAX_PER_KIND);

  if (welcomeError) {
    // 0018 미적용(컬럼 부재)이면 발송 없이 종료 — fail-closed
    const migrationPending = /onboarding_/.test(welcomeError.message);
    console.warn("[onboarding-mail] welcome query failed", {
      error: welcomeError.message,
      migrationPending,
    });
    return NextResponse.json(
      { error: welcomeError.message, migration_pending: migrationPending },
      { status: 503 }
    );
  }

  // ── ② 리마인드 후보: 동의 + 환영 발송 4~6일 경과 + 리마인드 미발송 + 유효 크레딧 ──
  const { data: reminderRows, error: reminderError } = await supabase
    .from("profiles")
    .select(
      "id, email, credits, expires_at, marketing_opt_in, created_at, onboarding_welcome_sent_at, onboarding_reminder_sent_at"
    )
    .eq("marketing_opt_in", true)
    .is("onboarding_reminder_sent_at", null)
    .not("onboarding_welcome_sent_at", "is", null)
    .lte("onboarding_welcome_sent_at", new Date(Date.now() - REMINDER_AFTER_DAYS * dayMs).toISOString())
    .gt("onboarding_welcome_sent_at", new Date(Date.now() - REMINDER_STALE_DAYS * dayMs).toISOString())
    .gt("credits", 0)
    .limit(MAX_PER_KIND);

  if (reminderError) {
    console.warn("[onboarding-mail] reminder query failed", {
      error: reminderError.message,
    });
    return NextResponse.json({ error: reminderError.message }, { status: 503 });
  }

  // 유효기간 필터 — 본문이 만료일을 안내하므로 만료일이 없거나 지난 계정은 제외
  // (Date.parse 비교 — DB의 "+00:00" 표기와 JS의 "Z" 표기가 섞여도 안전)
  const nowMs = Date.now();
  const stillValid = (p: ProfileRow): p is ProfileRow & { email: string; expires_at: string } =>
    !!p.email && !!p.expires_at && Date.parse(p.expires_at) > nowMs;
  const welcomeCandidates = (welcomeRows ?? []).filter(stillValid);
  const reminderCandidates = (reminderRows ?? []).filter(stillValid);

  // ── 이메일 인증 확인 (LA-09 보강과 동일) — 미인증·조회 실패는 발송 제외 ──
  const confirmedById = new Map<string, boolean>();
  for (const p of [...welcomeCandidates, ...reminderCandidates]) {
    if (confirmedById.has(p.id)) continue;
    let confirmed = false;
    try {
      const { data: userData, error: userError } =
        await supabase.auth.admin.getUserById(p.id);
      if (userError) {
        console.warn("[onboarding-mail] user lookup failed — skipping (fail-closed)", {
          user_id: p.id,
          error: userError.message,
        });
      } else {
        confirmed = !!userData?.user?.email_confirmed_at;
      }
    } catch (lookupError) {
      console.warn("[onboarding-mail] user lookup threw — skipping (fail-closed)", {
        user_id: p.id,
        error: lookupError instanceof Error ? lookupError.message : String(lookupError),
      });
    }
    confirmedById.set(p.id, confirmed);
  }

  // ── 리마인드 한정: 변환 이력(started/completed/failed 불문)이 있으면 "사용자"로
  // 보고 제외한다. 조회 실패 시 이번 실행은 전부 건너뜀 — 매시 재시도되므로
  // 창(4~6일)이 넉넉해 손실 없음 (fail-closed)
  let usedUserIds = new Set<string>();
  let conversionsLookupOk = true;
  if (reminderCandidates.length > 0) {
    const { data: convRows, error: convError } = await supabase
      .from("conversions")
      .select("user_id")
      .in("user_id", reminderCandidates.map((p) => p.id));
    if (convError) {
      conversionsLookupOk = false;
      console.warn("[onboarding-mail] conversions lookup failed — skipping reminders", {
        error: convError.message,
      });
    }
    for (const row of convRows ?? []) {
      if (row.user_id) usedUserIds.add(row.user_id);
    }
  }

  const welcomeTargets = welcomeCandidates.filter((p) => confirmedById.get(p.id));
  const reminderTargets = conversionsLookupOk
    ? reminderCandidates.filter(
        (p) => confirmedById.get(p.id) && !usedUserIds.has(p.id)
      )
    : [];

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY,
      welcome: {
        count: welcomeTargets.length,
        candidates: welcomeCandidates.map((p) => ({
          email: p.email,
          credits: p.credits,
          expires_at: p.expires_at,
          confirmed: confirmedById.get(p.id) === true,
          send: confirmedById.get(p.id) === true,
        })),
      },
      reminder: {
        count: reminderTargets.length,
        conversionsLookupOk,
        candidates: reminderCandidates.map((p) => ({
          email: p.email,
          credits: p.credits,
          expires_at: p.expires_at,
          welcome_sent_at: p.onboarding_welcome_sent_at,
          confirmed: confirmedById.get(p.id) === true,
          used: usedUserIds.has(p.id),
          send:
            conversionsLookupOk &&
            confirmedById.get(p.id) === true &&
            !usedUserIds.has(p.id),
        })),
      },
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "RESEND_API_KEY 미설정 — 발송 건너뜀",
        welcome: welcomeTargets.length,
        reminder: reminderTargets.length,
      },
      { status: 503 }
    );
  }

  async function sendAndMark(
    targets: (ProfileRow & { email: string; expires_at: string })[],
    kind: "welcome" | "reminder"
  ): Promise<{ sent: number; failed: string[] }> {
    let sent = 0;
    const failed: string[] = [];
    for (const p of targets) {
      const { subject, html } =
        kind === "welcome"
          ? buildWelcomeEmail(p.id, p.credits, p.expires_at)
          : buildReminderEmail(p.id, p.credits, p.expires_at);
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
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
          const column =
            kind === "welcome"
              ? "onboarding_welcome_sent_at"
              : "onboarding_reminder_sent_at";
          const { error: markError } = await supabase
            .from("profiles")
            .update({ [column]: new Date().toISOString() })
            .eq("id", p.id);
          if (markError) {
            // 기록 실패 = 다음 실행에서 1회 중복 발송 가능성 — 크게 남겨 추적
            console.error("[onboarding-mail] sent but mark failed", {
              user_id: p.id,
              kind,
              error: markError.message,
            });
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
    return { sent, failed };
  }

  const welcomeResult = await sendAndMark(welcomeTargets, "welcome");
  const reminderResult = await sendAndMark(reminderTargets, "reminder");

  console.log("[onboarding-mail] run complete", {
    welcome_sent: welcomeResult.sent,
    reminder_sent: reminderResult.sent,
    welcome_failed: welcomeResult.failed.length,
    reminder_failed: reminderResult.failed.length,
  });

  return NextResponse.json({
    welcome: { count: welcomeTargets.length, ...welcomeResult },
    reminder: { count: reminderTargets.length, ...reminderResult },
  });
}
