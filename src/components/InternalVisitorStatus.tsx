"use client";

import { useEffect, useState } from "react";
import { INTERNAL_VISITOR_KEY, INTERNAL_VISITOR_PATH } from "@/lib/internal-visitor";

// /internal 화면 — 실제 저장·해제는 루트 레이아웃의 부트스트랩 스크립트가
// 페이지 로드 시점에 이미 끝냈다. 여기서는 결과만 보여주고, 전환은 전체
// 새로고침(location.replace)으로 부트스트랩을 다시 태운다.
type Status = "checking" | "excluded" | "included" | "unavailable";

export default function InternalVisitorStatus() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    try {
      setStatus(
        window.localStorage.getItem(INTERNAL_VISITOR_KEY) === "1"
          ? "excluded"
          : "included"
      );
    } catch {
      setStatus("unavailable");
    }
  }, []);

  if (status === "checking") return null;

  if (status === "unavailable") {
    return (
      <p className="text-sm text-zinc-600 leading-relaxed">
        이 브라우저는 저장 공간을 쓸 수 없어 설정하지 못했어요. 사생활 보호(시크릿)
        모드라면 일반 창에서 다시 열어주세요.
      </p>
    );
  }

  const excluded = status === "excluded";
  return (
    <>
      <div className="text-3xl mb-3" aria-hidden>
        {excluded ? "✅" : "↩️"}
      </div>
      <h1 className="text-xl font-bold text-zinc-900 mb-2">
        {excluded
          ? "이 브라우저는 방문 통계에서 제외됐어요"
          : "이 브라우저는 다시 방문 통계에 포함돼요"}
      </h1>
      <p className="text-sm text-zinc-600 leading-relaxed mb-6">
        {excluded
          ? "이제 이 브라우저에서 홈페이지를 봐도 방문·클릭 통계에 잡히지 않아요. 다른 브라우저나 카톡·쓰레드 앱 안 화면은 따로 한 번씩 열어야 해요. 방문 기록을 지우면 다시 열어주세요."
          : "이 브라우저의 방문이 다시 통계에 잡혀요."}
      </p>
      <button
        type="button"
        onClick={() =>
          window.location.replace(
            excluded ? `${INTERNAL_VISITOR_PATH}?off=1` : INTERNAL_VISITOR_PATH
          )
        }
        className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700"
      >
        {excluded ? "다시 통계에 포함하기" : "다시 제외하기"}
      </button>
    </>
  );
}
