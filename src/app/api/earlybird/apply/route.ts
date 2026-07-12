import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeEmailAlias } from "@/lib/email";
import { CONSENT_VERSION } from "@/lib/consent";
import { NextRequest, NextResponse } from "next/server";

// 얼리버드 사전 신청 (0015 — 신청제 전환, 2026-07-11)
// 회원가입이 아니다: 이메일만 받아 명단에 쌓고, 오픈 날 30문제 코드 메일을 보낸다.
// GET  = 접수 상태 (선착순 마감 여부)
// POST = 신청 (이메일 + 수신 동의 — 동의 감사는 user_consents에 user_id null로 기록)

export const dynamic = "force-dynamic";

const APPLY_CAP = 200; // 선착순
const APPLY_IP_LIMIT = 5;
const APPLY_IP_WINDOW_MS = 60 * 60 * 1000; // 1시간

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

function isValidEmail(email: string): boolean {
  // 과하지 않은 형식 검사 — 최종 검증은 오픈 메일 발송 성공 여부가 한다
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

async function appliedCount(admin: ReturnType<typeof createAdminClient>) {
  const { count, error } = await admin
    .from("earlybird_signups")
    .select("id", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

export async function GET() {
  const admin = createAdminClient();
  const count = await appliedCount(admin);
  if (count === null) {
    return NextResponse.json({ error: "상태 조회 실패" }, { status: 500 });
  }
  return NextResponse.json({ open: count < APPLY_CAP });
}

type ApplyBody = {
  email?: string;
  agreed_marketing?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

function normalizeUtm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let cleaned = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code !== 127) cleaned += ch;
  }
  cleaned = cleaned.trim().toLowerCase().slice(0, 100);
  return cleaned || null;
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const rl = await checkRateLimit(
    `earlybird-apply:${clientIp ?? "unknown"}`,
    APPLY_IP_LIMIT,
    APPLY_IP_WINDOW_MS
  );
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "시도가 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const {
    email,
    agreed_marketing,
    utm_source,
    utm_medium,
    utm_campaign,
  }: ApplyBody = await request.json().catch(() => ({}));

  const trimmedEmail = typeof email === "string" ? email.trim() : "";
  if (!isValidEmail(trimmedEmail)) {
    return NextResponse.json(
      { error: "올바른 이메일 주소를 입력해주세요." },
      { status: 400 }
    );
  }
  // 수신 동의가 신청의 전부이므로 서버에서 강제한다
  if (agreed_marketing !== true) {
    return NextResponse.json(
      { error: "오픈 안내 메일 수신에 동의해야 신청할 수 있습니다." },
      { status: 400 }
    );
  }

  const normalizedEmail = normalizeEmailAlias(trimmedEmail);
  if (!normalizedEmail) {
    return NextResponse.json(
      { error: "올바른 이메일 주소를 입력해주세요." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 선착순 마감 확인 (경합 창은 수 ms — 마지막 자리 초과분은 발송 시 한 번 더 걸러진다)
  const count = await appliedCount(admin);
  if (count === null) {
    return NextResponse.json({ error: "신청 처리에 실패했습니다." }, { status: 500 });
  }
  if (count >= APPLY_CAP) {
    return NextResponse.json(
      { error: "full", message: "선착순 200명이 마감되었습니다." },
      { status: 409 }
    );
  }

  const userAgent = request.headers.get("user-agent");
  const utmSource = normalizeUtm(utm_source);

  const { error: insertError } = await admin.from("earlybird_signups").insert([
    {
      email: trimmedEmail,
      normalized_email: normalizedEmail,
      utm_source: utmSource,
      utm_medium: utmSource ? normalizeUtm(utm_medium) : null,
      utm_campaign: utmSource ? normalizeUtm(utm_campaign) : null,
      ip: clientIp,
      user_agent: userAgent,
    },
  ]);

  if (insertError) {
    // unique 위반 = 이미 신청한 이메일(알리아스 변형 포함)
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "already", message: "이미 신청된 이메일입니다. 오픈 소식 메일을 기다려주세요!" },
        { status: 409 }
      );
    }
    console.error("[earlybird/apply] insert failed", { error: insertError.message });
    return NextResponse.json({ error: "신청 처리에 실패했습니다." }, { status: 500 });
  }

  // 수신 동의 감사 기록 (비회원 — user_id null + 이메일 스냅샷)
  const { error: consentError } = await admin.from("user_consents").insert([
    {
      user_id: null,
      email: trimmedEmail,
      doc_type: "marketing",
      version: CONSENT_VERSION,
      agreed: true,
      ip: clientIp,
      user_agent: userAgent,
    },
  ]);
  if (consentError) {
    console.warn("[earlybird/apply] consent record failed", {
      email: trimmedEmail,
      error: consentError.message,
    });
  }

  return NextResponse.json({ success: true });
}
