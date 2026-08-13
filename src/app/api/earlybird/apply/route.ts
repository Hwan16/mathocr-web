import { NextResponse } from "next/server";

// ── 얼리버드 사전 신청 API — 종료 (2026-07-12 비활성화, 사용자 결정) ──
//
// 이력: 신청제(0015 — 이메일만 받아 오픈 날 코드 메일 발송)는 신청자 0명
// 상태에서 종료됐고(2026-07-11 가입 직결 개편), /earlybird 페이지도 가입
// 페이지로 리다이렉트만 한다. 이 API만 공개로 남아 있어 호출 시 이메일이
// 계속 수집될 수 있고, 안내 문구도 "인증 후 지급"으로 바뀐 현행 정책과
// 어긋나므로 완전히 닫는다 (Codex 리뷰 LA-02 후속).
//
// 얼리버드 혜택도 2026-08-14 종료됐다. 기존 지급 대기자만 보호하고 신규
// 가입자는 상시 무료 체험 15크레딧을 받는다.
// 이전 구현이 필요하면 git 이력(web 2899c57 이전) 참조.

// Response 객체는 요청마다 새로 만들어야 한다 (본문 스트림은 1회용)
function gone(): NextResponse {
  return NextResponse.json(
    {
      error:
        "얼리버드 프로모션은 종료되었습니다. 회원가입 시 무료 체험 15크레딧이 제공됩니다.",
      signup_url: "/auth/signup",
    },
    { status: 410 }
  );
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
