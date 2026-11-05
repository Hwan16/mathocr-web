// 내 파일함(D-054) 규칙 테스트 — npm run test:filebox
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeExpiresAt,
  decodePreviewPng,
  isMissingTableError,
  isShareToken,
  newShareToken,
  removeInChunks,
  sanitizeFileName,
  sanitizePreview,
  withDownloadName,
} from "./file-box.ts";
import { expiryInfo, formatDay } from "./file-box-types.ts";

const kst = (iso: string) => new Date(iso + "+09:00");

test("만료일 = 변환일(한국 날짜) + 30일째 23:59:59 KST", () => {
  // 10/06 변환 → 11/05 밤 (사용자와 정한 예시)
  assert.equal(computeExpiresAt(kst("2026-10-06T13:02:00")).toISOString(), "2026-11-05T14:59:59.999Z");
  // 한국 새벽 0시 30분(UTC로는 전날)도 한국 날짜 기준
  assert.equal(computeExpiresAt(kst("2026-10-06T00:30:00")).toISOString(), "2026-11-05T14:59:59.999Z");
  // 한국 밤 23시 59분 변환도 같은 날 기준
  assert.equal(computeExpiresAt(kst("2026-10-06T23:59:00")).toISOString(), "2026-11-05T14:59:59.999Z");
  // 해·달 넘김
  assert.equal(computeExpiresAt(kst("2026-12-15T10:00:00")).toISOString(), "2027-01-14T14:59:59.999Z");
});

test("보관 기한 단계 — 오늘·내일·7일 이하·보통·만료", () => {
  const now = kst("2026-11-05T10:00:00");
  const f = (createdKst: string) => ({
    expires_at: computeExpiresAt(kst(createdKst)).toISOString(),
    expired: false,
  });
  assert.equal(expiryInfo(f("2026-10-06T13:02:00"), now).state, "today");
  assert.equal(expiryInfo(f("2026-10-07T19:15:00"), now).state, "tomorrow");
  assert.equal(expiryInfo(f("2026-10-12T16:48:00"), now).state, "soon"); // 6일 남음
  assert.equal(expiryInfo(f("2026-10-12T16:48:00"), now).daysLeft, 6);
  assert.equal(expiryInfo(f("2026-10-13T09:00:00"), now).state, "soon"); // 7일 남음 — 주황 시작
  assert.equal(expiryInfo(f("2026-10-14T09:00:00"), now).state, "normal"); // 8일 남음
  assert.equal(expiryInfo(f("2026-10-03T22:10:00"), now).state, "expired");
  assert.equal(expiryInfo({ ...f("2026-11-03T14:22:00"), expired: true }, now).state, "expired");
  // 오늘 23:59 지나면 만료
  assert.equal(expiryInfo(f("2026-10-06T13:02:00"), kst("2026-11-06T00:00:01")).state, "expired");
});

test("날짜 표시는 브라우저 시간대와 상관없이 한국 날짜", () => {
  const now = kst("2026-11-05T10:00:00");
  assert.equal(formatDay(new Date("2026-11-05T14:59:59.999Z"), now), "11.05 (목)");
  assert.equal(formatDay(new Date("2027-01-14T14:59:59.999Z"), now), "2027.01.14 (목)");
});

test("파일 이름 — 경로·제어 문자 제거, 확장자 보장, 길이 제한", () => {
  assert.equal(sanitizeFileName("미적분 (3) 변형_변환.hwp"), "미적분 (3) 변형_변환.hwp");
  assert.equal(sanitizeFileName("..\\..\\a/b:c.hwp"), ".. .. a b c.hwp");
  assert.equal(sanitizeFileName("시험지"), "시험지.hwp");
  assert.equal(sanitizeFileName("  "), null);
  assert.equal(sanitizeFileName(123), null);
  const long = sanitizeFileName("가".repeat(300) + ".hwp")!;
  assert.ok(long.length <= 120 && long.endsWith(".hwp"));
});

test("받기 링크 토큰 — 32자 주소 안전 문자", () => {
  const t = newShareToken();
  assert.equal(t.length, 32);
  assert.ok(isShareToken(t));
  assert.ok(!isShareToken("../../etc"));
  assert.ok(!isShareToken(t + "x"));
});

test("미리보기 — 허용된 블록만 남기고 모르는 값은 버린다", () => {
  const p = sanitizePreview({
    number: 1,
    body: [
      { t: "text", v: "곡선 " },
      { t: "math", v: "y=x^2" },
      { t: "script", v: "<script>alert(1)</script>" },
      { t: "img", src: "http://evil" },
      { t: "box", kind: "weird", items: [{ t: "text", v: "(가)" }] },
    ],
    choices: [{ label: "①", items: [{ t: "math", v: "\\frac{2}{3}" }] }],
    answer: "③",
    extra: "버려짐",
  });
  assert.deepEqual(p, {
    v: 1,
    number: 1,
    body: [
      { t: "text", v: "곡선 " },
      { t: "math", v: "y=x^2" },
      { t: "img" },
      { t: "box", kind: "condition", items: [{ t: "text", v: "(가)" }] },
    ],
    choices: [{ label: "①", items: [{ t: "math", v: "\\frac{2}{3}" }] }],
    answer: "③",
  });
  assert.equal(sanitizePreview({ body: [] }), null);
  assert.equal(sanitizePreview("문자열"), null);
  assert.equal(sanitizePreview({ body: [{ t: "text", v: "x".repeat(70_000) }] }), null); // 64KB 초과
});

test("받을 이름 — &·#·한글이 서명 URL 에서 잘리지 않는다", () => {
  const u = new URL(withDownloadName("https://x.supabase.co/storage/v1/object/sign/file-box/a/b/file.hwp?token=abc", "문제 & 해설 #1.hwp"));
  assert.equal(u.searchParams.get("token"), "abc");
  assert.equal(u.searchParams.get("download"), "문제 & 해설 #1.hwp");
  assert.equal(u.hash, "");
});

test("표 없음 오류만 구분", () => {
  assert.ok(isMissingTableError({ code: "42P01", message: 'relation "public.stored_files" does not exist' }));
  assert.ok(isMissingTableError({ code: "PGRST205", message: "Could not find the table 'public.stored_files'" }));
  assert.ok(!isMissingTableError({ code: "57014", message: "canceling statement due to statement timeout" }));
  assert.ok(!isMissingTableError(null));
});

test("나눠 지우기 — 1,000개씩, 실패하면 멈춤", async () => {
  const calls: number[] = [];
  const ok = { remove: async (p: string[]) => (calls.push(p.length), { error: null }) };
  assert.equal(await removeInChunks(ok, Array.from({ length: 2500 }, (_, i) => `p${i}`)), null);
  assert.deepEqual(calls, [1000, 1000, 500]);
  const bad = { remove: async () => ({ error: { message: "down" } }) };
  assert.equal(await removeInChunks(bad, ["a"]), "down");
  assert.equal(await removeInChunks(bad, []), null);
});

test("미리보기 그림 — PNG 서명과 크기 확인", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.ok(decodePreviewPng(png.toString("base64")));
  assert.equal(decodePreviewPng(Buffer.from("GIF89a....").toString("base64")), null);
  assert.equal(decodePreviewPng(Buffer.alloc(500 * 1024, 1).toString("base64")), null);
  assert.equal(decodePreviewPng(42), null);
});
