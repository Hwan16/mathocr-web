import test from "node:test";
import assert from "node:assert/strict";

import { fixExplainContent } from "./explain-postfix.ts";

// 부모 repo tools/explain_gen/postfix.py 의 자체 점검 사례와 같다 — 두 구현이 같은 결과를 내야 한다.
const t = (value: string) => ({ type: "text" as const, value });
const mi = (value: string) => ({ type: "math_inline" as const, value });
const mb = (value: string) => ({ type: "math_block" as const, value });
const lb = { type: "line_break" as const };

const CASES: Array<[string, unknown[], unknown[]]> = [
  ["블록 수식 뒤 식 번호를 식 끝으로", [mb("a = b+9"), t("…… ㉠상수항을 비교하면")],
    [mb("a = b+9 \\quad \\cdots\\cdots \\; ㉠"), t("상수항을 비교하면")]],
  ["text 안 붙은 문장 나누기", [t("일치한다.따라서 "), mi("a+b=5"), t("이다.")],
    [t("일치한다."), lb, t("따라서 "), mi("a+b=5"), t("이다.")]],
  ["'.'으로 끝난 text 뒤 text", [t("이다."), t("이 식이")], [t("이다."), lb, t("이 식이")]],
  ["'.'으로 끝난 text 뒤 수식", [t("정수이다."), mi("\\log_2 n = m")], [t("정수이다."), lb, mi("\\log_2 n = m")]],
  ["소수·말줄임은 그대로", [t("값은 3.5이고 "), mi("x"), t("는 …… 이다.")], [t("값은 3.5이고 "), mi("x"), t("는 …… 이다.")]],
  ["이미 줄바꿈이 있으면 그대로", [t("이다."), lb, t("따라서")], [t("이다."), lb, t("따라서")]],
  ["블록 수식 앞뒤엔 줄바꿈을 넣지 않음", [t("다음과 같다."), mb("x=1"), t("따라서")], [t("다음과 같다."), mb("x=1"), t("따라서")]],
  ["번호 가리키기('㉠의 양변에')는 그대로", [mb("x=1"), t("㉠의 양변에")], [mb("x=1"), t("㉠의 양변에")]],
  ["번호 달기 뒤 바로 번호 가리키기", [mb("y=2"), t("…… ㉣㉢에서 ㉣을")], [mb("y=2 \\quad \\cdots\\cdots \\; ㉣"), t("㉢에서 ㉣을")]],
  ["수식 뒤 접속어", [mi("k=2^{5}=32"), t("따라서 구하는 값은")], [mi("k=2^{5}=32"), lb, t("따라서 구하는 값은")]],
  ["닫는 괄호 뒤 접속어", [t("(∵ "), mi("b>0"), t(")따라서 주기는")], [t("(∵ "), mi("b>0"), t(")"), lb, t("따라서 주기는")]],
  ["문장 중간 접속어는 그대로", [mi("x=1"), t("이므로 따라서")], [mi("x=1"), t("이므로 따라서")]],
  ["(단, …) 단서 뒤", [mb("F(x)=2x^3+C"), t("(단, "), mi("C"), t("는 적분상수)"), mi("x=0"), t("을 대입하면")],
    [mb("F(x)=2x^3+C"), t("(단, "), mi("C"), t("는 적분상수)"), lb, mi("x=0"), t("을 대입하면")]],
  ["번호 달린 문장 속 수식은 블록 수식으로", [t("비교하면"), mi("a = b+9"), t(" …… ㉠"), lb, t("상수항에서")],
    [t("비교하면"), mb("a = b+9 \\quad \\cdots\\cdots \\; ㉠"), t("상수항에서")]],
  ["단서 뒤 조사 이어짐은 그대로", [t("(단, "), mi("x>0"), t(")일 때 "), mi("y")], [t("(단, "), mi("x>0"), t(")일 때 "), mi("y")]],
];

for (const [name, input, want] of CASES) {
  test(`후처리: ${name}`, () => {
    assert.deepEqual(fixExplainContent(input as never), want);
  });
}

test("후처리: 입력을 바꾸지 않는다", () => {
  const input = [t("이다.따라서"), mi("x")];
  const copy = JSON.parse(JSON.stringify(input));
  fixExplainContent(input);
  assert.deepEqual(input, copy);
});
