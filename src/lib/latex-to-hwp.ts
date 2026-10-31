// LaTeX → 한글(HWP) 수식 문법 변환기 — 웹 'ChatGPT 수식 변환기'(/help/latex-to-hwp)용.
//
// 원본 = 부모 repo src/latex_to_hwp.py (v2.5.4, 2026-10-14 ⇔·↔ 수정 반영). 줄 단위로 그대로 옮긴 것이다.
// 두 구현이 같은 결과를 내는지는 latex-to-hwp.test.ts(앱 tests/test_latex_to_hwp.py 사례 + 대조 스크립트)로
// 확인한다 — **한쪽 규칙을 고치면 다른 쪽도 고칠 것.**
//
// ⚠️ 서버 전용: API 라우트에서만 import 한다. 클라이언트 컴포넌트에서 import 하면 변환 규칙이 방문자
// 브라우저로 내려가 그대로 복제될 수 있다.
//
// Python 과의 차이를 막기 위한 메모:
//   - str.isalpha()/isalnum() 은 유니코드 기준(한글도 alpha) → isAlpha/isAlnum 을 \p{L}/\p{N} 로 구현
//   - str.strip("{}") 은 양끝의 { } 문자를 모두 벗긴다 → stripChars

function ensureSpaceAfterComma(text: string): string {
  return text.replace(/,\s*/g, ", ");
}

// 한/글 수식 편집기는 `<-`(공백 없음)를 왼쪽 화살표(←)로 읽는다 → `< -` 로 띄운다(따옴표 안 제외).
function separateLtMinus(text: string): string {
  const parts = text.split('"');
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(/<(?=-)/g, "< ");
  }
  return parts.join('"');
}

// 한/글 수식의 `는 1/4칸 띄어쓰기라 \prime을 `로 내면 프라임이 사라진다(2026-10-31 회원 신고). 프라임은 '다.
// f'처럼 붙이면 글자에 겹쳐 보여 ` 한 칸을 앞에 두고, f^{\prime}은 f'로 풀어 쓴다.
const PRIME_SUP_RE = /\^\s*\{\s*((?:(?:\\prime(?![a-zA-Z])|[′″'])\s*)+)\}/g;
const PRIME_SUP_BARE_RE = /\^\s*\\prime(?![a-zA-Z])/g;
const PRIME_RUN_RE = /(?<![`'])'+/g;

function unfoldPrimeSuperscript(text: string): string {
  return text
    .replace(PRIME_SUP_RE, (_m, body: string) => {
      const count = (re: RegExp) => (body.match(re) ?? []).length;
      return "'".repeat(count(/\\prime/g) + count(/′/g) + count(/'/g) + 2 * count(/″/g));
    })
    .replace(PRIME_SUP_BARE_RE, "'");
}

function spaceBeforePrime(text: string): string {
  const parts = text.split('"');
  for (let i = 0; i < parts.length; i += 2) {
    parts[i] = parts[i].replace(PRIME_RUN_RE, (m) => "`" + m);
  }
  return parts.join('"');
}

const LATEX_CMD_RE = /\\[a-zA-Z]+/;
const HANGUL_RE = /[가-힣]/;

const isAlpha = (ch: string) => ch !== "" && /^\p{L}$/u.test(ch);
const isAlnum = (ch: string) => ch !== "" && /^[\p{L}\p{N}]$/u.test(ch);
const pyStrip = (s: string) => s.replace(/^\s+|\s+$/g, "");

function stripChars(s: string, chars: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && chars.includes(s[a])) a++;
  while (b > a && chars.includes(s[b - 1])) b--;
  return s.slice(a, b);
}

export type TextMathSegment = ["text" | "math", string];

/** 글 사이에 구분자 없이 섞인 LaTeX(\frac 등)를 한글/비한글 경계로 나눠 수식 조각만 골라낸다. */
export function splitTextAndLatex(value: string): TextMathSegment[] {
  if (!value || !LATEX_CMD_RE.test(value)) return [["text", value]];

  const runs: Array<[boolean, string]> = [];
  for (const ch of value) {
    const isH = HANGUL_RE.test(ch);
    if (runs.length && runs[runs.length - 1][0] === isH) {
      runs[runs.length - 1][1] += ch;
    } else {
      runs.push([isH, ch]);
    }
  }

  const segs: TextMathSegment[] = [];
  for (const [isH, run] of runs) {
    if (!isH && LATEX_CMD_RE.test(run)) {
      const core = pyStrip(run);
      const lead = run.slice(0, run.length - run.replace(/^\s+/, "").length);
      const trail = run.slice(run.replace(/\s+$/, "").length);
      if (lead) segs.push(["text", lead]);
      segs.push(["math", core]);
      if (trail) segs.push(["text", trail]);
    } else {
      segs.push(["text", run]);
    }
  }

  const merged: TextMathSegment[] = [];
  for (const [kind, text] of segs) {
    if (kind === "text" && merged.length && merged[merged.length - 1][0] === "text") {
      merged[merged.length - 1] = ["text", merged[merged.length - 1][1] + text];
    } else {
      merged.push([kind, text]);
    }
  }
  return merged.filter(([k, t]) => k === "math" || t !== "");
}

export function latexToHwp(latex: string): string {
  return new LatexToHwpConverter().convert(latex);
}

const SYMBOL_MAP: Record<string, string> = {
  // 각도/도
  angle: "angle",
  circ: "circ",

  // 그리스 소문자
  alpha: "alpha", beta: "beta", gamma: "gamma",
  delta: "delta", epsilon: "epsilon", varepsilon: "varepsilon",
  zeta: "zeta", eta: "eta", theta: "theta", vartheta: "vartheta",
  iota: "iota", kappa: "kappa", lambda: "lambda",
  mu: "mu", nu: "nu", xi: "xi",
  pi: "pi", varpi: "varpi",
  rho: "rho", varrho: "varrho",
  sigma: "sigma", varsigma: "varsigma",
  tau: "tau", upsilon: "upsilon",
  phi: "phi", varphi: "varphi",
  chi: "chi", psi: "psi", omega: "omega",

  // 그리스 대문자
  Gamma: "GAMMA", Delta: "DELTA", Theta: "THETA",
  Lambda: "LAMBDA", Xi: "XI", Pi: "PI",
  Sigma: "SIGMA", Upsilon: "UPSILON",
  Phi: "PHI", Psi: "PSI", Omega: "OMEGA",

  // 연산자
  times: "times", div: "div", cdot: "cdot",
  pm: "+-", mp: "-+",
  ast: "*", star: "*",
  bullet: "bullet",
  oplus: "oplus", otimes: "otimes",

  // 관계 — 한글의 `<=`·`>=`는 선 두 줄(≦·≧)로 그려진다. 시험지의 ≤·≥(한 줄)는 leq·geq
  leq: "leq", le: "leq", leqq: "<=", leqslant: "leq",
  geq: "geq", ge: "geq", geqq: ">=", geqslant: "geq",
  neq: "≠", ne: "≠",
  not: "not",
  approx: "approx", equiv: "equiv",
  sim: "sim", simeq: "simeq",
  propto: "propto",
  ll: "<<", gg: ">>",
  prec: "prec", succ: "succ",

  // 화살표 — 양방향은 lrarrow·LRARROW (leftrightarrow는 →, LEFTRIGHTARROW는 ⇒로 그려진다, 10-14 실측)
  to: "rightarrow", rightarrow: "rightarrow",
  leftarrow: "leftarrow",
  leftrightarrow: "lrarrow", longleftrightarrow: "lrarrow",
  Rightarrow: "RIGHTARROW", Longrightarrow: "RIGHTARROW", implies: "RIGHTARROW",
  Leftarrow: "LEFTARROW", Longleftarrow: "LEFTARROW", impliedby: "LEFTARROW",
  Leftrightarrow: "LRARROW", Longleftrightarrow: "LRARROW", iff: "LRARROW",
  longrightarrow: "rightarrow", longleftarrow: "leftarrow",
  uparrow: "uparrow", downarrow: "downarrow",
  mapsto: "mapsto",

  // 집합
  in: "in", notin: "notin", ni: "ni",
  subset: "subset", supset: "supset",
  subseteq: "subseteq", supseteq: "supseteq",
  cup: "cup", cap: "cap",
  mid: " | ", vert: "|",
  emptyset: "emptyset", varnothing: "emptyset",

  // 논리
  // 한글 수식엔 forall 명령이 없어 글자로 찍힌다 — 기호를 그대로 넣는다(10-31 실제 렌더)
  forall: "∀", exists: "exists",
  neg: "neg", lnot: "neg",
  land: "wedge", lor: "vee",
  vee: "vee", wedge: "wedge",

  // 기타
  infty: "inf", infinity: "inf",
  partial: "partial",
  nabla: "nabla",
  prime: "'",
  triangle: "TRIANGLE",
  // 예전엔 ""로 지워 □가 소리 없이 사라졌다(10-31 점검)
  square: "□", Box: "□", blacksquare: "■",
  frown: "⌒",
  colon: ":",
  degree: " DEG",
  complement: "C", // A^{\complement} → 교과서 표기 A^C
  setminus: "∖",
  ncong: "≇", subsetneq: "⊊", supsetneq: "⊋",
  rightleftharpoons: "⇌", hookrightarrow: "rightarrow", gets: "leftarrow",
  measuredangle: "angle", bigtriangleup: "TRIANGLE",
  bmod: " rm {mod} it ", mod: " rm {mod} it ",
  lvert: "|", rvert: "|", lVert: "||", rVert: "||",
  lt: "<", gt: ">",
  lbrace: "lbrace ", rbrace: "rbrace ", lbrack: "[", rbrack: "]",
  dotsc: "cdots", dotsb: "cdots", dotsm: "cdots", dotso: "cdots",
  nonumber: "", notag: "",
  // 괄호 크기 지정 — 한글에선 글자로 찍히므로 지우고 괄호만 남긴다
  big: "", Big: "", bigg: "", Bigg: "",
  bigl: "", Bigl: "", biggl: "", Biggl: "",
  bigr: "", Bigr: "", biggr: "", Biggr: "",
  bigm: "", Bigm: "", biggm: "", Biggm: "",
  perp: "bot",
  parallel: "parallel",
  therefore: "therefore",
  because: "because",
  ell: "ell",

  // 점
  cdots: "cdots", ldots: "...", vdots: "vdots",
  ddots: "ddots", dots: "cdots",

  // 공백 — 한글 수식은 보통 공백을 무시하므로 띄어쓰기 기호 ~(한 칸)·`(1/4칸)로 (10-26, 앱과 같음)
  quad: "~~", qquad: "~~~~",
};

const DECORATION_MAP: Record<string, string> = {
  overline: "overline",
  underline: "underline",
  hat: "hat",
  tilde: "tilde",
  dot: "dot",
  ddot: "ddot",
  vec: "vec",
  overrightarrow: "vec",
  overleftarrow: "vec",
  overleftrightarrow: "dyad", // 양쪽 화살표(직선 AB)
  vector: "vec",
  bar: "bar",
  // 한글 수식엔 widehat·widetilde가 없다 — hat·tilde가 글자 폭만큼 늘어난다(10-31 실제 렌더)
  widehat: "hat",
  widetilde: "tilde",
  // 호 — overparen·overset{frown}은 한글이 못 읽어 AB까지 통째로 사라진다
  overparen: "arch", overarc: "arch", wideparen: "arch",
  overbrace: "overbrace",
  underbrace: "underbrace",
};

const FUNC_NAMES = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "arcsin", "arccos", "arctan",
  "sinh", "cosh", "tanh", "coth",
  "log", "ln", "exp",
  "min", "max", "sup", "inf",
  "lim", "limsup", "liminf",
  "det", "dim", "ker", "gcd", "lcm",
  "deg", "arg", "hom", "Pr",
]);

const BIG_OPS = new Set(["sum", "prod", "coprod", "int", "iint", "iiint", "oint"]);

const UNICODE_MAP: Record<string, string> = {
  "°": " DEG",
  "×": " times ",
  "÷": " div ",
  "≤": " leq ",
  "≦": " <= ",
  "≥": " geq ",
  "≧": " >= ",
  "≠": " ≠ ",
  "≢": " ≠ ",
  "∞": " inf ",
  "→": " rightarrow ",
  "←": " leftarrow ",
  "↔": " lrarrow ",
  "⇒": " RIGHTARROW ",
  "⇐": " LEFTARROW ",
  "⇔": " LRARROW ",
  "∈": " in ",
  "∉": " notin ",
  "⊂": " subset ",
  "⊃": " supset ",
  "∪": " cup ",
  "∩": " cap ",
  "∅": " emptyset ",
  "∀": " ∀ ",
  "∃": " exists ",
  "∂": " partial ",
  "∇": " nabla ",
  "α": " alpha ", "β": " beta ", "γ": " gamma ",
  "δ": " delta ", "ε": " epsilon ", "ζ": " zeta ",
  "η": " eta ", "θ": " theta ", "ι": " iota ",
  "κ": " kappa ", "λ": " lambda ", "μ": " mu ",
  "ν": " nu ", "ξ": " xi ", "π": " pi ",
  "ρ": " rho ", "σ": " sigma ", "τ": " tau ",
  "φ": " phi ", "χ": " chi ", "ψ": " psi ", "ω": " omega ",
  "±": " +- ",
  "·": " cdot ",
  "…": " cdots ",
  "′": "'",
  "″": "''",
};

const has = (m: Record<string, string>, k: string) => Object.prototype.hasOwnProperty.call(m, k);

export class LatexToHwpConverter {
  private pos = 0;
  private src = "";
  warnings: string[] = [];

  convert(latex: string): string {
    this.warnings = [];
    this.src = this.preprocess(latex);
    this.pos = 0;
    const result = this.parseExpr();
    return this.postprocess(result);
  }

  // ── 전처리/후처리 ──

  private preprocess(latex: string): string {
    let s = pyStrip(latex);
    if (s.startsWith("$$") && s.endsWith("$$")) {
      s = s.slice(2, -2);
    } else if (s.startsWith("$") && s.endsWith("$")) {
      s = s.slice(1, -1);
    }
    s = s.replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\s*/g, "");
    s = unfoldPrimeSuperscript(s);
    s = pyStrip(s.replace(/\s+/g, " "));
    return s;
  }

  private postprocess(input: string): string {
    let result = input.replace(/\s*<>\s*/g, " ≠ ");
    result = separateLtMinus(result);
    result = spaceBeforePrime(result);
    result = result.replace(/(?<=[A-Za-z0-9가-힣}\)])\s+mid\s+(?=[A-Za-z0-9가-힣{(])/g, " | ");
    result = result.replace(/(?<=[A-Za-z0-9가-힣}\)])mid(?=\s*[A-Za-z0-9가-힣{(])/g, " | ");
    result = ensureSpaceAfterComma(result);
    result = result.replace(/ {2,}/g, " ");
    return pyStrip(result);
  }

  // ── 파서 유틸 ──

  private peek(offset = 0): string {
    const idx = this.pos + offset;
    return idx < this.src.length ? this.src[idx] : "";
  }

  private advance(n = 1): string {
    const result = this.src.slice(this.pos, this.pos + n);
    this.pos += n;
    return result;
  }

  private atEnd(): boolean {
    return this.pos >= this.src.length;
  }

  private skipSpaces() {
    while (this.peek() === " ") this.advance();
  }

  // ── 핵심 파싱 ──

  private parseExpr(stopChars = ""): string {
    const parts: string[] = [];
    while (!this.atEnd()) {
      const ch = this.peek();
      if (stopChars.includes(ch)) break;

      if (ch === "\\") {
        const cmdResult = this.parseCommand();
        if (cmdResult && parts.length && parts[parts.length - 1]) {
          const last = parts[parts.length - 1];
          const lastChar = last[last.length - 1];
          const firstChar = cmdResult[0];
          if (isAlnum(lastChar) && isAlpha(firstChar)) parts.push(" ");
        }
        parts.push(cmdResult);
      } else if (ch === "{") {
        this.advance();
        const inner = this.parseExpr("}");
        if (this.peek() === "}") this.advance();
        parts.push("{" + inner + "}");
      } else if (ch === "^") {
        this.advance();
        const arg = this.parseSingleToken();
        const stripped = stripChars(pyStrip(arg), "{}");
        if (stripped === "circ" || stripped === "°" || stripped === "DEG") {
          parts.push(" DEG");
        } else {
          const prev = parts.length ? pyStrip(parts[parts.length - 1]) : "";
          const prefix = FUNC_NAMES.has(prev) || BIG_OPS.has(prev) ? " " : "";
          if (!this.attachBeforeIt(parts, "^", arg)) {
            parts.push(prefix + "^" + this.braceIfNeeded(arg));
          }
        }
      } else if (ch === "_") {
        this.advance();
        const arg = this.parseSingleToken();
        const prev = parts.length ? pyStrip(parts[parts.length - 1]) : "";
        const prefix = FUNC_NAMES.has(prev) || BIG_OPS.has(prev) ? " " : "";
        if (!this.attachBeforeIt(parts, "_", arg)) {
          parts.push(prefix + "_" + this.braceIfNeeded(arg));
        }
      } else if (ch === "&") {
        this.advance();
        parts.push(" # ");
      } else if (ch === "~") {
        this.advance();
        parts.push(" ");
      } else if (has(UNICODE_MAP, ch)) {
        this.advance();
        parts.push(UNICODE_MAP[ch]);
      } else if (ch === " ") {
        this.advance();
        parts.push(" ");
      } else {
        this.advance();
        parts.push(ch);
      }
    }
    return parts.join("");
  }

  /** 정자체 토막(`rm {P} it `) 바로 뒤 첨자를 `it` 앞으로 옮긴다(한/글이 괄호 짝을 잃는 문제). */
  private attachBeforeIt(parts: string[], marker: string, arg: string): boolean {
    let i = parts.length - 1;
    while (i >= 0 && !pyStrip(parts[i])) i--;
    if (i < 0 || !parts[i].endsWith(" it ")) return false;
    const script = /^[0-9.,]*$/.test(pyStrip(arg))
      ? marker + this.braceIfNeeded(arg)
      : marker + "{it " + arg + "}";
    parts[i] = parts[i].slice(0, -" it ".length) + script + " it ";
    parts.splice(i + 1);
    return true;
  }

  private parseSingleToken(): string {
    this.skipSpaces();
    if (this.atEnd()) return "";
    const ch = this.peek();
    if (ch === "{") {
      this.advance();
      const inner = this.parseExpr("}");
      if (this.peek() === "}") this.advance();
      return inner;
    } else if (ch === "\\") {
      return this.parseCommand();
    }
    return this.advance();
  }

  private parseBracedArg(): string {
    this.skipSpaces();
    if (this.peek() === "{") {
      this.advance();
      const inner = this.parseExpr("}");
      if (this.peek() === "}") this.advance();
      return inner;
    }
    return this.parseSingleToken();
  }

  private braceIfNeeded(input: string): string {
    const s = pyStrip(input);
    if (!s) return "";
    if (s.startsWith("{") && s.endsWith("}") && LatexToHwpConverter.bracesMatch(s)) return s;
    return "{" + s + "}";
  }

  private static bracesMatch(s: string): boolean {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") depth--;
      if (depth === 0) return i === s.length - 1;
    }
    return false;
  }

  // ── 명령어 파싱 ──

  private parseCommand(): string {
    this.advance(); // '\'
    if (this.atEnd()) return "";
    const ch = this.peek();
    if (!isAlpha(ch)) {
      this.advance();
      return this.convertSpecialChar(ch);
    }
    let cmd = "";
    while (!this.atEnd() && isAlpha(this.peek())) cmd += this.advance();
    return this.convertCommand(cmd);
  }

  private convertSpecialChar(ch: string): string {
    const table: Record<string, string> = {
      ",": "`",
      ";": "~",
      ":": "`",
      "!": "",
      "{": "lbrace ",
      "}": "rbrace ",
      "|": "||", // \| 노름 — 한 줄이면 절댓값이 된다
      "\\": " ## ",
      " ": "~",
      "%": "%",
      // 한글 수식에서 #은 줄바꿈, &은 칸 나눔, _는 아래첨자라 글자로 찍으려면 따옴표가 필요하다
      "#": '"#"',
      "&": '"&"',
      _: '"_"',
    };
    return has(table, ch) ? table[ch] : ch;
  }

  private convertCommand(cmd: string): string {
    // 분수
    if (cmd === "frac" || cmd === "dfrac" || cmd === "tfrac" || cmd === "cfrac") {
      const num = this.parseBracedArg();
      const den = this.parseBracedArg();
      return "{" + num + "} over {" + den + "}";
    }

    // 위·아래에 얹기 — 한글엔 대응 명령이 없고 buildrel은 깨진다(10-31 실제 렌더). 사라지지 않게 첨자로 낸다. 호만 arch
    if (cmd === "overset" || cmd === "stackrel") {
      const top = this.parseBracedArg();
      const base = this.parseBracedArg();
      if (pyStrip(top) === "⌒") return "arch{" + base + "}";
      return "{" + base + "}^{" + top + "}";
    }
    if (cmd === "underset") {
      const bottom = this.parseBracedArg();
      const base = this.parseBracedArg();
      return "{" + base + "}_{" + bottom + "}";
    }
    if (cmd === "xrightarrow" || cmd === "xleftarrow") {
      const arrow = cmd === "xrightarrow" ? "rightarrow" : "leftarrow";
      return "{" + arrow + "}^{" + this.parseBracedArg() + "}";
    }

    // 네모 칸·나머지·번호·간격
    if (cmd === "boxed" || cmd === "fbox") return "box{" + this.parseBracedArg() + "}";
    if (cmd === "pmod") return "~( rm {mod} it ~" + this.parseBracedArg() + ")";
    if (cmd === "tag") return "~~(" + this.parseBracedArg() + ")";
    if (cmd === "hspace") {
      this.parseBracedArg();
      return "~";
    }

    // 이항계수
    if (cmd === "binom") {
      const n = this.parseBracedArg();
      const k = this.parseBracedArg();
      return "left( matrix{" + n + " # " + k + "} right)";
    }

    // 루트 — "{n} root {x}"는 차수가 루트 밖에 찍힌다. root … of … 문법이어야 한다
    if (cmd === "sqrt") {
      if (this.peek() === "[") {
        this.advance();
        let n = "";
        while (!this.atEnd() && this.peek() !== "]") n += this.advance();
        if (this.peek() === "]") this.advance();
        const arg = this.parseBracedArg();
        return "root {" + n + "} of {" + arg + "}";
      }
      const arg = this.parseBracedArg();
      return "sqrt{" + arg + "}";
    }

    // 텍스트 — 단위·설명어는 정자체(rm)로 감싸고 it 으로 되돌린다.
    // 따옴표 안 끝머리 공백은 한글이 지운다("는 " + 10 → "는10") — 앞뒤 공백은 따옴표 밖 ~로 옮긴다.
    if (cmd === "text" || cmd === "textrm" || cmd === "mbox" || cmd === "hbox") {
      const arg = this.parseBracedArg();
      if (!arg) return "";
      const core = pyStrip(arg);
      if (!core) return "~";
      const lead = /\s/.test(arg[0]) ? "~" : "";
      const trail = /\s/.test(arg[arg.length - 1]) ? "~ " : "";
      return lead + 'rm "' + core + '" it ' + trail;
    }

    if (cmd === "textit" || cmd === "textbf") {
      const arg = this.parseBracedArg();
      return '"' + arg + '"';
    }

    // 정자체 — rm/it 은 그룹이 아니라 '모드'라 반드시 it 으로 되돌린다
    if (cmd === "mathrm" || cmd === "operatorname") {
      const arg = this.parseBracedArg();
      if (!arg) return "";
      return "rm {" + arg + "} it ";
    }

    // 나머지 수학 폰트 — 내용만 통과
    if (
      [
        "mathit", "mathbf", "mathsf", "mathtt", "mathcal", "mathbb", "mathfrak", "boldsymbol",
        "mathbin", "mathrel", "mathop", "mathord", "mathopen", "mathclose", "mathpunct", "mathinner",
      ].includes(cmd)
    ) {
      return this.parseBracedArg();
    }

    if (cmd === "left") return "left" + this.parseDelimiter();
    if (cmd === "right") return " right" + this.parseDelimiter();

    if (cmd === "begin") {
      const env = this.parseBracedArg();
      return this.convertEnvironment(env);
    }
    if (cmd === "end") {
      this.parseBracedArg();
      return "";
    }

    if (has(DECORATION_MAP, cmd)) {
      const arg = this.parseBracedArg();
      return DECORATION_MAP[cmd] + "{" + arg + "}";
    }

    if (has(SYMBOL_MAP, cmd)) return SYMBOL_MAP[cmd];
    if (FUNC_NAMES.has(cmd)) return cmd;
    if (BIG_OPS.has(cmd)) return cmd;

    this.warnings.push(`Unknown LaTeX command: \\${cmd}`);
    return cmd;
  }

  // ── 구분자 / 환경 ──

  private parseDelimiter(): string {
    this.skipSpaces();
    if (this.atEnd()) return "";
    const ch = this.peek();
    if (ch === "\\") {
      this.advance();
      const nextCh = this.peek();
      if (!isAlpha(nextCh)) {
        this.advance();
        const special: Record<string, string> = { "{": " lbrace", "}": " rbrace", "|": "||" };
        return has(special, nextCh) ? special[nextCh] : nextCh;
      }
      let cmd = "";
      while (!this.atEnd() && isAlpha(this.peek())) cmd += this.advance();
      const delimTable: Record<string, string> = {
        lbrace: " lbrace", rbrace: " rbrace",
        langle: " langle", rangle: " rangle",
        vert: "|", Vert: "||",
        lvert: "|", rvert: "|", lVert: "||", rVert: "||",
        lfloor: " lfloor", rfloor: " rfloor",
        lceil: " lceil", rceil: " rceil",
      };
      return has(delimTable, cmd) ? delimTable[cmd] : " " + cmd;
    } else if (ch === ".") {
      this.advance();
      return "";
    }
    this.advance();
    return ch;
  }

  private convertEnvironment(env: string): string {
    const raw = this.readUntilEnd(env);
    if (["matrix", "bmatrix", "pmatrix", "vmatrix", "Bmatrix", "Vmatrix", "smallmatrix"].includes(env)) {
      return this.convertMatrix(env, raw);
    }
    if (env === "cases") return this.convertCases(raw);
    if (["aligned", "align", "align*", "gathered", "split"].includes(env)) return this.convertAligned(raw);
    if (env === "array") return this.convertArray(raw);
    this.warnings.push(`Unknown environment: ${env}`);
    return new LatexToHwpConverter().convert(raw);
  }

  private readUntilEnd(env: string): string {
    const endMarker = "\\end{" + env + "}";
    const idx = this.src.indexOf(endMarker, this.pos);
    if (idx === -1) {
      const content = this.src.slice(this.pos);
      this.pos = this.src.length;
      return pyStrip(content);
    }
    const content = this.src.slice(this.pos, idx);
    this.pos = idx + endMarker.length;
    return pyStrip(content);
  }

  private splitTopLevel(text: string, delim: string): string[] {
    const parts: string[] = [];
    let current = "";
    let depth = 0;
    let i = 0;
    while (i < text.length) {
      if (text[i] === "{") {
        depth++;
        current += text[i];
      } else if (text[i] === "}") {
        depth--;
        current += text[i];
      } else if (depth === 0 && text.slice(i, i + delim.length) === delim) {
        parts.push(current);
        current = "";
        i += delim.length;
        continue;
      } else {
        current += text[i];
      }
      i++;
    }
    parts.push(current);
    return parts;
  }

  private convertRows(raw: string, joinCols: string): string[] {
    const rows: string[] = [];
    for (const r of this.splitTopLevel(raw, "\\\\")) {
      const row = pyStrip(r);
      if (!row) continue;
      const cols = this.splitTopLevel(row, "&");
      rows.push(cols.map((c) => new LatexToHwpConverter().convert(pyStrip(c))).join(joinCols));
    }
    return rows;
  }

  private convertMatrix(env: string, raw: string): string {
    // HWP 수식 표준 문법: `&` = 열 구분자, `#` = 행 구분자
    const inner = this.convertRows(raw, " & ").join(" # ");
    const wrap: Record<string, [string, string]> = {
      pmatrix: ["left( ", " right)"],
      bmatrix: ["left[ ", " right]"],
      vmatrix: ["left| ", " right|"],
      Bmatrix: ["left lbrace ", " right rbrace"],
      Vmatrix: ["left|| ", " right||"],
    };
    const [prefix, suffix] = has(wrap as unknown as Record<string, string>, env) ? wrap[env] : ["", ""];
    return prefix + "matrix{" + inner + "}" + suffix;
  }

  private convertCases(raw: string): string {
    return "cases{" + this.convertRows(raw, " & ").join(" # ") + "}";
  }

  private convertAligned(raw: string): string {
    // aligned 는 다중 라인 정렬 — 열(&)은 공백으로 합치고 행은 #
    return this.convertRows(raw, " ").join(" # ");
  }

  private convertArray(raw: string): string {
    let stripped = pyStrip(raw);
    if (stripped.startsWith("{")) {
      let depth = 0;
      for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === "{") depth++;
        else if (stripped[i] === "}") {
          depth--;
          if (depth === 0) {
            stripped = pyStrip(stripped.slice(i + 1));
            break;
          }
        }
      }
    }
    return this.convertMatrix("matrix", stripped);
  }
}
