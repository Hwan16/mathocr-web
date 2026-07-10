// 메타 픽셀 이벤트 헬퍼 (M6 — docs/MARKETING_2026-07-10.md)
// 픽셀 미설정(NEXT_PUBLIC_META_PIXEL_ID 없음)·미로드 환경에서는 자동으로 무시되므로
// 호출부에서 조건 분기 없이 안전하게 쓸 수 있다. (analytics.ts의 trackEvent와 같은 패턴)
export function metaPixelTrack(
  event: string,
  params?: Record<string, string | number | boolean>
) {
  if (typeof window === "undefined") return;
  const fbq = (
    window as unknown as {
      fbq?: (command: "track", eventName: string, params?: Record<string, unknown>) => void;
    }
  ).fbq;
  fbq?.("track", event, params);
}
