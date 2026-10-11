import { NextResponse } from "next/server";
import { currentAppNotice } from "@/lib/app-notice";

// 데스크톱 앱(v2.4.5+) 시작 공지 — 로그인 없이 읽는 공개 정보. 내용은 lib/app-notice.ts.
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(
    { notice: currentAppNotice() },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } }
  );
}
