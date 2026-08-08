// 가입 방어선 e2e — 일회용 도메인 / 별칭(+) / 지메일 점(.) / 데이터센터 IP.
// 사용법: (dev 서버 실행 중에) node scripts/signup_guards_e2e.cjs
//
// 계정을 만들지 않는다:
//  - 차단 케이스는 400에서 멈추고
//  - 통과 케이스는 일부러 짧은 비밀번호를 보내 "비밀번호 6자" 오류로 멈춘다
//    (= 모든 차단 검사를 통과했다는 증거이면서 계정은 생기지 않음)
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// IP 지정이 없으면 매번 다른 한국 가정용 IP를 쓴다.
// 같은 IP를 반복하면 "IP당 5회/시간" 제한(429)에 걸려 정작 검사하려던 방어선까지
// 못 가본다. 218.155.0.0/16 은 차단 목록에 없음을 확인한 대역이다.
const koreanIp = () =>
  `218.155.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;

async function signup(email, password, ip = koreanIp()) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password, agreed_terms: true, agreed_privacy: true }),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

(async () => {
  console.log("=== 1. 지메일 점(.) 차단 ===");
  for (const e of ["hong.gil@gmail.com", "a.b.c@gmail.com", "Hong.Gil@GMAIL.COM", "x.y@googlemail.com"]) {
    const r = await signup(e, "ValidPass123!");
    check(e, r.status === 400 && /점/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 2. 점 없는 지메일은 통과해야 한다 ===");
  for (const e of ["honggil@gmail.com", "teacher2026@gmail.com"]) {
    const r = await signup(e, "12");
    check(e, r.status === 400 && /비밀번호/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 3. 회사·학교 메일의 점은 막으면 안 된다 (실고객 보호) ===");
  for (const e of ["ahhyeon.yun@hanwha.com", "kim.teacher@sookmyung.ac.kr", "a.b@naver.com", "a.b@hanmail.net"]) {
    const r = await signup(e, "12");
    check(e, r.status === 400 && /비밀번호/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 4. 데이터센터·VPN IP 차단 (실제 공격에 쓰인 IP) ===");
  for (const ip of ["37.19.199.146", "138.199.50.101", "212.102.51.245", "156.146.51.133", "185.183.33.220"]) {
    const r = await signup(`teacher${Date.now()}@naver.com`, "ValidPass123!", ip);
    check(`IP ${ip}`, r.status === 400 && /VPN/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 5. 실제 고객 IP는 통과해야 한다 (오탐 없음) ===");
  // 전부 실제 고객이 가입에 쓴 IP (KT·SKT·LG 가정용/모바일)
  for (const ip of ["218.144.70.182", "222.109.110.109", "1.236.26.232", "121.151.30.247", "112.169.30.165", "211.234.200.44", "58.29.100.124", "124.48.177.130", "210.117.73.242", "114.202.238.235"]) {
    const r = await signup(`teacher${Date.now()}@naver.com`, "12", ip);
    check(`IP ${ip}`, r.status === 400 && /비밀번호/.test(r.json.error ?? ""), `status=${r.status} error=${r.json.error}`);
  }

  console.log("\n=== 6. 기존 방어선 회귀 확인 ===");
  const d = await signup("probe@colaname.com", "ValidPass123!");
  check("일회용 도메인 차단 유지", d.status === 400 && /일회용/.test(d.json.error ?? ""), JSON.stringify(d.json));
  const p = await signup("probe+alias@hotmail.com", "ValidPass123!");
  check("별칭(+) 차단 유지", p.status === 400 && /별칭/.test(p.json.error ?? ""), JSON.stringify(p.json));

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
