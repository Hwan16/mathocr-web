"use client";

import { useEffect } from "react";

// 아이콘 자체 번들 (LA-10) — jsDelivr CDN 스크립트 + api.iconify.design 런타임
// 조회를 제거하고, 사용하는 solar 아이콘 6종의 데이터를 저장소에 내장한다.
// 새 아이콘을 추가하면 src/lib/solar-icons.json에도 추가해야 한다 (누락 시
// 아이콘이 빈 칸으로 렌더링됨 — 외부 API 폴백은 CSP가 차단).
import solarIcons from "@/lib/solar-icons.json";

export default function IconifyProvider() {
  useEffect(() => {
    (async () => {
      // 웹 컴포넌트 등록(iconify-icon 커스텀 엘리먼트)은 클라이언트 전용이라
      // 동적 import — SSR 번들에 web component 코드가 끌려가지 않게 한다.
      // 등록된 컬렉션에 있는 아이콘은 외부 API 조회 없이 즉시 렌더링된다.
      const { addCollection } = await import("iconify-icon");
      addCollection(solarIcons);
    })();
  }, []);

  return null;
}
