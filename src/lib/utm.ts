// 가입 출처(UTM) 추적 (M4 — docs/MARKETING_2026-07-10.md)
// 방문 시 URL의 utm_* 파라미터를 first-touch로 localStorage에 보관했다가
// 회원가입 시 서버로 보내 프로필에 기록한다.

const STORAGE_KEY = "mathocr_utm";
// first-touch 유지 기간. 이 기간 안에 다른 채널로 재방문해도 첫 유입 채널을 유지한다.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type UtmParams = {
  utm_source: string;
  utm_medium: string | null;
  utm_campaign: string | null;
};

type StoredUtm = UtmParams & { ts: number };

function normalize(value: string | null): string | null {
  const cleaned = value?.trim().toLowerCase().slice(0, 100);
  return cleaned || null;
}

// 페이지 최초 로드 시 호출 — utm_source가 있을 때만 저장.
// 유효한 first-touch가 이미 있으면 덮어쓰지 않는다(첫 유입 채널 기준 어트리뷰션).
export function captureUtmFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const source = normalize(params.get("utm_source"));
    if (!source) return;
    if (getStoredUtm()) return;
    const value: StoredUtm = {
      utm_source: source,
      utm_medium: normalize(params.get("utm_medium")),
      utm_campaign: normalize(params.get("utm_campaign")),
      ts: Date.now(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // localStorage 접근 불가(시크릿 모드 등) — 추적은 부가 기능이므로 조용히 무시
  }
}

// 가입 요청 시 호출 — 만료(30일)됐거나 없으면 null(= 직접 유입으로 기록됨)
export function getStoredUtm(): UtmParams | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredUtm>;
    if (typeof stored.utm_source !== "string" || typeof stored.ts !== "number") {
      return null;
    }
    if (Date.now() - stored.ts > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      utm_source: stored.utm_source,
      utm_medium: typeof stored.utm_medium === "string" ? stored.utm_medium : null,
      utm_campaign:
        typeof stored.utm_campaign === "string" ? stored.utm_campaign : null,
    };
  } catch {
    return null;
  }
}
