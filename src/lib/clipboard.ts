// 브라우저 클립보드 복사 — 수식 사전·ChatGPT 수식 변환기 공용.
// Clipboard API 가 막힌 환경(http·구형·권한 거부)은 임시 textarea + execCommand 로 한 번 더 시도한다.
// 둘 다 실패하면 false — 호출부가 글자를 선택해 두고 Ctrl+C 를 안내한다.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 복사가 막혔을 때 해당 요소의 글자를 선택해 둔다(사용자가 바로 Ctrl+C). */
export function selectElementText(el: Element | null) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}
