"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// 메타 픽셀 (M6 — docs/MARKETING_2026-07-10.md). 리타게팅 광고(M3)의 전제 인프라.
//
// NEXT_PUBLIC_META_PIXEL_ID 가 설정된 프로덕션 빌드에서만 로드된다 — ID가 없으면
// 아무것도 하지 않으므로 픽셀 발급 전에 배포해도 안전하다(잠자는 상태).
// 활성화 절차: docs/AD_SETUP_GUIDE.md 참고 (Vercel env 설정 → 재배포).
// ⚠️ 활성화 전에 개인정보처리방침 제7조의2(행태정보 고지)가 배포되어 있어야
// 한다 — 2026-07-11 개정으로 이미 반영됨.
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: FbqFn;
  loaded: boolean;
  version: string;
};

type FbqWindow = Window & { fbq?: FbqFn; _fbq?: FbqFn };

// 메타 공식 부트스트랩 스니펫의 TypeScript 이식 — fbevents.js 로드 전 호출을
// queue에 쌓았다가 로드 후 재생하는 구조라 필드 형태를 그대로 유지해야 한다.
function bootstrapFbq(w: FbqWindow) {
  if (w.fbq) return;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
    } else {
      fbq.queue.push(args);
    }
  } as FbqFn;
  fbq.queue = [];
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
}

export default function MetaPixel() {
  const pathname = usePathname();
  const active = Boolean(PIXEL_ID) && process.env.NODE_ENV === "production";
  const initialized = useRef(false);

  // 최초 마운트: 픽셀 초기화 (PageView는 아래 pathname 이펙트가 첫 렌더 포함 전송)
  useEffect(() => {
    if (!active || initialized.current) return;
    initialized.current = true;
    const w = window as unknown as FbqWindow;
    bootstrapFbq(w);
    w.fbq?.("init", PIXEL_ID);
  }, [active]);

  // 페이지 이동마다 PageView (App Router는 클라이언트 라우팅이라 최초 로드만으로는
  // 이후 페이지 이동이 잡히지 않는다)
  useEffect(() => {
    if (!active) return;
    (window as unknown as FbqWindow).fbq?.("track", "PageView");
  }, [active, pathname]);

  return null;
}
