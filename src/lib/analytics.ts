// GA4 커스텀 이벤트 전송 헬퍼.
// GoogleAnalytics(@next/third-parties)가 production에서만 gtag을 로드하므로,
// 로컬/개발에서는 window.gtag이 없어 자동으로 무시된다(데이터 오염 방지).
export function trackEvent(
  name: string,
  params: Record<string, string | number | boolean> = {}
) {
  if (typeof window === "undefined") return;
  const gtag = (
    window as unknown as {
      gtag?: (
        command: "event",
        eventName: string,
        params?: Record<string, unknown>
      ) => void;
    }
  ).gtag;
  gtag?.("event", name, params);
}
