"use client";

import { useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { copyText, selectElementText } from "@/lib/clipboard";

// /help/latex-to-hwp — ChatGPT 답변(LaTeX)을 붙여 넣으면 수식마다 한글 수식 명령어 + 복사 버튼.
// 변환은 서버(/api/tools/latex-to-hwp)에서 한다 — 변환 규칙을 방문자 브라우저로 내려보내지 않기 위해.

type ResultItem =
  | { kind: "text"; text: string }
  | { kind: "math"; latex: string; hwp: string; display: boolean; mathml: string | null };

const EXAMPLE = `이차방정식 \\(ax^2+bx+c=0\\)의 근은 근의 공식으로 구할 수 있습니다.

\\[
x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}
\\]

판별식 \\(D = b^2 - 4ac\\)에 대하여 \\(D > 0\\)이면 서로 다른 두 실근을 갖고, \\(D = 0\\)이면 중근을 갖습니다.`;

// 한글에 그대로 쳐도 되는 수식(D > 0 처럼 변환 결과가 입력과 같은 것)은 카드로 띄우지 않는다
function isUnchanged(it: Extract<ResultItem, { kind: "math" }>) {
  const squash = (s: string) => s.replace(/\s+/g, "");
  return squash(it.latex) === squash(it.hwp);
}

export default function LatexToHwpTool({ signupFreeCredits }: { signupFreeCredits: number }) {
  const [input, setInput] = useState("");
  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [failedIdx, setFailedIdx] = useState<number | null>(null);
  const copyCount = useRef(0);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  async function convert(text: string, source: "button" | "example") {
    if (!text.trim()) {
      setError("변환할 ChatGPT 답변이나 수식을 붙여 넣어 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tools/latex-to-hwp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => null)) as
        | { items?: ResultItem[]; formulas?: number; truncated?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.items) {
        setItems(null);
        setError(data?.error ?? "변환하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setItems(data.items);
      setTruncated(Boolean(data.truncated));
      setCopiedIdx(null);
      setFailedIdx(null);
      trackEvent("latex_convert", { formulas: data.formulas ?? 0, source });
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch {
      setError("네트워크 오류로 변환하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(idx: number, hwp: string, codeEl: Element | null) {
    const ok = await copyText(hwp);
    if (!ok) {
      selectElementText(codeEl);
      setFailedIdx(idx);
      return;
    }
    setFailedIdx(null);
    setCopiedIdx(idx);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedIdx(null), 1500);
    copyCount.current += 1;
    trackEvent("equation_copy", { name: "latex_tool", count: copyCount.current });
  }

  const mathItems = items?.filter((i): i is Extract<ResultItem, { kind: "math" }> => i.kind === "math") ?? [];
  const formulas = mathItems.length;
  const changed = mathItems.filter((i) => !isUnchanged(i)).length;
  let mathNo = 0;

  return (
    <div>
      <label htmlFor="latex-input" className="block text-sm font-medium text-zinc-900 mb-2">
        ChatGPT 답변 또는 LaTeX 수식
      </label>
      <textarea
        id="latex-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        spellCheck={false}
        placeholder={"ChatGPT 답변 아래의 [복사] 버튼으로 복사해 그대로 붙여 넣으세요.\n예: 근의 공식은 \\(x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\) 입니다."}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 font-mono focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => convert(input, "button")}
          disabled={loading}
          className="btn-primary text-sm px-5 py-2.5 rounded-lg disabled:opacity-60"
        >
          {loading ? "변환 중…" : "한글 수식으로 변환"}
        </button>
        <button
          type="button"
          onClick={() => {
            setInput(EXAMPLE);
            convert(EXAMPLE, "example");
          }}
          disabled={loading}
          className="text-sm px-4 py-2.5 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
        >
          예시로 해보기
        </button>
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput("");
              setItems(null);
              setError(null);
            }}
            className="text-sm px-3 py-2.5 text-zinc-500 hover:text-zinc-900"
          >
            지우기
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {items && (
        <div ref={resultRef} className="mt-7 scroll-mt-24">
          <p className="text-sm text-zinc-900 font-semibold mb-1">
            {formulas === 0
              ? "수식을 찾지 못했어요"
              : changed === 0
                ? "바꿀 수식이 없어요 — 그대로 입력해도 돼요"
                : changed === formulas
                  ? `수식 ${changed}개를 한글 명령어로 바꿨어요`
                  : `수식 ${formulas}개 중 ${changed}개를 한글 명령어로 바꿨어요`}
          </p>
          <p className="text-[13px] text-zinc-500 mb-4">
            {changed > 0
              ? "[복사]를 누르고 한글 수식 편집기(Ctrl+N, M) 아래쪽 입력 칸에 붙여 넣은 뒤 Shift+Esc 로 넣으세요."
              : formulas > 0
                ? "아래 수식은 한글 수식 편집기에 보이는 그대로 입력하면 됩니다."
                : "ChatGPT 답변 아래의 [복사] 버튼으로 복사했는지 확인해 주세요. 화면을 드래그해 복사하면 수식이 글자로 풀려 들어옵니다."}
          </p>
          {truncated && (
            <p className="text-[13px] text-amber-700 mb-4">
              수식이 너무 많아 앞부분 300개까지만 바꿨어요. 나머지는 나눠서 넣어 주세요.
            </p>
          )}

          <div className="space-y-2">
            {items.map((it, idx) => {
              if (it.kind === "text") {
                const t = it.text.trim();
                if (!t) return null;
                return (
                  <p key={idx} className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap px-1">
                    {t}
                  </p>
                );
              }
              if (isUnchanged(it)) {
                return (
                  <p key={idx} className="text-[13px] text-zinc-400 leading-relaxed px-1">
                    <code className="eq">{it.hwp}</code>
                    <span className="ml-2 text-[11px]">바꿀 것 없음 · 그대로 입력</span>
                  </p>
                );
              }
              mathNo += 1;
              const copied = copiedIdx === idx;
              const failed = failedIdx === idx;
              return (
                <div key={idx} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <span className="text-[11px] font-medium text-zinc-400">수식 {mathNo}</span>
                    {it.mathml && (
                      <span
                        className="eq-render text-zinc-900 overflow-x-auto overflow-y-hidden py-1 max-w-[70%]"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: it.mathml }}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <code className="eq-code flex-1 min-w-0">{it.hwp}</code>
                    <button
                      type="button"
                      onClick={(e) =>
                        handleCopy(idx, it.hwp, e.currentTarget.previousElementSibling)
                      }
                      aria-label={`수식 ${mathNo} 한글 명령어 복사`}
                      className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                        copied
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      {copied ? "복사됨" : failed ? "Ctrl+C" : "복사"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {changed > 0 && (
            <div className="mt-6 rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3.5 text-[13px] text-zinc-600 leading-relaxed">
              문제 사진이나 PDF를 옮기는 중이라면, 수식을 하나씩 붙여 넣지 않아도 됩니다.{" "}
              <strong className="text-zinc-900">AI MathOCR</strong>은 문제지 전체를 편집 가능한 한글
              수식 문서로 만들어 줍니다.{" "}
              <a
                href="/auth/signup"
                onClick={() =>
                  trackEvent("cta_click", { label: "sign_up_free_15", location: "latex_tool_result" })
                }
                className="font-medium text-[var(--accent)] hover:underline whitespace-nowrap"
              >
                {signupFreeCredits}문제 무료로 해보기 →
              </a>
            </div>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {copiedIdx !== null
          ? "복사했습니다. 한글 수식 편집기 입력 칸에 붙여 넣으세요."
          : failedIdx !== null
            ? "자동 복사가 막혀 명령어를 선택해 두었습니다. Ctrl+C로 복사하세요."
            : ""}
      </p>
    </div>
  );
}
