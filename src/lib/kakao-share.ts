// 카카오톡 공유(내 파일함 '받기 링크' 보내기, D-054).
// 카카오 개발자 앱 'AI MathOCR'(ID 1639096). JavaScript 키는 브라우저에 그대로 나가는 공개 키라
// 코드에 둔다(REST·어드민 키는 절대 여기 두지 않는다). 등록 도메인: mathocr.ai.kr·localhost:3000.
// SDK 는 카카오 CDN 2.8.4 + SRI(2026-11-05 원본에서 계산). 버전을 바꾸면 해시도 다시 계산한다.

export const KAKAO_JS_KEY = "3974b4b8042d4f580db6b4886347019c";
const SDK_SRC = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js";
const SDK_INTEGRITY = "sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w";

type KakaoSdk = {
  init(key: string): void;
  isInitialized(): boolean;
  Share: { sendDefault(settings: Record<string, unknown>): void };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

let loading: Promise<KakaoSdk> | null = null;

function loadSdk(): Promise<KakaoSdk> {
  if (window.Kakao) return Promise.resolve(window.Kakao);
  if (loading) return loading;
  loading = new Promise<KakaoSdk>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SDK_SRC;
    s.integrity = SDK_INTEGRITY;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => (window.Kakao ? resolve(window.Kakao) : reject(new Error("kakao sdk missing")));
    s.onerror = () => {
      loading = null;
      reject(new Error("kakao sdk load failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** 받기 링크를 카카오톡 카드로 보낸다. 실패하면 false — 화면은 링크 복사로 대신한다. */
export async function shareFileLink(opts: {
  url: string;
  title: string;
  description: string;
}): Promise<boolean> {
  try {
    const kakao = await loadSdk();
    if (!kakao.isInitialized()) kakao.init(KAKAO_JS_KEY);
    const link = { webUrl: opts.url, mobileWebUrl: opts.url };
    kakao.Share.sendDefault({
      objectType: "feed",
      content: {
        title: opts.title,
        description: opts.description,
        imageUrl: "https://mathocr.ai.kr/og-image.jpg",
        link,
      },
      buttons: [{ title: "파일 받기", link }],
    });
    return true;
  } catch (e) {
    console.error("[kakao-share]", e);
    return false;
  }
}
