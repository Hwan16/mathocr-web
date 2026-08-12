// 실제 가입 라우트에 요청을 보내 비공개 릴레이 허용이 동작하는지 확인한다.
// 실행: node scripts/privacy_relay_live_check.cjs   (dev 서버가 떠 있어야 함)
//
// 참고: 로컬 dev 에서는 x-forwarded-for 를 우리가 직접 넣을 수 있다.
// 운영(Vercel)에서는 플랫폼이 이 헤더를 덮어쓰므로 위조가 불가능하다.

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function trySignup(ip, email) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({
      email,
      password: "test-password-1234",
      termsAgreed: true,
      privacyAgreed: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, error: body.error ?? null };
}

// VPN 차단 문구가 나오는지로 판정한다 (다른 사유의 실패와 구분).
function isVpnBlocked(r) {
  return r.status === 400 && /VPN·프록시/.test(r.error ?? "");
}

// Apple 공식 목록에서 KR 로 표기된 실제 대역 (2026-08-12 기준)
const RELAY_IPS = [
  ["한국 릴레이 · 부산 (172.224.228.24/31)", "172.224.228.25"],
  ["한국 릴레이 · 서울 (172.224.228.32/28)", "172.224.228.40"],
  ["한국 릴레이 · 서울 (172.224.240.0/28)", "172.224.240.5"],
  ["한국 릴레이 · Cloudflare egress", "104.28.44.90"],
];

const VPN_IPS = [
  ["Datacamp/M247 계열", "5.253.204.1"],
  ["DigitalOcean", "165.227.1.1"],
  // 해외 릴레이는 의도적으로 차단 유지한다 — 고객은 국내이고 어뷰징은 전원 해외였다.
  // (해외 체류 고객 문의가 생기면 생성기의 COUNTRIES 에 국가를 추가해 재생성)
  ["해외 릴레이(아일랜드) — 정책상 차단 유지", "172.225.10.5"],
];

const NORMAL_IPS = [["KT 실고객 표본", "218.144.70.182"]];

(async () => {
  let pass = 0;
  let fail = 0;
  const stamp = Date.now();

  console.log("=== 1. 한국 iCloud 비공개 릴레이는 통과해야 한다 ===");
  for (const [name, ip] of RELAY_IPS) {
    const r = await trySignup(ip, `relay${stamp}${ip.replace(/\./g, "")}@naver.com`);
    if (isVpnBlocked(r)) {
      console.log(`  FAIL  ${name} (${ip}) — VPN 차단됨: ${r.error}`);
      fail += 1;
    } else {
      console.log(`  PASS  ${name} (${ip}) — VPN 차단 아님 (status ${r.status})`);
      pass += 1;
    }
  }

  console.log("\n=== 2. 데이터센터·VPN 은 여전히 차단되어야 한다 ===");
  for (const [name, ip] of VPN_IPS) {
    const r = await trySignup(ip, `vpn${stamp}${ip.replace(/\./g, "")}@naver.com`);
    if (isVpnBlocked(r)) {
      console.log(`  PASS  ${name} (${ip}) — 차단 유지`);
      pass += 1;
    } else {
      console.log(`  FAIL  ${name} (${ip}) — 통과됨! status ${r.status} ${r.error ?? ""}`);
      fail += 1;
    }
  }

  console.log("\n=== 3. 국내 정상 회선은 통과 ===");
  for (const [name, ip] of NORMAL_IPS) {
    const r = await trySignup(ip, `normal${stamp}@naver.com`);
    if (isVpnBlocked(r)) {
      console.log(`  FAIL  ${name} (${ip}) — VPN 차단됨`);
      fail += 1;
    } else {
      console.log(`  PASS  ${name} (${ip}) — VPN 차단 아님 (status ${r.status})`);
      pass += 1;
    }
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail === 0 ? 0 : 1);
})();
