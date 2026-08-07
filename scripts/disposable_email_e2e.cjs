// 일회용 메일 차단 e2e — dev 서버(localhost:3000) 대상.
// 계정을 만들지 않고 검증한다:
//   - 차단 대상: 정상 비밀번호로 보내도 "일회용" 400 이 떠야 한다
//   - 통과 대상: 짧은 비밀번호로 보내 "비밀번호 6자" 400 이 떠야 한다
//     (일회용 검사를 통과했다는 증거 — 계정은 생성되지 않는다)
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function signup(email, password) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    body: JSON.stringify({ email, password, agreed_terms: true, agreed_privacy: true }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
  console.log("=== 1. 실제 공격에 쓰인 도메인은 차단되어야 한다 ===");
  const attacked = [
    "test@colaname.com", "test@tnbeta.com", "test@usdtbeta.com",
    "test@colabeta.com", "test@linshiyou.com", "test@fft.edu.do",
  ];
  for (const e of attacked) {
    const r = await signup(e, "ValidPass123!");
    check(e, r.status === 400 && /일회용/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 2. 유명 임시메일 서비스도 차단되어야 한다 ===");
  for (const e of ["a@mailinator.com", "a@guerrillamail.com", "a@yopmail.com", "a@10minutemail.com", "a@temp-mail.org"]) {
    const r = await signup(e, "ValidPass123!");
    check(e, r.status === 400 && /일회용/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 3. 서브도메인 우회도 차단되어야 한다 ===");
  for (const e of ["a@mail.colaname.com", "a@x.y.tnbeta.com"]) {
    const r = await signup(e, "ValidPass123!");
    check(e, r.status === 400 && /일회용/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 4. 정상 도메인은 통과해야 한다 (오탐 없음 = 매출 보호) ===");
  // 짧은 비밀번호 → 일회용 검사를 지나 '비밀번호' 오류에서 멈춘다 = 계정 생성 안 됨
  const legit = [
    "teacher@naver.com", "teacher@gmail.com", "teacher@hanmail.net", "teacher@daum.net",
    "teacher@nate.com", "teacher@kakao.com", "teacher@outlook.com", "teacher@icloud.com",
    "teacher@hanwha.com", "teacher@sookmyung.ac.kr", "teacher@korea.kr", "teacher@yahoo.co.kr",
  ];
  for (const e of legit) {
    const r = await signup(e, "12");
    check(e, r.status === 400 && /비밀번호/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 5. 대소문자·공백 우회 차단 ===");
  for (const e of ["A@CoLaNaMe.CoM", " a@tnbeta.com "]) {
    const r = await signup(e, "ValidPass123!");
    check(JSON.stringify(e), r.status === 400 && /일회용/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
