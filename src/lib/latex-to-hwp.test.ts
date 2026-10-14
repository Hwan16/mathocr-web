import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LatexToHwpConverter, splitTextAndLatex } from "./latex-to-hwp.ts";
import { convertDocument } from "./latex-tool.ts";

// 앱 변환기(부모 repo src/latex_to_hwp.py)가 낸 결과 — 부모 repo `python tools/latex_web_parity.py` 로 다시 만든다.
const parity = JSON.parse(readFileSync(new URL("./latex-to-hwp.parity.json", import.meta.url), "utf8")) as {
  convert: Array<{ latex: string; hwp: string }>;
  split: Array<{ value: string; segments: Array<[string, string]> }>;
};

test(`앱 변환기와 같은 결과 (${parity.convert.length}건)`, () => {
  const diffs: string[] = [];
  for (const { latex, hwp } of parity.convert) {
    const got = new LatexToHwpConverter().convert(latex);
    if (got !== hwp) diffs.push(`IN  ${latex}\nAPP ${hwp}\nWEB ${got}`);
  }
  assert.equal(diffs.length, 0, diffs.join("\n\n"));
});

test(`글에 섞인 LaTeX 분리도 앱과 같음 (${parity.split.length}건)`, () => {
  for (const { value, segments } of parity.split) {
    assert.deepEqual(splitTextAndLatex(value), segments, value);
  }
});

test("ChatGPT 답변: \\( \\)·\\[ \\]·$ 구분자에서 수식만 골라 변환", () => {
  const items = convertDocument(
    "근의 공식은 \\(x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\\) 입니다.\n\n\\[\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n\\]\n그리고 $a \\neq b$."
  );
  const math = items.filter((i) => i.kind === "math");
  assert.equal(math.length, 3);
  assert.equal(math[0].hwp, "x = {-b +- sqrt{b^{2}-4ac}} over {2a}");
  assert.equal(math[0].display, false);
  assert.equal(math[1].hwp, "int _{0}^{1} x^{2} dx = {1} over {3}");
  assert.equal(math[1].display, true);
  assert.equal(math[2].hwp, "a ≠ b");
  assert.ok(items.some((i) => i.kind === "text" && i.text.includes("근의 공식은")));
});

test("구분자 없는 순수 수식은 통째로 하나", () => {
  const items = convertDocument("\\frac{a}{b} + \\sqrt{2}");
  assert.deepEqual(
    items.map((i) => (i.kind === "math" ? i.hwp : null)),
    ["{a} over {b} + sqrt{2}"]
  );
});

test("구분자 없이 한글 문장에 섞인 LaTeX는 앱과 같은 방식으로 분리", () => {
  const items = convertDocument("따라서 \\frac{a}{b} 이므로");
  assert.deepEqual(
    items.map((i) => (i.kind === "math" ? ["math", i.hwp] : ["text", i.text])),
    [["text", "따라서 "], ["math", "{a} over {b}"], ["text", " 이므로"]]
  );
});

test("돈 표시 같은 홑 $는 수식으로 보지 않음", () => {
  const items = convertDocument("가격은 $5 입니다");
  assert.ok(items.every((i) => i.kind === "text"));
});
