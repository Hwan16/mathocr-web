import { NextResponse } from "next/server";

// 앱 [도움말] 버튼(v2.1.2)의 고정 목적지 — 사용법 안내로 리다이렉트한다.
// 앱에는 이 주소만 심어 두므로, 더 나은 가이드·새 영상이 생기면 여기 대상만
// 바꾸면 된다(앱 재배포 불필요). 302(임시)라 브라우저가 영구 캐시하지 않는다.
const USAGE_GUIDE_URL = "https://youtu.be/z33ozMyL-7Y"; // 공식 사용법 영상 (2026-07-18 게시)

export function GET() {
  return NextResponse.redirect(USAGE_GUIDE_URL, 302);
}
