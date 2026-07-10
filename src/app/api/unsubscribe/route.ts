import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { NextRequest, NextResponse } from "next/server";

// 마케팅 메일 수신거부 (0014) — 메일 하단 링크의 목적지.
//
// 2단계 확인: GET 은 확인 페이지(버튼)만 보여주고, 실제 해제는 POST 로만 수행한다.
// 메일 보안 스캐너(Outlook SafeLinks 등)가 링크를 자동 방문해 의도치 않게
// 수신거부되는 사고를 막기 위함. 토큰은 서버 서명(HMAC)이라 uid 위조로는 못 푼다.

export const dynamic = "force-dynamic";

function page(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" /><title>수신거부 — AI MathOCR</title></head>
<body style="margin:0;background:#fafafa;font-family:'Malgun Gothic',Pretendard,Apple SD Gothic Neo,sans-serif;">
<div style="max-width:420px;margin:80px auto;padding:36px 28px;background:#fff;border:1px solid #e4e4e7;border-radius:16px;text-align:center;color:#18181b;line-height:1.7;">
<p style="font-size:17px;font-weight:700;margin:0 0 20px;">AI Math<span style="color:#7c3aed;">OCR</span></p>
${body}
</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function invalidPage() {
  return page(
    `<p style="margin:0;">유효하지 않은 수신거부 링크입니다.<br />
     메일 하단의 링크를 다시 확인해주세요.</p>`,
    400
  );
}

// 1단계: 확인 페이지 (스캐너 자동 방문으로는 아무 일도 일어나지 않음)
export async function GET(request: NextRequest) {
  const uid = request.nextUrl.searchParams.get("uid") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!uid || !verifyUnsubscribeToken(uid, token)) {
    return invalidPage();
  }
  return page(
    `<p style="margin:0 0 20px;">마케팅·혜택 안내 메일 수신을<br />중단할까요?</p>
     <form method="POST" action="/api/unsubscribe">
       <input type="hidden" name="uid" value="${uid}" />
       <input type="hidden" name="token" value="${token}" />
       <button type="submit" style="background:#7c3aed;color:#fff;border:0;border-radius:10px;padding:12px 28px;font-size:14px;font-weight:700;cursor:pointer;">
         수신거부 확정
       </button>
     </form>
     <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">서비스 이용 관련 필수 안내(만료 예정 등)는 계속 발송됩니다.</p>`
  );
}

// 2단계: 실제 해제
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const uid = String(form?.get("uid") ?? "");
  const token = String(form?.get("token") ?? "");
  if (!uid || !verifyUnsubscribeToken(uid, token)) {
    return invalidPage();
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("email, marketing_opt_in")
    .eq("id", uid)
    .maybeSingle();

  if (error || !profile) {
    return invalidPage();
  }

  if (profile.marketing_opt_in) {
    const { error: updateError } = await admin
      .from("profiles")
      .update({ marketing_opt_in: false })
      .eq("id", uid);
    if (updateError) {
      return page(
        `<p style="margin:0;">처리 중 오류가 발생했습니다.<br />잠시 후 다시 시도해주세요.</p>`,
        500
      );
    }
    // 철회 감사 기록 (agreed=false)
    await admin.from("user_consents").insert([
      {
        user_id: uid,
        email: profile.email,
        doc_type: "marketing",
        version: "2026-07-11",
        agreed: false,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: request.headers.get("user-agent"),
      },
    ]);
  }

  return page(
    `<p style="margin:0 0 8px;font-weight:700;">수신거부가 완료되었습니다.</p>
     <p style="margin:0;font-size:13px;color:#52525b;">더 이상 마케팅·혜택 안내 메일이 발송되지 않습니다.</p>`
  );
}
