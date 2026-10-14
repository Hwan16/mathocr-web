"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { flushNaverWcsQueue } from "@/lib/naver-wcs";
import { isInternalVisitor } from "@/lib/internal-visitor";

// 네이버 프리미엄 로그분석 (검색광고 전환 추적) — 검색어 단위로 가입·구매 전환을
// 연결해, 네이버 광고 판정(키워드·제외 검색어)을 추측이 아니라 전환 수치로 내리게 한다.
//
// 공통 스크립트 자체는 루트 레이아웃이 페이지 원본에 넣는다(lib/naver-wcs.ts naverWcsInlineScript).
// 이 컴포넌트는 페이지 이동(PV)과 밀린 전환 재생만 맡는다.
// NEXT_PUBLIC_NAVER_WCS_ID(광고시스템 [도구 > 프리미엄 로그 분석]에서 발급되는
// 사이트 식별자)가 설정된 프로덕션 빌드에서만 동작한다 — ID가 없으면 아무것도
// 하지 않으므로 발급 전에 배포해도 안전하다(잠자는 상태, MetaPixel과 동일 패턴).
// ⚠️ 활성화 전에 개인정보처리방침 제7조의2(네이버 병기 — 2026-07-21 개정)가
// 배포되어 있어야 한다 — 이 컴포넌트와 같은 커밋에 반영됨.
const WCS_ID = process.env.NEXT_PUBLIC_NAVER_WCS_ID;

type WcsWindow = Window & {
  wcs?: {
    inflow?: (domain?: string) => void;
    trans?: (conv: Record<string, unknown>) => void;
  };
  wcs_add?: Record<string, string>;
  wcs_do?: () => void;
};

export default function NaverWcs() {
  const pathname = usePathname();
  const active = Boolean(WCS_ID) && process.env.NODE_ENV === "production";
  const initialized = useRef(false);
  // 최초 PV는 스크립트 onload에서 보내므로, pathname 이펙트의 첫 실행은 건너뛴다
  const firstPathSkipped = useRef(false);
  const loaded = useRef(false);

  // 최초 마운트: 공통 스크립트·계정 연결·최초 PV는 루트 레이아웃이 페이지 원본에서 이미 처리했다
  // (2026-10-15 — 네이버 설치 확인이 원본의 스크립트를 찾도록). 여기서는 준비됐는지만 확인하고
  // 밀린 전환을 재생한다. 광고 차단 등으로 wcs 가 없으면 아무것도 하지 않는다.
  useEffect(() => {
    // 운영자 기기는 기록하지 않는다 → 이후 PV·전환 호출도 전부 무동작
    if (!active || initialized.current || isInternalVisitor()) return;
    initialized.current = true;
    const w = window as unknown as WcsWindow;
    if (!w.wcs) return;
    loaded.current = true;
    // 스크립트 로드 전에 발생한 전환(결제 성공 페이지 직행 등)을 재생
    flushNaverWcsQueue();
  }, [active]);

  // 페이지 이동마다 PV (App Router 클라이언트 라우팅은 최초 로드만으로 안 잡힘 —
  // MetaPixel과 동일한 이유)
  useEffect(() => {
    if (!active) return;
    if (!firstPathSkipped.current) {
      firstPathSkipped.current = true;
      return;
    }
    if (!loaded.current) return;
    (window as unknown as WcsWindow).wcs_do?.();
  }, [active, pathname]);

  return null;
}
