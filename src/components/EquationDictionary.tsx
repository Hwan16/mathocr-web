"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { copyText, selectElementText } from "@/lib/clipboard";

// /help/hwp-equation 의 명령어 사전 — 분류 탭·검색·복사 버튼.
// 결과 미리보기(MathML)는 서버에서 만들어 넘겨받는다(수식 라이브러리를 방문자에게 내려보내지 않기 위해).
// 복사를 여러 번 하는 방문자 = 문제를 손으로 옮기는 중일 가능성이 높아, 3번째 복사에서 한 번만 변환 안내를 띄운다.

export type DictionaryItem = { name: string; hwp: string; mathml: string; kw?: string };
export type DictionaryCategory = { id: string; label: string; items: DictionaryItem[] };

const NUDGE_AFTER_COPIES = 3;
const NUDGE_SEEN_KEY = "mathocr_eq_nudge_seen";

function wasNudgeSeen(): boolean {
  try {
    return window.localStorage.getItem(NUDGE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markNudgeSeen() {
  try {
    window.localStorage.setItem(NUDGE_SEEN_KEY, "1");
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등) — 이번 방문에서만 1회로 제한된다
  }
}

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

export default function EquationDictionary({
  categories,
  signupFreeCredits,
}: {
  categories: DictionaryCategory[];
  signupFreeCredits: number;
}) {
  const [active, setActive] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const copyCount = useRef(0);
  const nudgeShown = useRef(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    nudgeShown.current = wasNudgeSeen();
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const q = normalize(query);
  const visible = useMemo(() => {
    return categories
      .filter((c) => q !== "" || active === "all" || c.id === active)
      .map((c) => ({
        ...c,
        items:
          q === ""
            ? c.items
            : c.items.filter((it) => normalize(`${it.name} ${it.hwp} ${it.kw ?? ""}`).includes(q)),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, active, q]);

  const total = visible.reduce((n, c) => n + c.items.length, 0);

  async function handleCopy(item: DictionaryItem, key: string, codeEl: HTMLElement | null) {
    const ok = await copyText(item.hwp);
    if (!ok) {
      // 클립보드 권한이 막힌 브라우저 — 명령어를 선택해 두고 Ctrl+C 를 안내한다
      selectElementText(codeEl);
      setFailedKey(key);
      return;
    }
    setFailedKey(null);
    setCopiedKey(key);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedKey(null), 1500);

    copyCount.current += 1;
    trackEvent("equation_copy", { name: item.name, count: copyCount.current });
    if (copyCount.current >= NUDGE_AFTER_COPIES && !nudgeShown.current) {
      nudgeShown.current = true;
      markNudgeSeen();
      setNudgeOpen(true);
      trackEvent("help_nudge_view", { location: "hwp_equation" });
    }
  }

  return (
    <div>
      {/* 검색 */}
      <label className="relative block mb-3">
        <span className="sr-only">명령어 검색</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="찾는 수식 검색 (예: 분수, 절댓값, ∈, 시그마)"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
      </label>

      {/* 분류 탭 — 검색 중에는 전체에서 찾는다 */}
      <div
        className={`flex flex-wrap gap-1.5 mb-5 ${q ? "opacity-40 pointer-events-none" : ""}`}
        role="tablist"
        aria-label="수식 분류"
      >
        {[{ id: "all", label: "전체" }, ...categories].map((c) => {
          const selected = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(c.id)}
              className={`text-xs md:text-[13px] px-2.5 py-1.5 rounded-md border transition-colors ${
                selected
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {total === 0 && (
        <p className="text-sm text-zinc-500 py-6 text-center">
          찾는 명령어가 없습니다. 다른 이름(예: &lsquo;루트&rsquo; 대신 &lsquo;제곱근&rsquo;)으로
          검색해 보세요.
        </p>
      )}

      <div className="space-y-7">
        {visible.map((c) => (
          <section key={c.id} aria-labelledby={`eqcat-${c.id}`}>
            <h3 id={`eqcat-${c.id}`} className="text-sm font-semibold text-zinc-900 mb-2">
              {c.label}
            </h3>
            <ul className="divide-y divide-zinc-100 border-y border-zinc-100">
              {c.items.map((it) => {
                const key = `${c.id}:${it.name}`;
                const copied = copiedKey === key;
                const failed = failedKey === key;
                return (
                  <li
                    key={key}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[9.5rem_1fr_8.5rem] gap-x-3 gap-y-1.5 py-2.5 items-center"
                  >
                    <span className="text-[13px] font-medium text-zinc-700 md:text-zinc-900">
                      {it.name}
                    </span>
                    {/* 결과 미리보기 — 모바일에서는 이름 오른쪽, PC에서는 맨 오른쪽 */}
                    <span
                      className="eq-render text-zinc-900 justify-self-end md:order-3 md:justify-self-start"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: it.mathml }}
                    />
                    <span className="col-span-2 md:col-span-1 md:order-2 flex items-center gap-2 min-w-0">
                      <code className="eq-code flex-1 min-w-0">{it.hwp}</code>
                      <button
                        type="button"
                        onClick={(e) =>
                          handleCopy(it, key, e.currentTarget.previousElementSibling as HTMLElement | null)
                        }
                        aria-label={`${it.name} 명령어 복사`}
                        className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-colors ${
                          copied
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500"
                        }`}
                      >
                        {copied ? "복사됨" : failed ? "Ctrl+C" : "복사"}
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="sr-only" aria-live="polite">
        {copiedKey
          ? "명령어를 복사했습니다. 한글 수식 편집기 입력 칸에 붙여 넣으세요."
          : failedKey
            ? "자동 복사가 막혀 명령어를 선택해 두었습니다. Ctrl+C로 복사하세요."
            : ""}
      </p>

      {/* 여러 번 복사한 방문자에게 1회만 보이는 변환 안내 */}
      {nudgeOpen && (
        <div
          role="dialog"
          aria-label="시험지 자동 변환 안내"
          className="fixed inset-x-3 bottom-3 z-50 md:inset-x-auto md:right-5 md:bottom-5 md:max-w-sm rounded-xl border border-zinc-200 bg-white shadow-lg p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-900">문제를 한 줄씩 옮기고 계신가요?</p>
              <p className="text-[13px] text-zinc-600 leading-relaxed mt-1">
                시험지 PDF나 사진을 넣으면 수식까지 편집 가능한 한글 문서로 만들어 드려요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNudgeOpen(false);
                trackEvent("help_nudge_close", { location: "hwp_equation" });
              }}
              aria-label="안내 닫기"
              className="text-zinc-400 hover:text-zinc-700 text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <a
              href="/auth/signup"
              onClick={() =>
                trackEvent("cta_click", { label: "sign_up_free_15", location: "help_eq_nudge" })
              }
              className="btn-primary text-[13px] px-3.5 py-2 rounded-lg"
            >
              {signupFreeCredits}문제 무료로 해보기
            </a>
            <a
              href="/#guide"
              onClick={() => trackEvent("cta_click", { label: "guide_video", location: "help_eq_nudge" })}
              className="text-[13px] px-3.5 py-2 rounded-lg border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            >
              사용법 영상
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
