"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// 채널톡 채팅 상담 버튼.
//
// NEXT_PUBLIC_CHANNEL_PLUGIN_KEY 가 설정된 경우에만 로드된다 — 키가 없으면 아무것도
// 하지 않으므로 배포해도 안전하다(잠자는 상태). 키는 페이지에 노출되는 공개 값이다.
// 회원 정보를 넘기지 않는 익명 접속이라 이메일 등은 문의자가 채팅에서 직접 입력한다.
// ⚠️ 활성화 전에 개인정보처리방침에 채널코퍼레이션 위탁이 배포되어 있어야 한다.
// 외부 출처 허용 목록은 next.config.ts 의 CSP 에 함께 있다.
const PLUGIN_KEY = process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY;

// 카드사 심사 기간에는 심사 대상 화면(충전·약관·방침)을 그대로 둔다.
// 심사가 끝나면 앞의 세 줄을 빼서 충전 화면에서도 문의할 수 있게 한다.
const HIDDEN_PATH_PREFIXES = ["/charge", "/terms", "/privacy", "/admin", "/internal"];

type ChannelIOFn = {
  (...args: unknown[]): void;
  q: unknown[][];
  c: (args: unknown[]) => void;
};

type ChannelWindow = Window & { ChannelIO?: ChannelIOFn };

// 채널톡 공식 설치 스니펫의 TypeScript 이식 — 스크립트 로드 전 호출을 q 에 쌓았다가
// 로드 후 재생하는 구조라 필드 형태를 그대로 유지해야 한다.
// 다운로드가 실패하면 대기열을 지워 다음 페이지 이동 때 다시 시도하게 한다.
function bootstrapChannelIO(w: ChannelWindow, onError: () => void) {
  if (w.ChannelIO) return;
  const ch = function (...args: unknown[]) {
    ch.c(args);
  } as ChannelIOFn;
  ch.q = [];
  ch.c = (args) => {
    ch.q.push(args);
  };
  w.ChannelIO = ch;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js";
  script.onerror = () => {
    script.remove();
    delete w.ChannelIO;
    onError();
  };
  document.head.appendChild(script);
}

function isHiddenPath(pathname: string) {
  return HIDDEN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function ChannelTalk() {
  const pathname = usePathname();
  const booted = useRef(false);

  // App Router 는 클라이언트 라우팅이라 페이지를 옮겨도 버튼이 남는다 — 이동마다 다시 판단한다.
  useEffect(() => {
    if (!PLUGIN_KEY) return;
    const w = window as unknown as ChannelWindow;
    if (isHiddenPath(pathname)) {
      if (booted.current) {
        w.ChannelIO?.("shutdown");
        booted.current = false;
      }
      return;
    }
    if (booted.current) return;
    booted.current = true;
    bootstrapChannelIO(w, () => {
      booted.current = false;
    });
    // 기본 방문 이벤트·유입 경로 추적은 끈다 — 상담에 필요 없는 수집이다(방침 제1조).
    w.ChannelIO?.("boot", {
      pluginKey: PLUGIN_KEY,
      language: "ko",
      trackDefaultEvent: false,
      trackUtmSource: false,
    });
  }, [pathname]);

  return null;
}
