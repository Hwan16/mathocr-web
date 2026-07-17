import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// CSP 위반 보고 수신 (LA-10) — 브라우저가 자동 POST하는 공개 엔드포인트.
// Report-Only 단계에서 허용 목록 누락을 Vercel 로그로 관찰하는 용도라
// 저장은 하지 않고 구조화 로그만 남긴다. 공개 엔드포인트이므로 IP당
// 전송량을 제한하고 본문 크기를 캡한다 (스팸이 로그를 덮는 것 방지).

const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = await checkRateLimit(`csp-report:${ip}`, 10, 60_000);
  if (!allowed) {
    return new NextResponse(null, { status: 204 }); // 조용히 무시
  }

  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 204 });
    }
    const body = JSON.parse(text) as {
      "csp-report"?: Record<string, unknown>;
    };
    const r = body["csp-report"];
    if (r) {
      // 관찰에 필요한 필드만 — 쿼리스트링 등 민감할 수 있는 나머지는 버린다
      console.warn("[csp-report]", {
        violated: r["violated-directive"],
        blocked: r["blocked-uri"],
        document: typeof r["document-uri"] === "string"
          ? (r["document-uri"] as string).split("?")[0]
          : r["document-uri"],
      });
    }
  } catch {
    // 형식이 다른 보고(브라우저별 편차)는 무시
  }
  return new NextResponse(null, { status: 204 });
}
