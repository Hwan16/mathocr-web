import { NextResponse } from "next/server";

// 앱 [도움말] 버튼(v2.1.2)의 고정 목적지 — 사용법 안내로 리다이렉트한다.
// 앱에는 이 주소만 심어 두므로, 더 나은 가이드·새 영상이 생기면 여기 대상만
// 바꾸면 된다(앱 재배포 불필요). 302(임시)라 브라우저가 영구 캐시하지 않는다.
// 2026-10-09: 유튜브 → 홈페이지 #guide 영상(v2.4.1 화면, AI 해설 포함)으로 변경 — 사용자가 유튜브로
// 이탈하지 않게 하고, 영상 안내("[?] 버튼으로 다시 볼 수 있어요")와 같은 영상을 보게 한다(사용자 결정).
// 유튜브 사용법 영상(https://youtu.be/Ca7mlXen6yc, v2.3.3 화면)은 그대로 둔다.
const USAGE_GUIDE_URL = "https://mathocr.ai.kr/#guide";

export function GET() {
  return NextResponse.redirect(USAGE_GUIDE_URL, 302);
}
