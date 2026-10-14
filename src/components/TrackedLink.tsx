"use client";

import { trackEvent } from "@/lib/analytics";

// 서버 컴포넌트 페이지(안내 페이지 등)에서 링크 클릭을 GA4 cta_click 으로 남기기 위한 얇은 래퍼.
export default function TrackedLink({
  href,
  label,
  location,
  className,
  children,
}: {
  href: string;
  label: string;
  location: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} onClick={() => trackEvent("cta_click", { label, location })} className={className}>
      {children}
    </a>
  );
}
