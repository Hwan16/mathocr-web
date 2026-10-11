// 앱 시작 공지(v2.4.5+) — 데스크톱 앱이 시작할 때 GET /api/app-notice 로 받아 공지 id 마다 한 번만 띄운다.
// 업데이트 하이라이트 팝업(릴리스 노트 마커)은 "새 버전이 있을 때"만 뜨므로, 최신 버전 사용자·새 설치
// 사용자에게도 한 번 보여 줄 소식은 여기에 둔다. 새 버전 없이 서버 배포만으로 바꾸거나 끌 수 있다.
//
// 규칙
// - id 를 바꾸면 이미 본 사용자에게도 다시 뜬다(앱이 id 별로 '봤음'을 기록). 같은 공지면 id 를 유지할 것.
// - 그림은 https://mathocr.ai.kr/ 아래(web/public)만 — 앱이 다른 주소의 그림은 받지 않는다. 폭 1008px(2배) 권장.
// - 대외 문구라 제목·설명은 사용자 확인 후 바꾼다(하이라이트 마커와 같은 원칙).
import { AI_SOLUTION_RULE } from "./plans";

export type AppNotice = {
  id: string;
  title: string;
  body: string;
  image_url: string;
};

export function currentAppNotice(): AppNotice | null {
  // D-040 AI 해설 출시 기념가 — 기념가가 꺼지면 공지도 함께 내려간다
  if (AI_SOLUTION_RULE.launched && AI_SOLUTION_RULE.promoActive) {
    return {
      id: "ai-solution-promo-2026-10",
      title: `AI 해설 출시 기념가 이벤트 — 문제당 +${AI_SOLUTION_RULE.current}크레딧`,
      body: "해설 PDF가 없어도 AI가 문제별 해설을 써 드려요. 우측 목록의 [💡AI] 칸을 체크하면 변환할 때 함께 들어가요.",
      image_url: "https://mathocr.ai.kr/app-notice/ai-solution-promo-2026-10.png",
    };
  }
  return null;
}
