import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribeToken } from "@/lib/unsubscribe";
import { normalizeEmailAlias } from "@/lib/email";

// 만료 크레딧 자동 재지급 (2026-07-22 결정) — vercel.json cron이 매일 1회 호출한다.
//
// 대상: 최근 REGRANT_WINDOW_DAYS일 안에 유효기간이 지났고, 만료 시점 잔여 크레딧이
//       MIN_LOST(10) 이상인 계정. (profiles.credits 는 만료 후에도 다음 충전 전까지
//       만료 당시 값이 남아 있어 "얼마나 날렸는지"를 그대로 읽을 수 있다)
//       9크레딧 이하 손실은 대상이 아니다.
//
//       시간창을 두는 이유(2026-07-22 리뷰): 재지급받은 계정이 그 30크레딧을 다시
//       만료로 날리면 (credits=30, expires_at=지급+7일)로 후보 조건에 영원히 재진입
//       하는데, 이런 '이미 받은' 행이 정렬(만료일 오래된 순) 맨 앞에 누적되면
//       한도(limit)를 전부 차지해 새 대상자가 영영 밀려난다. 최근 만료만 보면
//       이런 행은 30일 뒤 창 밖으로 빠진다. 페이지네이션(아래)은 그 안의 잔여
//       점유도 건너뛴다.
//
// 지급: re_earlybird 코드(30크레딧·유효 7일)를 'system' 소스로 상환(0022).
//   - 계정당 평생 1회 — promo_redemptions 의 user_id 중복 검사가 보장. 재지급분을
//     다시 만료로 날려도 두 번째는 없다(무한 재지급 루프 차단).
//   - normalized_email 도 공개 상환 경로와 동일하게 기록·검사한다 — 탈퇴 후 같은
//     이메일(알리아스 포함)로 재가입해 다시 받는 경로 차단 (2026-07-22 리뷰).
//     수집 단계에서도 같은 검사를 해 가드에 걸릴 행이 지급·메일 슬롯을 매일
//     점유하는 것을 막는다.
//   - 코드는 항상 비활성(is_active=false) — 마이페이지·가입 경로로는 상환 불가.
//
// 메일 분기 (정보통신망법 제50조 — expiry-reminder 와 동일한 LA-09 기준):
//   - marketing_opt_in=true → "(광고)" 제목 + 수신거부 링크 + 발신 사업자 표기로 재지급 안내.
//   - false/null → 메일 없이 조용히 지급만 한다. 혜택 안내는 광고성 정보라서
//     비동의자에게는 어떤 형태로도 보내지 않는다(2026-07-22 법률 검토 — 중립형도 없음).
//   - expiry-reminder 는 재지급 후 7일간 광고형 만료 임박 메일을 건너뛴다
//     (재지급 메일이 만료일을 이미 고지 — 이틀 연속 광고 메일 방지).
//
// 메일 유실 방지 (2026-07-22 리뷰 — 지급은 평생 1회라 메일을 놓치면 영영 못 알린다):
//   - RESEND_API_KEY 미설정: 메일이 필요한 대상이 있으면 지급 전에 503으로 중단.
//   - regrant_mail_due 컬럼 조회 실패(0022 미적용·스키마 캐시 미갱신): 메일 대상이
//     있으면 마커를 기록할 수 없으므로 역시 지급 전에 503으로 중단(fail-closed).
//   - 발송 실패: 지급 직후 profiles.regrant_mail_due 에 메일 재료를 기록해 두고
//     발송 성공 시 지운다. 남아 있으면 다음 실행이 재시도한다(최대 MAX_MAIL_ATTEMPTS회,
//     그 사이 수신거부한 계정은 발송 없이 표시만 지운다).
//   - 메일 예산: 옵트인 대상 지급은 실행당 MAX_MAILS_PER_RUN 건까지만 — 예산이 차면
//     "지급 자체를" 다음 실행으로 미뤄 메일 없는 지급을 만들지 않는다. (Resend 무료
//     티어 일 100통을 expiry-reminder 등과 나눠 쓴다)
//
// 이메일 인증 게이트: email_confirmed_at 없는 계정은 지급·메일 모두 제외(fail-closed).
//   타인 이메일 가입 계정에 혜택이 쌓이거나 메일이 나가는 경로 차단 (LA-09).
//
// 0022 미적용 상태에서 돌면: RPC가 invalid_source 를 돌려줘 아무것도 지급되지 않는다.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_LOST = 10; // 이 값 미만 손실은 재지급 대상 아님 (2026-07-22 사용자 결정)
const GRANT_CODE = "re_earlybird";
const REGRANT_WINDOW_DAYS = 30; // 이 기간보다 오래전 만료는 대상 아님 (창 점유 방지 + 윈백 적시성)
const PAGE_SIZE = 200;
const MAX_PAGES = 5; // 한 실행이 훑는 최대 후보 수 = 1000
const MAX_GRANTS_PER_RUN = 200;
const MAX_MAILS_PER_RUN = 40; // 신규 지급 메일 상한 (재시도 몫 MAX_RETRY_MAILS 와 별도)
const MAX_RETRY_MAILS = 40;
const MAX_MAIL_ATTEMPTS = 5; // 이 횟수만큼 재시도해도 실패하면 포기하고 마커를 지운다
const SITE_URL = "https://mathocr.ai.kr";
const FROM = "AI MathOCR <noreply@mathocr.ai.kr>";
// 광고성 메일 발신자 표기 (정보통신망법 시행령 — 전송자 명칭·주소·전화번호)
const BUSINESS_FOOTER =
  "환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994";

const DAY_MS = 24 * 60 * 60 * 1000;

function formatKst(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

// 메일 재시도용 재료 — profiles.regrant_mail_due 에 그대로 저장된다.
type MailDue = {
  lost: number; // 만료로 소멸한 크레딧 수
  lost_at: string; // 만료 시각 ISO
  new_expires: string; // 재지급 크레딧 만료 시각 ISO
  attempts?: number; // 실패한 발송 시도 횟수
};

function isMailDue(v: unknown): v is MailDue {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lost === "number" &&
    typeof o.lost_at === "string" &&
    typeof o.new_expires === "string"
  );
}

// 광고형 (마케팅 동의자 전용) — 재지급 안내 + 이용 유도이므로
// 제목 "(광고)" 표기 + 수신거부 링크 + 발신 사업자 표기를 붙인다.
function buildRegrantEmail(userId: string, due: MailDue, grantCredits: number) {
  const lostDate = formatKst(due.lost_at);
  const newDate = formatKst(due.new_expires);
  const subject = `(광고) [AI MathOCR] 만료된 크레딧 대신 새 ${grantCredits}크레딧을 드렸어요`;
  const token = unsubscribeToken(userId, "user");
  // 영문 병기(Unsubscribe) — 정보통신망법 시행령의 한·영 표기 권고 반영
  const unsubscribeHtml = token
    ? `<a href="${SITE_URL}/api/unsubscribe?kind=user&uid=${userId}&token=${token}" style="color:#a1a1aa;text-decoration:underline;">수신거부 Unsubscribe</a>`
    : `수신거부 Unsubscribe: <a href="${SITE_URL}/dashboard" style="color:#a1a1aa;text-decoration:underline;">마이페이지 &gt; 계정 설정</a>`;
  const html = `
<div style="max-width:520px;margin:0 auto;padding:32px 24px;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;color:#18181b;line-height:1.7;">
  <p style="margin:0 0 16px;font-size:15px;">
    보유하셨던 크레딧 <strong>${due.lost}개</strong>가 ${lostDate}에 유효기간 만료로 소멸되었어요.
  </p>
  <p style="margin:0 0 16px;font-size:15px;">
    다시 써보실 수 있도록 <strong>새 크레딧 ${grantCredits}개</strong>를 지급해 드렸어요.
    지금 로그인하면 바로 확인하실 수 있어요.
  </p>
  <p style="margin:0 0 24px;font-size:14px;color:#52525b;">
    새 크레딧의 유효기간은 <strong>${newDate}까지(지급일로부터 7일)</strong>예요.
    이 재지급은 <strong>계정당 1회</strong> 제공되는 프로모션 혜택으로, 이후 만료 시에는
    반복 지급되지 않아요.
  </p>
  <a href="${SITE_URL}" style="display:inline-block;padding:12px 24px;background:#7c3aed;color:#ffffff;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">
    지금 변환해보기
  </a>
  <p style="margin:24px 0 0;font-size:12px;color:#a1a1aa;">
    본 메일은 마케팅 수신에 동의하신 분께 크레딧 재지급 혜택을 안내드리는 광고성 메일입니다.<br />
    ${BUSINESS_FOOTER}<br />
    문의: aimathocr.official@gmail.com · <a href="${SITE_URL}" style="color:#a1a1aa;">mathocr.ai.kr</a> · ${unsubscribeHtml}
  </p>
</div>`;
  return { subject, html };
}

async function sendMail(apiKey: string, to: string, subject: string, html: string): Promise<boolean> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

type Candidate = {
  id: string;
  email: string;
  credits: number;
  expires_at: string;
  marketing_opt_in: boolean | null;
};

type Scanned = Candidate & {
  grant: boolean;
  mail: boolean;
  skip: "already_granted" | "unconfirmed" | "mail_budget_deferred" | null;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dry") === "1";
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowStartIso = new Date(now - REGRANT_WINDOW_DAYS * DAY_MS).toISOString();

  const supabase = createAdminClient();

  // 마커 갱신 헬퍼 — 실패는 로그만 남긴다(재시도 1회 포함).
  async function setMarker(userId: string, value: MailDue | null): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await supabase
        .from("profiles")
        .update({ regrant_mail_due: value })
        .eq("id", userId);
      if (!error) return true;
      if (attempt === 1) {
        console.warn("[expiry-regrant] mail_due 갱신 실패", {
          user_id: userId,
          clearing: value === null,
          error: error.message,
        });
      }
    }
    return false;
  }

  // (0) 재지급 코드 확인 — 없으면 아무것도 하지 않는다 (0022 마이그레이션 필요)
  const { data: promo, error: promoError } = await supabase
    .from("promo_codes")
    .select("id, credits, validity_days, is_active")
    .eq("code", GRANT_CODE)
    .maybeSingle();
  if (promoError || !promo) {
    return NextResponse.json(
      {
        error: `재지급 코드(${GRANT_CODE}) 조회 실패 — 0022 마이그레이션 적용 여부 확인`,
        detail: promoError?.message ?? "row 없음",
      },
      { status: 500 }
    );
  }
  if (promo.is_active) {
    // 공개 상환이 열려 있으면 코드 유출 시 무제한 지급될 수 있다 — 지급을 멈추고 알린다.
    return NextResponse.json(
      { error: `${GRANT_CODE} 코드가 활성(is_active=true) 상태 — 비활성으로 되돌린 뒤 재실행 필요` },
      { status: 500 }
    );
  }

  // (1) 후보 수집 — 페이지 단위로 훑으면서 제외 사유를 걸러내고 지급 대상을 모은다.
  //     limit 을 먼저 걸고 나중에 거르면 '이미 받은' 행이 창을 점유해 새 대상자가
  //     굶는다(2026-07-22 리뷰) — 반드시 거르면서 모은다.
  const scanned: Scanned[] = [];
  const targets: Scanned[] = [];
  let mailTargets = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, email, credits, expires_at, marketing_opt_in")
      .gte("credits", MIN_LOST)
      .gte("expires_at", windowStartIso)
      .lt("expires_at", nowIso)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true }) // 같은 만료 시각의 페이지 경계 누락/중복 방지
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const pageRows = (rows ?? []).filter((p): p is Candidate => !!p.email && !!p.expires_at);
    if ((rows ?? []).length === 0) break;

    // 이미 재지급받은 계정 — 페이지 단위 일괄 조회 (계정당 평생 1회).
    // user_id 뿐 아니라 normalized_email 로도 걸러, 탈퇴 후 재가입 계정이
    // RPC 가드에 막힐 걸 알면서 지급·메일 슬롯만 매일 점유하는 것을 막는다.
    const redeemedIds = new Set<string>();
    const redeemedNorms = new Set<string>();
    if (pageRows.length > 0) {
      const { data: reds, error: redsError } = await supabase
        .from("promo_redemptions")
        .select("user_id")
        .eq("promo_code_id", promo.id)
        .in("user_id", pageRows.map((p) => p.id));
      if (redsError) {
        // 중복 여부를 모르면 지급하지 않는다(fail-closed)
        return NextResponse.json(
          { error: `redemptions 조회 실패: ${redsError.message}` },
          { status: 500 }
        );
      }
      for (const r of reds ?? []) {
        if (r.user_id) redeemedIds.add(r.user_id);
      }

      const norms = [
        ...new Set(
          pageRows
            .map((p) => normalizeEmailAlias(p.email))
            .filter((n): n is string => !!n)
        ),
      ];
      if (norms.length > 0) {
        const { data: normReds, error: normError } = await supabase
          .from("promo_redemptions")
          .select("normalized_email")
          .eq("promo_code_id", promo.id)
          .in("normalized_email", norms);
        if (normError) {
          return NextResponse.json(
            { error: `redemptions(normalized) 조회 실패: ${normError.message}` },
            { status: 500 }
          );
        }
        for (const r of normReds ?? []) {
          if (r.normalized_email) redeemedNorms.add(r.normalized_email);
        }
      }
    }

    for (const p of pageRows) {
      if (targets.length >= MAX_GRANTS_PER_RUN) break;

      const norm = normalizeEmailAlias(p.email);
      if (redeemedIds.has(p.id) || (norm && redeemedNorms.has(norm))) {
        scanned.push({ ...p, grant: false, mail: false, skip: "already_granted" });
        continue;
      }

      // 이메일 인증 확인 — 미인증(또는 조회 실패)이면 지급·메일 모두 제외 (fail-closed)
      let confirmed = false;
      try {
        const { data: userData, error: userError } = await supabase.auth.admin.getUserById(p.id);
        if (userError) {
          console.warn("[expiry-regrant] user lookup failed — skipping (fail-closed)", {
            user_id: p.id,
            error: userError.message,
          });
        } else {
          confirmed = !!userData?.user?.email_confirmed_at;
        }
      } catch (lookupError) {
        console.warn("[expiry-regrant] user lookup threw — skipping (fail-closed)", {
          user_id: p.id,
          error: lookupError instanceof Error ? lookupError.message : String(lookupError),
        });
      }
      if (!confirmed) {
        scanned.push({ ...p, grant: false, mail: false, skip: "unconfirmed" });
        continue;
      }

      const wantsMail = p.marketing_opt_in === true;
      if (wantsMail && mailTargets >= MAX_MAILS_PER_RUN) {
        // 메일 예산 소진 — 메일 없는 지급을 만들지 않도록 지급 자체를 다음 실행으로 미룬다.
        scanned.push({ ...p, grant: false, mail: false, skip: "mail_budget_deferred" });
        continue;
      }

      if (wantsMail) mailTargets += 1;
      const t: Scanned = { ...p, grant: true, mail: wantsMail, skip: null };
      scanned.push(t);
      targets.push(t);
    }

    if (targets.length >= MAX_GRANTS_PER_RUN) break;
    if ((rows ?? []).length < PAGE_SIZE) break;
  }

  // (2) 지난 실행에서 발송하지 못한 메일 (regrant_mail_due 잔존 표시)
  const { data: dueRows, error: dueError } = await supabase
    .from("profiles")
    .select("id, email, marketing_opt_in, regrant_mail_due")
    .not("regrant_mail_due", "is", null)
    .limit(MAX_RETRY_MAILS);
  const dueColumnMissing = !!dueError && /regrant_mail_due/.test(dueError.message);
  if (dueError && !dueColumnMissing) {
    return NextResponse.json({ error: `mail_due 조회 실패: ${dueError.message}` }, { status: 500 });
  }
  const retryQueue = dueError ? [] : dueRows ?? [];
  // 재시도 중 실제로 API 키·발송이 필요한 것만 (수신거부/무효 마커는 지우기만 하면 됨)
  const actionableRetries = retryQueue.filter(
    (r) => !!r.email && r.marketing_opt_in === true && isMailDue(r.regrant_mail_due)
  );

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      resendKeyConfigured: !!process.env.RESEND_API_KEY, // 운영 점검용 (값은 노출 안 함)
      minLost: MIN_LOST,
      windowDays: REGRANT_WINDOW_DAYS,
      mailDueColumnMissing: dueColumnMissing, // true면 0022 미적용(또는 스키마 캐시 미갱신)
      candidates: scanned.length,
      grantCount: targets.length,
      mailCount: mailTargets,
      mailRetryCount: actionableRetries.length,
      recipients: scanned.map((p) => ({
        email: p.email,
        lost_credits: p.credits,
        expired_at: p.expires_at,
        marketing_opt_in: p.marketing_opt_in === true,
        grant: p.grant,
        mail: p.mail,
        skip: p.skip,
      })),
    });
  }

  // 메일이 필요한 지급이 있는데 마커 컬럼을 못 읽으면(0022 미적용·스키마 캐시 미갱신)
  // 발송 실패를 기록할 수 없다 — 지급 전에 중단한다(fail-closed). 캐시 갱신 후 자연 회복.
  if (dueColumnMissing && mailTargets > 0) {
    return NextResponse.json(
      { error: "regrant_mail_due 컬럼 조회 실패 — 0022 적용·스키마 캐시 갱신 후 재실행", grantCount: targets.length },
      { status: 503 }
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  // 메일이 필요한 작업이 하나라도 있는데 키가 없으면 지급 전에 중단한다(fail-closed).
  // 지급은 평생 1회라, 메일 없이 지급해 버리면 그 사용자에게는 영영 알릴 수 없다.
  if (!apiKey && (mailTargets > 0 || actionableRetries.length > 0)) {
    return NextResponse.json(
      { error: "RESEND_API_KEY 미설정 — 메일 유실 방지를 위해 지급 전 중단", grantCount: targets.length },
      { status: 503 }
    );
  }

  let granted = 0;
  let mailed = 0;
  let mailRetried = 0;
  const grantFailed: string[] = [];
  const mailFailed: string[] = [];

  // (3) 미발송 재시도 — 그 사이 수신거부한 계정·무효 마커는 발송 없이 표시만 지운다.
  for (const row of retryQueue) {
    const due = row.regrant_mail_due;
    if (!isMailDue(due) || row.marketing_opt_in !== true || !row.email) {
      await setMarker(row.id, null);
      continue;
    }
    if ((due.attempts ?? 0) >= MAX_MAIL_ATTEMPTS) {
      // 계속 실패하는 주소(반송 등) — 포기하고 마커를 지워 다른 재시도를 막지 않는다.
      console.warn("[expiry-regrant] 재시도 상한 초과 — 발송 포기", { user_id: row.id });
      await setMarker(row.id, null);
      continue;
    }
    const { subject, html } = buildRegrantEmail(row.id, due, promo.credits);
    if (await sendMail(apiKey as string, row.email, subject, html)) {
      await setMarker(row.id, null);
      mailRetried += 1;
    } else {
      await setMarker(row.id, { ...due, attempts: (due.attempts ?? 0) + 1 });
      mailFailed.push(row.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  // (4) 지급 + 신규 메일
  for (const p of targets) {
    // 지급 — 실패해도 다른 대상은 계속 처리한다. RPC가 원자적으로
    // (redemption 기록 → 크레딧·유효기간 갱신 → payments 기록)을 수행한다.
    const { data: result, error: rpcError } = await supabase.rpc("redeem_promo_code", {
      p_user_id: p.id,
      p_code: GRANT_CODE,
      p_source: "system",
      p_normalized_email: normalizeEmailAlias(p.email),
    });
    if (rpcError || result?.success !== true) {
      const reason = rpcError?.message ?? result?.error ?? "unknown";
      if (result?.error !== "already_redeemed") {
        // already_redeemed 는 수집 단계와의 경합일 뿐이라 실패로 치지 않는다
        console.warn("[expiry-regrant] grant failed", { user_id: p.id, reason });
        grantFailed.push(p.email);
      }
      continue;
    }
    granted += 1;

    // 메일 — 마케팅 동의자에게만. 지급은 이미 끝났으므로 메일 실패가 지급을 되돌리지 않는다.
    if (!p.mail) continue;
    const due: MailDue = {
      lost: p.credits,
      lost_at: p.expires_at,
      new_expires:
        typeof result.expires_at === "string"
          ? result.expires_at
          : new Date(now + (promo.validity_days ?? 7) * DAY_MS).toISOString(),
    };
    // 발송 전에 재시도 표시를 먼저 기록 — 발송 도중 죽어도 다음 실행이 이어받는다.
    const markerSet = await setMarker(p.id, due);
    const { subject, html } = buildRegrantEmail(p.id, due, promo.credits);
    if (await sendMail(apiKey as string, p.email, subject, html)) {
      mailed += 1;
      if (markerSet) {
        await setMarker(p.id, null);
      }
    } else {
      if (!markerSet) {
        // 마커도 없고 발송도 실패 — 이대로면 영영 못 알린다. 마커 기록을 한 번 더 시도.
        await setMarker(p.id, { ...due, attempts: 1 });
      }
      mailFailed.push(p.email);
    }
    // Resend rate limit(초당 2건) 보호
    await new Promise((r) => setTimeout(r, 600));
  }

  return NextResponse.json({
    candidates: scanned.length,
    grantCount: targets.length,
    granted,
    mailed,
    mailRetried,
    grantFailed,
    mailFailed,
  });
}
