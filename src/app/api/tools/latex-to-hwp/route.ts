import { NextResponse, type NextRequest } from "next/server";
import temml from "temml";
import { checkRateLimit } from "@/lib/rate-limit";
import { convertDocument } from "@/lib/latex-tool";

// ChatGPT 수식 → 한글 수식 변환기(/help/latex-to-hwp) 서버 창구.
// 규칙 기반 문자열 변환이라 외부 AI·OCR 호출이 없다(비용 0). 변환 규칙을 숨기려고 서버에서만 돌린다.
// 로그인 불필요 — 대신 IP 당 분당 요청 수와 입력 길이를 제한한다.

const MAX_INPUT_CHARS = 20_000;
const MAX_FORMULAS = 300;
const RATE_LIMIT = 30; // IP 당 1분
const RATE_WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

// 미리보기용 MathML. 방문자 입력을 그리므로 \href 같은 링크·HTML 명령은 끄고(trust: false),
// 크기·매크로 확장도 제한한다. 실패하면 미리보기만 생략한다(변환 결과는 그대로).
function previewMathml(latex: string, display: boolean): string | null {
  try {
    return temml.renderToString((display ? "\\displaystyle " : "") + latex, {
      throwOnError: true,
      trust: false,
      maxSize: [20, 20],
      maxExpand: 200,
    });
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) ?? "unknown";
  const limit = await checkRateLimit(`latex-tool:ip:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "잠시 후 다시 시도해 주세요.", retry_after: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let text: unknown;
  try {
    ({ text } = (await request.json()) as { text?: unknown });
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "변환할 수식을 붙여 넣어 주세요." }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `한 번에 ${MAX_INPUT_CHARS.toLocaleString()}자까지 변환할 수 있어요. 나눠서 넣어 주세요.` },
      { status: 413 }
    );
  }

  const items = convertDocument(text);
  let formulas = 0;
  let truncated = false;
  const out: Array<
    | { kind: "text"; text: string }
    | { kind: "math"; latex: string; hwp: string; display: boolean; mathml: string | null }
  > = [];
  for (const item of items) {
    if (item.kind === "text") {
      out.push(item);
      continue;
    }
    if (formulas >= MAX_FORMULAS) {
      truncated = true;
      break;
    }
    formulas += 1;
    out.push({ ...item, mathml: previewMathml(item.latex, item.display) });
  }

  return NextResponse.json({ items: out, formulas, truncated });
}
