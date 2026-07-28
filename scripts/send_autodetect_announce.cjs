// 자동 인식(v2.2.0) 출시 안내 발송 실행기 (2026-07-28)
//
// 실제 발송 로직은 서버 /api/admin/autodetect-announce 에 있다 — RESEND_API_KEY가
// Vercel Sensitive라 로컬에서 직접 발송할 수 없어서다 (terms-notice와 같은 패턴).
// 본문·대상 선정은 src/lib/autodetect-announce-mail.ts + 라우트 참조.
//
// 사용법:
//   node scripts/send_autodetect_announce.cjs           # dry-run: 서버가 대상만 반환
//   node scripts/send_autodetect_announce.cjs --send    # 실제 발송 (Idempotency-Key로 중복 방지)
// 기본 대상 서버는 프로덕션. 로컬 dev 서버로 돌리려면 E2E_BASE_URL=http://localhost:3000
const fs = require("fs");
const path = require("path");
const WEB = path.join(__dirname, "..");

// .env.local 파싱 — CRON_SECRET(호출 인증)만 필요. BOM이 있어도 첫 키를 놓치지 않게 제거
const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").replace(/^﻿/, "").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
if (!env.CRON_SECRET) {
  console.error("env 누락: CRON_SECRET (.env.local)");
  process.exit(1);
}

const BASE_URL = process.env.E2E_BASE_URL || "https://mathocr.ai.kr";
const SEND = process.argv.includes("--send");

async function main() {
  const url = `${BASE_URL}/api/admin/autodetect-announce${SEND ? "?send=1" : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`실패 (${res.status}):`, JSON.stringify(body));
    process.exit(1);
  }
  console.log(JSON.stringify(body, null, 2));
  if (!SEND) console.log("\n(dry-run — 발송하려면 --send)");
}

main();
