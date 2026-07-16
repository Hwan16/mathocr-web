// A-1 신고 이미지 자동 파기 e2e (로컬 dev 서버 + 실 Supabase 대상, 일회용 계정 생성 후 정리)
// 사용법: node scripts/report_purge_e2e.cjs [--base http://localhost:3000]
//
// 검증 매트릭스:
//   1) 무인증/비관리자 PATCH → 403
//   2) 확인(reviewed) 전환 → Storage 이미지 2장 소멸 + 경로 null (+0019 적용 시 파기 시각 기록)
//   3) 같은 상태 재전환 → images:"none" (멱등, 에러 없음)
//   4) 접수(received) 유지 → 이미지 보존 (검수 전 파기 금지)
//   5) 채택+보상(reward) → 지급 + 이미지 파기, 재실행 409 (중복 지급 방지 회귀)
// 0019 미적용 환경이면 파기 시각 검증만 건너뛴다(파기 자체는 폴백으로 동작해야 함).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WEB = path.join(__dirname, "..");
const { createClient } = require(path.join(WEB, "node_modules/@supabase/supabase-js"));

const baseIdx = process.argv.indexOf("--base");
const BASE_URL = baseIdx > -1 ? process.argv[baseIdx + 1] : "http://localhost:3000";

// .env.local 파싱
const env = {};
for (const line of fs.readFileSync(path.join(WEB, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

async function makeReport(uid, tag) {
  const { data: report, error } = await admin
    .from("conversion_reports")
    .insert({ user_id: uid, comment: `report-purge e2e ${tag}` })
    .select("id")
    .single();
  if (error) throw new Error(`신고 행 삽입 실패(${tag}): ` + error.message);
  const paths = [`${uid}/${report.id}/original.png`, `${uid}/${report.id}/converted.png`];
  for (const p of paths) {
    const { error: upErr } = await admin.storage
      .from("reports")
      .upload(p, PNG, { contentType: "image/png" });
    if (upErr) throw new Error(`storage 업로드 실패(${tag}): ` + upErr.message);
  }
  const { error: updErr } = await admin
    .from("conversion_reports")
    .update({ original_image_path: paths[0], converted_image_path: paths[1] })
    .eq("id", report.id);
  if (updErr) throw new Error(`경로 기록 실패(${tag}): ` + updErr.message);
  return report.id;
}

async function storageCount(uid, reportId) {
  const { data, error } = await admin.storage.from("reports").list(`${uid}/${reportId}`);
  if (error) throw new Error("storage list 실패: " + error.message);
  return (data ?? []).length;
}

async function patchReport(id, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}/api/admin/reports/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const ts = Date.now();
  const reporterEmail = `report-purge-e2e-user-${ts}@example.com`;
  const adminEmail = `report-purge-e2e-admin-${ts}@example.com`;
  const password = `E2e!${ts}#${crypto.randomBytes(8).toString("hex")}`;
  console.log(`테스트 계정: ${reporterEmail} / ${adminEmail} (서버: ${BASE_URL})`);

  // 0019 적용 여부 감지 (미적용이면 파기 시각 검증 건너뜀)
  const probe = await admin.from("conversion_reports").select("images_deleted_at").limit(1);
  const hasPurgeColumn = !probe.error;
  console.log(`images_deleted_at 컬럼: ${hasPurgeColumn ? "있음(0019 적용)" : "없음(0019 미적용 — 폴백 검증)"}`);

  // 계정 생성
  const { data: reporterCreated, error: rErr } = await admin.auth.admin.createUser({
    email: reporterEmail, password, email_confirm: true,
  });
  if (rErr) throw new Error("신고자 계정 생성 실패: " + rErr.message);
  const reporterUid = reporterCreated.user.id;

  let adminUid = null;
  let report1 = null, report2 = null;

  try {
    const { data: adminCreated, error: aErr } = await admin.auth.admin.createUser({
      email: adminEmail, password, email_confirm: true,
    });
    if (aErr) throw new Error("관리자 계정 생성 실패: " + aErr.message);
    adminUid = adminCreated.user.id;

    const { error: roleErr } = await admin
      .from("profiles").update({ role: "admin" }).eq("id", adminUid);
    if (roleErr) throw new Error("관리자 role 지정 실패: " + roleErr.message);

    // 신고 2건 + 이미지 각 2장
    report1 = await makeReport(reporterUid, "r1");
    report2 = await makeReport(reporterUid, "r2");
    check("셋업: 신고 2건 이미지 각 2장", (await storageCount(reporterUid, report1)) === 2 && (await storageCount(reporterUid, report2)) === 2);

    // 토큰
    const { data: adminSignin, error: asErr } = await anon.auth.signInWithPassword({ email: adminEmail, password });
    if (asErr) throw new Error("관리자 로그인 실패: " + asErr.message);
    const adminToken = adminSignin.session.access_token;
    const { data: reporterSignin, error: rsErr } = await anon.auth.signInWithPassword({ email: reporterEmail, password });
    if (rsErr) throw new Error("신고자 로그인 실패: " + rsErr.message);
    const reporterToken = reporterSignin.session.access_token;

    // 1) 권한
    let r = await patchReport(report1, null, { status: "reviewed" });
    check("무인증 PATCH → 403", r.status === 403, `status=${r.status}`);
    r = await patchReport(report1, reporterToken, { status: "reviewed" });
    check("비관리자 PATCH → 403", r.status === 403, `status=${r.status}`);
    check("403 이후 이미지 보존", (await storageCount(reporterUid, report1)) === 2);

    // 2) 확인(reviewed) → 파기
    r = await patchReport(report1, adminToken, { status: "reviewed" });
    check("확인 전환 200 + images=purged", r.status === 200 && r.data.images === "purged", JSON.stringify(r));
    check("Storage 이미지 2장 소멸", (await storageCount(reporterUid, report1)) === 0);
    const { data: row1 } = await admin
      .from("conversion_reports")
      .select("*").eq("id", report1).single();
    check("경로 null 처리", row1.original_image_path === null && row1.converted_image_path === null, JSON.stringify(row1));
    check("상태 reviewed 반영", row1.status === "reviewed");
    if (hasPurgeColumn) {
      check("파기 시각 기록됨", typeof row1.images_deleted_at === "string" && row1.images_deleted_at.length > 0, JSON.stringify(row1.images_deleted_at));
    }

    // 3) 멱등 재실행
    r = await patchReport(report1, adminToken, { status: "reviewed" });
    check("재전환 200 + images=none (멱등)", r.status === 200 && r.data.images === "none", JSON.stringify(r.data));

    // 4) 접수(received)로는 파기 안 함
    r = await patchReport(report2, adminToken, { status: "received" });
    check("접수 전환 200 + images=kept", r.status === 200 && r.data.images === "kept", JSON.stringify(r.data));
    check("접수 상태 이미지 보존", (await storageCount(reporterUid, report2)) === 2);

    // 5) 채택+보상 → 지급 + 파기
    const { data: before } = await admin.from("profiles").select("credits").eq("id", reporterUid).single();
    r = await patchReport(report2, adminToken, { reward: true });
    check("보상 200 + images=purged", r.status === 200 && r.data.rewarded === true && r.data.images === "purged", JSON.stringify(r.data));
    const { data: after } = await admin.from("profiles").select("credits").eq("id", reporterUid).single();
    check("50크레딧 지급", after.credits - before.credits === 50, `before=${before.credits} after=${after.credits}`);
    check("보상 후 이미지 소멸", (await storageCount(reporterUid, report2)) === 0);
    const { data: row2 } = await admin.from("conversion_reports").select("*").eq("id", report2).single();
    check("상태 accepted + rewarded", row2.status === "accepted" && row2.rewarded === true);

    // 6) 보상 재실행 → 409 (기존 중복 방지 회귀)
    r = await patchReport(report2, adminToken, { reward: true });
    check("보상 재실행 409", r.status === 409, `status=${r.status}`);
  } finally {
    // 정리: storage 잔여물 → 보상 payments 행(정확 id만) → 계정(cascade로 신고 행 삭제)
    for (const rid of [report1, report2]) {
      if (rid) {
        await admin.storage.from("reports")
          .remove([`${reporterUid}/${rid}/original.png`, `${reporterUid}/${rid}/converted.png`])
          .catch(() => {});
      }
    }
    if (report2) {
      await admin.from("payments").delete().eq("pg_transaction_id", `report_reward_${report2}`);
    }
    await admin.auth.admin.deleteUser(reporterUid).catch(() => {});
    if (adminUid) await admin.auth.admin.deleteUser(adminUid).catch(() => {});
    // 관리자 임시계정이 실제로 사라졌는지 확인 (임시 admin 잔존 = 보안 구멍)
    const { data: still } = await admin.auth.admin.getUserById(adminUid).catch(() => ({ data: null }));
    console.log(still?.user ? "⚠️ 관리자 테스트 계정 삭제 실패 — 수동 삭제 필요: " + adminEmail : "정리 완료 (관리자 테스트 계정 삭제 확인)");
  }

  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error("스크립트 오류:", e); process.exit(2); });
