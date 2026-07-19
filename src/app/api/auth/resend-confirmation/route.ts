import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeEmailAlias } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

// 이메일 인증(가입 확인) 메일 재발송 — 인증 메일 유실 시 퍼널 이탈 방지.
//
// 남발 방어 3중:
//  1. 서버 rate limit (이 라우트, Upstash) — IP당 10건/시간 + 이메일당 1건/60초·5건/시간.
//     이메일 키는 normalizeEmailAlias 로 접어 +alias·gmail 점 변형 우회를 막는다.
//  2. Supabase(GoTrue) 자체의 60초 재발송 제한 — over_email_send_rate_limit.
//  3. 클라이언트 버튼 쿨다운 60초 (ResendConfirmationMail) — UX용 1차 저지선.
//
// 계정 존재 여부 노출 방지: 없는 이메일·이미 인증된 계정도 겉으로는 같은
// 성공 응답을 돌려준다(메일만 안 감). 실제 사유는 서버 로그로만 남긴다.

const IP_LIMIT = 10;
const IP_WINDOW_MS = 60 * 60 * 1000; // 1시간
const MAIL_BURST_LIMIT = 1;
const MAIL_BURST_WINDOW_MS = 60 * 1000; // 60초 (GoTrue 제한과 동일)
const MAIL_HOURLY_LIMIT = 5;
const MAIL_HOURLY_WINDOW_MS = 60 * 60 * 1000;

// 성공/차단과 무관하게 항상 같은 안내 — 받은편지함 확인 유도까지 겸한다.
const GENERIC_OK_MESSAGE =
  "가입된 미인증 계정이라면 인증 메일을 다시 보냈어요. 몇 분 안에 오지 않으면 스팸함을 확인해주세요. 이미 인증을 마쳤다면 바로 로그인하면 됩니다.";

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function tooMany(retryAfter: number, message: string) {
  return NextResponse.json(
    { error: message, retry_after: retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export async function POST(request: NextRequest) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json(
      { error: "요청을 읽을 수 없습니다." },
      { status: 400 }
    );
  }

  if (typeof email !== "string" || !email.trim() || email.length > 255) {
    return NextResponse.json(
      { error: "이메일을 입력해주세요." },
      { status: 400 }
    );
  }
  const trimmedEmail = email.trim();
  const normalized = normalizeEmailAlias(trimmedEmail);
  if (!normalized) {
    return NextResponse.json(
      { error: "이메일 형식이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  // rate limit — IP → 이메일(60초) → 이메일(시간) 순으로 검사한다.
  const clientIp = getClientIp(request);
  const ipCheck = await checkRateLimit(
    `resend-confirm:ip:${clientIp ?? "unknown"}`,
    IP_LIMIT,
    IP_WINDOW_MS
  );
  if (!ipCheck.allowed) {
    return tooMany(
      ipCheck.retryAfter,
      "재발송 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
    );
  }
  const burstCheck = await checkRateLimit(
    `resend-confirm:mail-burst:${normalized}`,
    MAIL_BURST_LIMIT,
    MAIL_BURST_WINDOW_MS
  );
  if (!burstCheck.allowed) {
    return tooMany(
      burstCheck.retryAfter,
      "인증 메일은 1분에 한 번만 다시 보낼 수 있어요. 잠시 후 시도해주세요."
    );
  }
  const hourlyCheck = await checkRateLimit(
    `resend-confirm:mail:${normalized}`,
    MAIL_HOURLY_LIMIT,
    MAIL_HOURLY_WINDOW_MS
  );
  if (!hourlyCheck.allowed) {
    return tooMany(
      hourlyCheck.retryAfter,
      "이 이메일로 보낼 수 있는 재발송 횟수를 초과했어요. 1시간 후 다시 시도해주세요."
    );
  }

  const supabase = await createClient();
  const { error: resendError } = await supabase.auth.resend({
    type: "signup",
    email: trimmedEmail,
    options: {
      // 가입(signup 라우트)과 동일한 인증 완료 랜딩 — 전환 집계·배너가 그대로 동작한다.
      emailRedirectTo: `${request.nextUrl.origin}/auth/login?confirmed=1`,
    },
  });

  if (resendError) {
    // GoTrue 자체 발송 제한 — 남발 방어가 겹쳐 동작한 경우라 그대로 429.
    if (
      resendError.code === "over_email_send_rate_limit" ||
      resendError.status === 429
    ) {
      return tooMany(
        60,
        "인증 메일은 1분에 한 번만 다시 보낼 수 있어요. 잠시 후 시도해주세요."
      );
    }
    // 없는 계정·이미 인증됨 등 — 계정 존재 여부가 새지 않게 성공과 같은 응답.
    console.warn("[auth/resend-confirmation] resend skipped", {
      code: resendError.code ?? null,
      status: resendError.status ?? null,
      message: resendError.message,
    });
    return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE });
  }

  return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE });
}
