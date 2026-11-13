import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateAffected,
  buildOutageNoticeHtml,
  buildRecoveredAlert,
  buildStoppedAlert,
  escapeHtml,
  formatDuration,
  formatKst,
  isProviderOutageAttempt,
  isProviderOutageStatus,
  maskEmail,
  outageNoticeEligibility,
  targetFingerprint,
  type OutageLogRow,
} from "./provider-outage.ts";

test("제공사 장애 = 5xx 만 (4xx 는 우리 쪽 문제)", () => {
  for (const s of [500, 502, 503, 504, 529]) assert.equal(isProviderOutageStatus(s), true, String(s));
  for (const s of [200, 400, 401, 403, 413, 429, 0, 600]) assert.equal(isProviderOutageStatus(s), false, String(s));
});

test("호출 단위 장애 판정 — 제공사 5xx·시간 초과만, 우리 쪽 연결 실패·4xx·본문 깨짐은 아님", () => {
  assert.equal(isProviderOutageAttempt({ upstreamStatus: 529 }), true);
  assert.equal(isProviderOutageAttempt({ upstreamStatus: 502 }), true); // 앞단 502 페이지(JSON 아님)
  assert.equal(isProviderOutageAttempt({ transport: "timeout" }), true);
  assert.equal(isProviderOutageAttempt({ transport: "network" }), false);
  assert.equal(isProviderOutageAttempt({ upstreamStatus: 401 }), false); // 키 문제 + 본문 깨짐 → 합성 500
  assert.equal(isProviderOutageAttempt({ upstreamStatus: 200 }), false);
  assert.equal(isProviderOutageAttempt({}), false);
});

test("발송 대상 지문 — 순서와 무관, 한 명만 달라도 다름", () => {
  const a = targetFingerprint(["u2", "u1"]);
  assert.equal(a, targetFingerprint(["u1", "u2"]));
  assert.notEqual(a, targetFingerprint(["u1", "u2", "u3"]));
  assert.notEqual(a, targetFingerprint(["u1", "u4"]));
  assert.match(a, /^2-[0-9a-f]{8}$/);
});

test("정상화 알림 — 복구 시각을 until 로 고정해 안내, 일부만 셈 표시", () => {
  const { html } = buildRecoveredAlert({
    since: "2026-11-13T13:09:00.000Z",
    recoveredAt: new Date("2026-11-13T15:29:00.000Z"),
    probeModel: "claude-sonnet-5-5",
    affected: 4,
    eligible: 3,
    truncated: true,
  });
  assert.match(html, /2시간 20분/);
  assert.match(html, /until=2026-11-13T15:29:00\.000Z/);
  assert.match(html, /4명\+/);
});

test("한국 시간·기간 표기", () => {
  assert.equal(formatKst("2026-11-13T13:09:00Z"), "11월 13일 22:09");
  assert.equal(formatKst("2026-11-13T15:30:00Z"), "11월 14일 00:30");
  assert.equal(formatKst("nope"), "");
  assert.equal(formatDuration(35 * 60_000), "35분");
  assert.equal(formatDuration(80 * 60_000), "1시간 20분");
  assert.equal(formatDuration(120 * 60_000), "2시간");
});

test("이메일 가리기·HTML 이스케이프", () => {
  assert.equal(maskEmail("abcdef@gmail.com"), "ab***@gmail.com");
  assert.equal(maskEmail("a@x.kr"), "a***@x.kr");
  assert.equal(maskEmail("broken"), "***");
  assert.equal(escapeHtml(`<b>"x"&'y'</b>`), "&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;");
});

const row = (
  user: string | null,
  at: string,
  metadata: unknown,
  conversion: string | null = null
): OutageLogRow => ({ user_id: user, conversion_id: conversion, created_at: at, metadata });

test("회원별로 묶기 — ai_service_down 만, 최초·최근 시각·표시 합치기", () => {
  const members = aggregateAffected([
    row("u1", "2026-11-13T13:20:00Z", { category: "ai_service_down", service_detail: "Overloaded" }, "c1"),
    row("u2", "2026-11-13T13:15:00Z", { category: "ai_service_down", provider_outage: true }, "c2"),
    row("u1", "2026-11-13T13:10:00Z", { category: "ai_service_down", provider_outage: true, service_detail: "Overloaded" }, "c3"),
    row("u3", "2026-11-13T13:12:00Z", { category: "hwp_not_responding" }),
    row(null, "2026-11-13T13:12:00Z", { category: "ai_service_down" }),
    row("u4", "2026-11-13T13:12:00Z", "not-an-object"),
  ]);
  assert.deepEqual(members.map((m) => m.user_id), ["u1", "u2"]);
  const u1 = members[0];
  assert.equal(u1.failures, 2);
  assert.equal(u1.first_at, "2026-11-13T13:10:00Z");
  assert.equal(u1.last_at, "2026-11-13T13:20:00Z");
  assert.equal(u1.provider_outage, true);
  assert.deepEqual(u1.details, ["Overloaded"]);
  assert.deepEqual(u1.conversion_ids, ["c1", "c3"]);
});

test("복구 메일 대상 — 약속받은 회원만 기본, 구버전은 include_legacy 로, 한도·인터넷만이면 제외", () => {
  const base = {
    user_id: "u",
    first_at: "",
    last_at: "",
    failures: 1,
    conversion_ids: [],
  };
  assert.deepEqual(outageNoticeEligibility({ ...base, provider_outage: true, details: [] }, false), {
    eligible: true,
    reason: "provider_outage",
  });
  const legacy = { ...base, provider_outage: false, details: ["Overloaded"] };
  assert.equal(outageNoticeEligibility(legacy, false).eligible, false);
  assert.equal(outageNoticeEligibility(legacy, true).eligible, true);
  const limitOnly = {
    ...base,
    provider_outage: false,
    details: ["일일 처리 한도에 도달했습니다. 내일 다시 시도해주세요.", "서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요."],
  };
  assert.deepEqual(outageNoticeEligibility(limitOnly, true), { eligible: false, reason: "limit_or_network" });
  const mixed = { ...limitOnly, details: [...limitOnly.details, "Overloaded"] };
  assert.equal(outageNoticeEligibility(mixed, true).eligible, true);
  // 앱의 실제 네트워크 문구들(api_client.py)도 제외 — Codex 검토 반영
  for (const d of [
    "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    "서버 응답 시간이 초과되었습니다.",
    "서버 응답을 해석할 수 없습니다. 잠시 후 다시 시도해주세요.",
  ]) {
    assert.equal(outageNoticeEligibility({ ...base, provider_outage: false, details: [d] }, true).eligible, false, d);
  }
  // 구버전인데 원인 문구가 없으면 근거 부족 — 제외
  assert.deepEqual(outageNoticeEligibility({ ...base, provider_outage: false, details: [] }, true), {
    eligible: false,
    reason: "legacy_no_detail",
  });
});

test("회원 메일 — 장애 시각·사과·정상화·반환, 광고 문구 없음", () => {
  const html = buildOutageNoticeHtml("2026-11-13T13:09:00Z");
  assert.match(html, /11월 13일 22:09쯤/);
  assert.match(html, /사과드립니다/);
  assert.match(html, /정상화되어/);
  assert.match(html, /자동으로 반환되었습니다/);
  for (const banned of ["충전", "할인", "이벤트", "수신거부", "Claude", "http"]) {
    assert.equal(html.includes(banned), false, banned);
  }
});

test("관리자 중단 알림 — 회원이 보낸 문자열은 이스케이프", () => {
  const { subject, html } = buildStoppedAlert({
    at: new Date("2026-11-13T13:30:00Z"),
    detail: "<script>x</script>",
    providerOutage: true,
    outageSince: "2026-11-13T13:09:00Z",
    outageDetail: "5.5 http_529:overloaded_error",
    userId: "0f22458a-dcd5-4bc4-a814-762c8822e8a7",
    conversionId: null,
  });
  assert.match(subject, /제공사 장애/);
  assert.equal(html.includes("<script>"), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /0f22458a…/);
  assert.equal(html.includes("dcd5"), false);
});
