"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// 방문 통계·광고 추적을 끄는 화면 — 주소 자체가 비밀인 카카오톡 '받기 링크'(/s/<토큰>, D-054).
// 추적 스크립트는 현재 주소를 외부(구글·메타·네이버)로 보내므로, 토큰이 남지 않게 아예 싣지 않는다.
// 네이버 공통 스크립트는 서버에서 그려지므로 lib/naver-wcs.ts 의 인라인 스크립트가 같은 경로를 따로 건너뛴다.
export function isPrivatePath(pathname: string | null): boolean {
  return Boolean(pathname && pathname.startsWith("/s/"));
}

export default function TrackingGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isPrivatePath(pathname) ? null : <>{children}</>;
}
