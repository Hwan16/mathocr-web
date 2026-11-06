"use client";

import temml from "temml";
import "temml/dist/Temml-Local.css";
import type { Preview, PreviewBlock } from "@/lib/file-box-types";

// 내 파일함 첫 문제 미리보기 — 앱이 만든 블록(src/file_box.py build_preview)을 그린다.
// 글자는 React 텍스트로, LaTeX 는 temml(MathML)로. temml 은 trust 기본값(false)이라
// \href 같은 명령이 링크로 바뀌지 않는다.

function math(latex: string, display: boolean): string {
  return temml.renderToString((display ? "\\displaystyle " : "") + latex, {
    throwOnError: false,
  });
}

// 배점 '[3.3점]'은 한 덩어리로 둔다 — 줄 끝에 걸리면 통째로 다음 줄로 가고 '[3.' / '3점]'처럼
// 쪼개지지 않게(아이폰 사파리에서 실제로 쪼개짐, 2026-11-07).
const SCORE = /(\[\s*\d+(?:\.\d+)?\s*점\s*\])/;

function Text({ v }: { v: string }) {
  const parts = v.split(SCORE);
  if (parts.length === 1) return v;
  return parts.map((s, j) =>
    j % 2 ? (
      <span key={j} className="whitespace-nowrap">
        {s}
      </span>
    ) : (
      s
    ),
  );
}

function Blocks({ items, figureUrl }: { items: PreviewBlock[]; figureUrl: string | null }) {
  return (
    <>
      {items.map((b, i) => {
        switch (b.t) {
          case "text":
            return b.b ? (
              <strong key={i}>
                <Text v={b.v} />
              </strong>
            ) : (
              <span key={i}>
                <Text v={b.v} />
              </span>
            );
          case "math":
            return <span key={i} dangerouslySetInnerHTML={{ __html: math(b.v, false) }} />;
          case "mathd":
            return (
              <span key={i} className="block my-1" dangerouslySetInnerHTML={{ __html: math(b.v, true) }} />
            );
          case "hwp":
            return (
              <span key={i} className="text-zinc-600">
                {b.v}
              </span>
            );
          case "br":
            return <br key={i} />;
          case "img":
            return figureUrl ? (
              // 서명 URL(5분)이라 next/image 최적화 대상이 아니다
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={figureUrl} alt="문제 그림" className="block my-3 max-w-[260px] max-h-[220px] object-contain" />
            ) : (
              <span key={i} className="block my-2 text-xs text-zinc-400">[그림]</span>
            );
          case "box":
            return (
              <span key={i} className="block my-2 border border-zinc-300 px-3 py-2">
                {b.kind === "bogi" && <span className="block text-center text-xs text-zinc-500 mb-1">&lt;보 기&gt;</span>}
                <Blocks items={b.items} figureUrl={figureUrl} />
              </span>
            );
          case "table":
            return (
              <table key={i} className="my-2 border-collapse text-[13px]">
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border border-zinc-300 px-2 py-1">
                          <Blocks items={cell} figureUrl={figureUrl} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

export default function FirstProblem({
  preview,
  figureUrl,
}: {
  preview: Preview;
  figureUrl: string | null;
}) {
  // 그림 자리 표시가 없는데 그림 URL이 있으면(앱이 위치를 못 잡은 경우) 본문 뒤에 붙인다
  const hasImgBlock = JSON.stringify(preview.body).includes('"t":"img"');
  return (
    <div className="text-[14.5px] leading-[1.8] text-zinc-800">
      <div className="flex gap-2">
        <span className="font-semibold tabular-nums shrink-0">{preview.number || 1}.</span>
        {/* flex-1: 본문이 번호 옆 남은 폭을 다 쓴다. 없으면 본문 폭이 '글 길이만큼'으로 잡혀(짧은 문제)
            사파리가 수식 폭을 몇 px 작게 재는 순간 줄 끝이 꺾이고 보기 칸도 왼쪽에 몰린다(2026-11-07). */}
        <div className="min-w-0 flex-1 break-words">
          <Blocks items={preview.body} figureUrl={figureUrl} />
          {!hasImgBlock && figureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={figureUrl} alt="문제 그림" className="block my-3 max-w-[260px] max-h-[220px] object-contain" />
          )}
          {preview.choices && preview.choices.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[14px]">
              {preview.choices.map((c, i) => (
                <span key={i}>
                  {c.label} <Blocks items={c.items} figureUrl={null} />
                </span>
              ))}
            </div>
          )}
          {preview.answer && <div className="mt-1 text-xs text-zinc-400">정답 {preview.answer}</div>}
        </div>
      </div>
    </div>
  );
}
