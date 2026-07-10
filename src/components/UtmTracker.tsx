"use client";

import { useEffect } from "react";
import { captureUtmFromUrl } from "@/lib/utm";

// 첫 페이지 로드 시 URL의 UTM 파라미터를 localStorage에 저장하는 무표시 컴포넌트.
// 광고 랜딩이 홈이 아닐 수도 있으므로 루트 레이아웃에서 전역으로 마운트한다.
export default function UtmTracker() {
  useEffect(() => {
    captureUtmFromUrl();
  }, []);
  return null;
}
