// 만료 크레딧 재지급 — 마커·발송 상태 머신 mock 테스트 (2026-07-22)
//
// 실행법 (web/ 에서):
//   node --experimental-strip-types --test scripts/expiry_regrant_state_test.mjs
//
//   * 새 의존성 0개 · 네트워크 0 · env 0 · 운영 DB 0 · 실제 메일 0.
//   * Node 18+ 내장 러너(node --test)만 쓴다. --experimental-strip-types 는 route.ts 를
//     그대로 불러오기 위한 것(Node 22.6+). Node 23.6+ 에서는 플래그 없이도 동작한다.
//   * route.ts 는 next/server 와 @/* 별칭을 import 하는데, 상태 머신은 그것들을 쓰지 않는다.
//     아래 resolve 훅이 그 둘만 가짜 모듈로 바꿔치기해 라우트 파일을 로드한다.
//
// 왜 필요한가:
//   기존 scripts/expiry_regrant_e2e.cjs 는 프로덕션 DB + dry-run 만 다룬다(그 파일 18-19행이
//   명시). 즉 "지급은 됐는데 메일이 유실되는가", "같은 광고 메일이 두 번 나가는가" 같은
//   발송 상태 머신은 전혀 검증되지 않는다. 이 스위트가 그 구멍을 크래시·중복 실행·응답
//   유실을 페이크로 재현해 메운다.
//
// 단정 방식: 스텝별 호출 검증이 아니라 "무엇이 절대 일어나면 안 되는가"(불변식)로 본다.
//   INV1 과지급 없음                — 계정당 성공 지급 1회 이하
//   INV2 미지급자 무메일            — 지급 기록 없는 사용자에게 안내 메일이 나가지 않는다
//   INV3 사용자당 광고 메일 ≤ 1통   — 정보통신망법 노출 방지 (일부 시나리오는 알려진 격차 → todo)
//   INV4 영구 유실 없음             — 지급됨 + 마케팅 동의 + 발송 성공 없음 이면
//                                     마커가 남아 있거나(다음 실행이 재시도) 상한에 도달했어야 한다
//
// 알려진 격차는 숨기지 않고 { todo: ... } 로 표시한다 — 실패해도 종료 코드를 깨지 않지만
// 리포트에 남아 다음 사람이 본다.

import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// route.ts 로드 (next/server · @/* 만 스텁으로 대체)
// ─────────────────────────────────────────────────────────────────────────────
const STUB = `data:text/javascript,${encodeURIComponent(`
export class NextRequest {}
export const NextResponse = { json: (body, init) => ({ body, status: (init && init.status) || 200 }) };
export const createAdminClient = () => { throw new Error("테스트에서 Supabase 를 부르면 안 된다"); };
export const unsubscribeToken = () => "stub-token";
export const normalizeEmailAlias = (email) => String(email).trim().toLowerCase();
export default {};
`)}`;

const HOOK = `data:text/javascript,${encodeURIComponent(`
const STUB = ${JSON.stringify(STUB)};
export async function resolve(spec, ctx, next) {
  if (spec === "next/server" || spec.startsWith("@/")) return { url: STUB, shortCircuit: true };
  return next(spec, ctx);
}
`)}`;

register(HOOK);

const ROUTE = pathToFileURL(
  path.join(import.meta.dirname, "..", "src", "app", "api", "cron", "expiry-regrant", "route.ts")
).href;
const R = await import(ROUTE);

const {
  runRetryRow,
  runGrantTarget,
  dispatchMail,
  mailIdempotencyKey,
  effectiveDispatched,
  isMailExhausted,
} = R;

// ─────────────────────────────────────────────────────────────────────────────
// 상수 (route.ts 와 같은 값 — 여기 값이 틀어지면 테스트가 먼저 깨진다)
// ─────────────────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const PROMO_CREDITS = 30;
const VALIDITY_DAYS = 7;
const MAX_MAIL_DISPATCHES = 5;
const MAX_MAIL_ATTEMPTS_HARD = 8;
// Resend 멱등키 보존 창 — cron 주기(24시간)와 같다는 점이 (1)의 핵심 한계다.
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

class ProcessKill extends Error {}

const clone = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
// n 개의 마이크로태스크만큼 양보 — 동시 실행 인터리빙을 결정적으로 흔든다(랜덤 없음).
const tick = async (n) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

// ─────────────────────────────────────────────────────────────────────────────
// 페이크 1 — 마커 저장소 (profiles.regrant_mail_due)
//   실패 주입: failWrite(userId, value, seq) → true 면 저장 실패(포트가 false 반환)
//   프로세스 킬: killAt(seq) → true 면 throw (그 실행은 그 자리에서 죽는다)
// ─────────────────────────────────────────────────────────────────────────────
class FakeMarkers {
  constructor() {
    this.rows = new Map();
    this.seq = 0;
    this.latency = 0;
    this.failWrite = () => false;
    this.killAt = () => false;
  }
  async set(userId, value) {
    const seq = ++this.seq;
    if (this.latency) await tick(this.latency);
    if (this.killAt(seq, userId, value)) throw new ProcessKill(`markers.set#${seq}`);
    if (this.failWrite(userId, value, seq)) return false;
    if (value === null) this.rows.delete(userId);
    else this.rows.set(userId, clone(value));
    return true;
  }
  get(userId) {
    return this.rows.has(userId) ? clone(this.rows.get(userId)) : null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 페이크 2 — 메일러 (Resend)
//   delivered = 실제로 수신자 편지함에 도착한 메일. 여기 길이가 곧 "몇 통 갔는가"다.
//   멱등키 보존 창(24시간)을 시뮬 시계로 모델링한다 — 창 안의 재요청은 실제 발송 없이
//   원래 응답을 그대로 돌려주고, 창을 넘기면 진짜로 한 통 더 나간다.
//   mode: "ok" | "reject"(접수 실패) | "accepted_then_lost"(접수됐지만 응답 유실) | "kill"
// ─────────────────────────────────────────────────────────────────────────────
class FakeMailer {
  constructor(clock) {
    this.clock = clock;
    this.delivered = [];
    this.replays = 0;
    this.calls = 0;
    this.latency = 0;
    this.mode = () => "ok";
    this.idem = new Map();
  }
  async send({ to, subject, html, idempotencyKey }) {
    const n = ++this.calls;
    if (this.latency) await tick(this.latency);
    assert.ok(idempotencyKey, "멱등키 없이 발송하면 안 된다");
    assert.ok(idempotencyKey.length <= 256, "Resend 멱등키 상한 256자");

    const prior = this.idem.get(idempotencyKey);
    if (prior && this.clock.now - prior.at < IDEMPOTENCY_WINDOW_MS) {
      // Resend 동작: 실제 발송 없이 원래 응답을 그대로 반환.
      this.replays += 1;
      return prior.ok;
    }
    const mode = this.mode({ to, subject, html, idempotencyKey }, n);
    if (mode === "kill") throw new ProcessKill(`mailer.send#${n}`);
    if (mode === "reject") return false; // 접수 자체 실패 — 메일도, 멱등 기록도 없다

    this.delivered.push({ to, key: idempotencyKey, at: this.clock.now, subject });
    // 접수된 순간 Resend 쪽에는 200 이 기록된다 — 응답이 유실돼도 재요청은 그 200 을 본다.
    this.idem.set(idempotencyKey, { at: this.clock.now, ok: true });
    return mode !== "accepted_then_lost";
  }
  deliveredTo(email) {
    return this.delivered.filter((d) => d.to === email);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 페이크 3 — 지급 RPC (redeem_promo_code)
//   Set(Map) 으로 promo_redemptions 의 (promo_code_id, user_id) unique 를 재현한다.
//   두 번째 호출은 반드시 already_redeemed.
//   mode: "ok" | "exhausted"(DB 확정 거절) | "rpc_error"(커밋 안 됨·응답만 실패)
//         | "rpc_error_committed"(커밋됐는데 응답 유실) | "kill"
// ─────────────────────────────────────────────────────────────────────────────
class FakeGrants {
  constructor(clock) {
    this.clock = clock;
    this.redeemed = new Map(); // userId -> created_at ISO
    this.successes = new Map(); // userId -> 성공 지급 횟수 (과지급 감시용)
    this.calls = 0;
    this.latency = 0;
    this.mode = () => "ok";
  }
  async redeem(userId) {
    const n = ++this.calls;
    if (this.latency) await tick(this.latency);
    const mode = this.mode(userId, n);
    if (mode === "kill") throw new ProcessKill(`grants.redeem#${n}`);

    // unique 제약 — 이미 있으면 무조건 already_redeemed
    if (this.redeemed.has(userId)) {
      return { result: { success: false, error: "already_redeemed" }, rpcError: null };
    }
    if (mode === "exhausted") {
      return { result: { success: false, error: "exhausted" }, rpcError: null };
    }
    if (mode === "rpc_error") {
      // DB 가 답을 주지 않았고 커밋도 안 됐다 (진짜 네트워크 실패)
      return { result: null, rpcError: { message: "fetch failed" } };
    }
    this.#commit(userId);
    if (mode === "rpc_error_committed") {
      // 커밋은 됐는데 응답만 유실 — 라우트가 "불명확한 실패"로 다뤄야 하는 경우
      return { result: null, rpcError: { message: "504 gateway timeout" } };
    }
    return {
      result: {
        success: true,
        expires_at: new Date(this.clock.now + VALIDITY_DAYS * DAY_MS).toISOString(),
      },
      rpcError: null,
    };
  }
  #commit(userId) {
    this.redeemed.set(userId, new Date(this.clock.now).toISOString());
    this.successes.set(userId, (this.successes.get(userId) ?? 0) + 1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 세계 + 실행 드라이버
//   route.ts 의 GET 궤도를 그대로 흉내낸다: (1) 후보 수집 → (2) 재시도 큐 스냅샷 →
//   (3) 재시도 → (4) 지급+신규 발송. 순서가 핵심이라 이 순서를 바꾸지 말 것
//   ((1)이 (3)보다 먼저라서 orphan 정리 후 같은 실행이 지급·발송까지 끝낼 수 있다).
// ─────────────────────────────────────────────────────────────────────────────
function makeWorld(users) {
  const clock = { now: Date.UTC(2026, 6, 22, 0, 20) };
  const markers = new FakeMarkers();
  const mailer = new FakeMailer(clock);
  const grants = new FakeGrants(clock);
  const outcomes = new Map(); // userId -> outcome 태그 배열
  const deps = {
    markers,
    mailer,
    grants,
    now: () => clock.now,
    warn: () => {},
  };
  return { clock, markers, mailer, grants, deps, users, outcomes };
}

function record(world, userId, tag) {
  if (!world.outcomes.has(userId)) world.outcomes.set(userId, []);
  world.outcomes.get(userId).push(tag);
}

async function runCron(world) {
  const { markers, grants, deps, users } = world;
  const nowMs = world.clock.now;
  const nowIso = new Date(nowMs).toISOString();

  // (1) 후보 수집 — 미지급 + 이메일 인증 + 손실 10크레딧 이상 (실행 시작 시점 기준)
  const targets = users.filter(
    (u) => u.confirmed !== false && !grants.redeemed.has(u.id) && u.credits >= 10
  );

  // (2) 재시도 큐 스냅샷 — 마커가 남아 있는 계정 (id 오름차순)
  const retryQueue = users
    .filter((u) => markers.get(u.id) !== null)
    .map((u) => ({
      id: u.id,
      email: u.email,
      marketing_opt_in: u.optIn,
      regrant_mail_due: markers.get(u.id),
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // (3) 미발송 재시도
  for (const row of retryQueue) {
    const { outcome } = await runRetryRow(deps, row, grants.redeemed.get(row.id), PROMO_CREDITS);
    record(world, row.id, `retry:${outcome}`);
  }

  // (4) 지급 + 신규 발송
  for (const p of targets) {
    const outcome = await runGrantTarget(
      deps,
      {
        id: p.id,
        email: p.email,
        credits: p.credits,
        expires_at: p.expiresAt,
        mail: p.optIn === true,
      },
      { nowMs, nowIso, grantCredits: PROMO_CREDITS, validityDays: VALIDITY_DAYS }
    );
    record(world, p.id, `grant:${outcome.kind}${outcome.kind === "granted" ? `/${outcome.mail}` : ""}`);
  }
}

// 프로세스 사망을 삼킨다 — 죽은 실행은 그 자리에서 끝나고 상태만 남는다.
async function runCronSafe(world) {
  try {
    await runCron(world);
    return "completed";
  } catch (err) {
    if (err instanceof ProcessKill) return "killed";
    throw err;
  }
}

function nextDay(world) {
  world.clock.now += DAY_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// 불변식
// ─────────────────────────────────────────────────────────────────────────────
function assertInvariants(world, { allowDuplicateMail = false } = {}) {
  const { users, mailer, grants, markers, outcomes } = world;

  for (const u of users) {
    const mails = mailer.deliveredTo(u.email);
    const grantedTimes = grants.successes.get(u.id) ?? 0;
    const tags = outcomes.get(u.id) ?? [];

    // INV1 과지급 없음
    assert.ok(grantedTimes <= 1, `INV1 과지급: ${u.id} 에 ${grantedTimes}회 지급됨`);

    // INV2 지급받지 않은 사용자에게 메일 없음
    if (!grants.redeemed.has(u.id)) {
      assert.equal(mails.length, 0, `INV2 미지급자 ${u.id} 에게 메일 ${mails.length}통 발송됨`);
    }
    // INV2' 마케팅 비동의자에게 메일 없음
    if (u.optIn !== true) {
      assert.equal(mails.length, 0, `INV2' 비동의자 ${u.id} 에게 메일 ${mails.length}통 발송됨`);
    }

    // INV3 사용자당 광고 메일 ≤ 1통
    if (!allowDuplicateMail) {
      assert.ok(mails.length <= 1, `INV3 중복 광고 메일: ${u.id} 에게 ${mails.length}통`);
    } else {
      // 알려진 격차 시나리오에서도 "확정 상한" 은 지켜져야 한다 — 무한 재발송 금지.
      assert.ok(
        mails.length <= MAX_MAIL_ATTEMPTS_HARD,
        `상한 붕괴: ${u.id} 에게 ${mails.length}통 (하드 상한 ${MAX_MAIL_ATTEMPTS_HARD})`
      );
    }

    // INV4 영구 유실 없음
    if (grants.redeemed.has(u.id) && u.optIn === true && mails.length === 0) {
      const markerAlive = markers.get(u.id) !== null;
      const gaveUp = tags.some(
        (t) => t === "retry:cleared_exhausted" || t === "retry:cleared_stale"
      );
      assert.ok(
        markerAlive || gaveUp,
        `INV4 영구 유실: ${u.id} 는 지급됐고 동의자인데 메일도 없고 마커도 없다 (tags=${tags.join(",")})`
      );
    }
  }
}

// 표준 사용자 픽스처
function optInUser(id = "u1") {
  return {
    id,
    email: `${id}@example.com`,
    optIn: true,
    confirmed: true,
    credits: 15,
    expiresAt: new Date(Date.UTC(2026, 6, 20)).toISOString(),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// A. 멱등키 · 카운터 단위 검증
// ═════════════════════════════════════════════════════════════════════════════
test("멱등키는 같은 사용자·같은 지급 건이면 재실행해도 동일하다 (랜덤 아님)", () => {
  const due = { lost: 15, lost_at: "2026-07-20T00:00:00.000Z", new_expires: "2026-07-29T00:00:00.000Z" };
  const a = mailIdempotencyKey("u1", due);
  const b = mailIdempotencyKey("u1", { ...due, attempts: 3, dispatched: 2, queued_at: "later" });
  assert.equal(a, b, "attempts/queued_at 이 달라져도 키는 같아야 한다");
  assert.notEqual(a, mailIdempotencyKey("u2", due), "사용자가 다르면 키도 달라야 한다");
  assert.notEqual(a, mailIdempotencyKey("u1", { ...due, lost_at: "2026-08-01T00:00:00.000Z" }));
  assert.ok(a.length <= 256);
});

test("레거시 마커(dispatched 없음)는 attempts 를 실제 발송 횟수로 간주해 기존 5회 상한을 지킨다", () => {
  assert.equal(effectiveDispatched({ lost: 1, lost_at: "x", new_expires: "y", attempts: 5 }), 5);
  assert.equal(isMailExhausted({ lost: 1, lost_at: "x", new_expires: "y", attempts: 5 }), true);
  // 새 마커는 두 값이 분리된다 — 시도만 5회이고 실제 도달이 0회면 아직 포기하지 않는다
  assert.equal(
    isMailExhausted({ lost: 1, lost_at: "x", new_expires: "y", attempts: 5, dispatched: 0 }),
    false
  );
  // 하드 상한은 그래도 걸린다 (무한 재발송 방지)
  assert.equal(
    isMailExhausted({ lost: 1, lost_at: "x", new_expires: "y", attempts: 8, dispatched: 0 }),
    true
  );
});

test("dispatchMail: 사전 증가 쓰기가 실패하면 발송하지 않고 보류한다", async () => {
  const world = makeWorld([optInUser()]);
  world.markers.failWrite = () => true;
  const r = await dispatchMail(world.deps, {
    userId: "u1",
    email: "u1@example.com",
    due: { lost: 15, lost_at: "2026-07-20T00:00:00.000Z", new_expires: "2026-07-29T00:00:00.000Z" },
    grantCredits: PROMO_CREDITS,
  });
  assert.equal(r.outcome, "deferred");
  assert.equal(world.mailer.calls, 0, "카운터를 못 올렸는데 광고 메일을 보내면 안 된다");
});

// ═════════════════════════════════════════════════════════════════════════════
// B. 크래시 시나리오
// ═════════════════════════════════════════════════════════════════════════════
test("지급 직후 프로세스 킬 — 다음 실행이 메일을 이어받는다", async () => {
  const world = makeWorld([optInUser()]);
  // 마커 선기록(1) → 지급 → dispatchMail 의 사전 증가 쓰기(2)에서 사망
  world.markers.killAt = (seq) => seq === 2;

  assert.equal(await runCronSafe(world), "killed");
  assert.ok(world.grants.redeemed.has("u1"), "지급은 커밋됐다");
  assert.equal(world.mailer.delivered.length, 0, "아직 메일은 안 나갔다");
  assert.notEqual(world.markers.get("u1"), null, "마커가 살아 있어야 복구 가능하다");

  world.markers.killAt = () => false;
  nextDay(world);
  assert.equal(await runCronSafe(world), "completed");
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assert.equal(world.markers.get("u1"), null, "발송 성공 후 마커는 정리된다");
  assertInvariants(world);
});

test("마커 선기록 후 크래시 — 같은 실행이 아니라 다음 실행이 지급·발송을 완주한다", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.mode = () => "kill"; // 마커는 남고 지급 직전에 사망

  assert.equal(await runCronSafe(world), "killed");
  assert.notEqual(world.markers.get("u1"), null, "마커만 남은 상태");
  assert.equal(world.grants.redeemed.has("u1"), false);

  world.grants.mode = () => "ok";
  nextDay(world);
  assert.equal(await runCronSafe(world), "completed");
  // (3)이 orphan 으로 마커를 지우고, 같은 실행의 (4)가 지급 + 발송까지 끝낸다
  assert.deepEqual(world.outcomes.get("u1").slice(-2), ["retry:cleared_orphan", "grant:granted/sent"]);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assertInvariants(world);
});

test("attempts 기록 직후 종료가 6회 반복돼도 상한이 소진되지 않는다 (사전 증가 부작용 보완)", async () => {
  const world = makeWorld([optInUser()]);
  // sendMail 호출 순간에 사망 = attempts 는 올라갔지만 메일은 한 통도 안 나간 상태
  world.mailer.mode = () => "kill";

  for (let day = 0; day < 6; day++) {
    assert.equal(await runCronSafe(world), "killed");
    nextDay(world);
  }
  const due = world.markers.get("u1");
  assert.equal(due.attempts, 6, "시도는 6회 기록됐다");
  assert.equal(due.dispatched, 0, "실제 발송 도달은 0회다");
  assert.equal(world.mailer.delivered.length, 0);
  assert.equal(
    isMailExhausted(due),
    false,
    "옛 설계(attempts 5회 상한)라면 여기서 포기했을 것 — 이제는 아직 살아 있어야 한다"
  );

  // 장애 회복 후 정상 발송
  world.mailer.mode = () => "ok";
  assert.equal(await runCronSafe(world), "completed");
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assertInvariants(world);
});

test("사전 증가 직후 종료가 끝없이 반복돼도 하드 상한에서 멈춘다 (무한 재시도 금지)", async () => {
  const world = makeWorld([optInUser()]);
  world.mailer.mode = () => "kill";
  for (let day = 0; day < 20; day++) {
    await runCronSafe(world);
    nextDay(world);
  }
  assert.equal(world.mailer.delivered.length, 0);
  assert.equal(world.markers.get("u1"), null, "하드 상한 도달 후 마커는 정리된다");
  assert.ok(world.outcomes.get("u1").includes("retry:cleared_exhausted"));
  assertInvariants(world); // INV4 는 '상한 도달'로 충족
});

// ═════════════════════════════════════════════════════════════════════════════
// C. 발송 성공 후 사후 쓰기 실패
// ═════════════════════════════════════════════════════════════════════════════
test("발송 성공 후 마커 삭제 실패가 매일 반복돼도 재발송하지 않는다 (sent_at 봉인)", async () => {
  const world = makeWorld([optInUser()]);
  // 삭제(null 쓰기)만 계속 실패하고 봉인(sent_at 쓰기)은 성공하는 상태
  world.markers.failWrite = (_uid, value) => value === null;

  for (let day = 0; day < 10; day++) {
    await runCronSafe(world);
    nextDay(world);
  }
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1, "메일은 딱 1통");
  assert.ok(world.markers.get("u1").sent_at, "봉인 마커가 남아 매 실행 cleared_sent 로 걸러진다");
  assert.ok(world.outcomes.get("u1").includes("retry:cleared_sent"));
  assertInvariants(world);
});

test(
  "발송 성공 + 삭제·봉인이 모두 실패하면 중복이 나가지만 하드 상한 안에 갇힌다",
  { todo: "알려진 격차: 사후 쓰기가 전부 실패하면 sent_at 봉인이 불가능해 하루 넘긴 재시도를 막지 못한다(최악 8통). 발송 이력 테이블 없이는 근본 해결 불가 — 별도 결정 필요." },
  async () => {
    const world = makeWorld([optInUser()]);
    // 사전 증가 쓰기는 되지만 '발송 이후' 쓰기(삭제·봉인·dispatched)는 전부 실패
    world.markers.failWrite = (_uid, value) =>
      value === null || value.sent_at !== undefined || value.dispatched > 0;

    for (let day = 0; day < 15; day++) {
      await runCronSafe(world);
      nextDay(world);
    }
    // 상한은 지켜지는지 먼저 확인 (여기가 깨지면 진짜 회귀다)
    assertInvariants(world, { allowDuplicateMail: true });
    // 그리고 INV3 자체는 아직 못 지킨다 — todo 로 남겨 다음 사람이 보게 한다
    assertInvariants(world);
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// D. Resend 접수 후 응답 유실 (멱등키의 존재 이유)
// ═════════════════════════════════════════════════════════════════════════════
test("접수 후 응답 유실 → 멱등 보존 창(24시간) 안의 재시도는 실제 발송을 만들지 않는다", async () => {
  const world = makeWorld([optInUser()]);
  let first = true;
  world.mailer.mode = () => {
    if (first) {
      first = false;
      return "accepted_then_lost";
    }
    return "ok";
  };

  await runCronSafe(world); // 접수됨(1통) + 호출자는 실패로 인지
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assert.notEqual(world.markers.get("u1"), null, "실패로 봤으니 마커가 남는다");

  // 같은 날(보존 창 안) 재실행 — 운영 재트리거 상황
  world.clock.now += 60 * 60 * 1000; // +1시간
  await runCronSafe(world);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1, "멱등키가 두 번째 발송을 막는다");
  assert.equal(world.mailer.replays, 1);
  assert.equal(world.markers.get("u1"), null, "리플레이 응답이 200 이라 정상 종료 처리된다");
  assertInvariants(world);
});

test(
  "접수 후 응답 유실 + 다음날 재시도 — 멱등 보존 창을 넘기면 중복을 막지 못한다",
  { todo: "알려진 격차: cron 주기(24시간)와 Resend 멱등키 보존 창(24시간)이 같아 '다음날 재시도'는 멱등키로 못 막는다. 이 경로의 방어선은 sent_at 봉인이며, 봉인 쓰기까지 실패할 때만 중복이 남는다." },
  async () => {
    const world = makeWorld([optInUser()]);
    // 매번 접수는 되는데 응답만 유실 + 봉인 쓰기도 실패 (최악 조합)
    world.mailer.mode = () => "accepted_then_lost";
    world.markers.failWrite = (_uid, value) => value !== null && value.dispatched > 0;

    for (let day = 0; day < 10; day++) {
      await runCronSafe(world);
      nextDay(world);
    }
    assertInvariants(world, { allowDuplicateMail: true }); // 상한은 지켜진다
    assertInvariants(world); // INV3 는 못 지킨다 → todo
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// E. 동시 실행
// ═════════════════════════════════════════════════════════════════════════════
test("두 실행이 같은 저장소 위에서 겹쳐 돌아도 과지급·중복 메일이 없다", async () => {
  // 인터리빙을 결정적으로 여러 형태로 흔든다 (랜덤 없음 — 재현 가능)
  for (const [mLat, gLat, sLat] of [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [2, 1, 3],
    [3, 2, 1],
  ]) {
    const users = [optInUser("u1"), { ...optInUser("u2"), optIn: false }, optInUser("u3")];
    const world = makeWorld(users);
    world.markers.latency = mLat;
    world.grants.latency = gLat;
    world.mailer.latency = sLat;

    await Promise.all([runCronSafe(world), runCronSafe(world)]);
    // 남은 마커를 정리할 기회를 준 뒤 최종 상태를 본다
    nextDay(world);
    await runCronSafe(world);

    const label = `lat=${mLat}/${gLat}/${sLat}`;
    for (const u of users) {
      assert.equal(world.grants.successes.get(u.id) ?? 0, 1, `${label} — ${u.id} 지급 1회`);
    }
    assert.equal(world.mailer.deliveredTo("u2@example.com").length, 0, `${label} — 비동의자 무메일`);
    assertInvariants(world);
  }
});

// 동시 실행 + "지급 직후 사망" 이 겹치는 경로를 만든다.
//  A: u1 마커 기록 → 지급 성공 → 발송 직전 사망
//  B: (A 의 지급 전에 뜬 후보 스냅샷으로) u1 마커를 덮어씀 → 지급이 already_redeemed →
//     "DB 가 확정적으로 거절했다"고 보고 마커를 롤백 삭제 → A 가 남긴 재시도 단서까지 사라진다
async function raceKillDuringSend() {
  const users = [optInUser("u1"), optInUser("u2")];
  const world = makeWorld(users);
  world.markers.latency = 1;
  let killed = false;
  world.mailer.mode = () => {
    if (!killed) {
      killed = true;
      return "kill";
    }
    return "ok";
  };

  await Promise.all([runCronSafe(world), runCronSafe(world)]);
  nextDay(world);
  await runCronSafe(world);
  nextDay(world);
  await runCronSafe(world);
  return { world, users };
}

test("동시 실행 중 한쪽이 죽어도 과지급·중복 메일은 없고 나머지 대상은 완주한다", async () => {
  const { world, users } = await raceKillDuringSend();
  for (const u of users) {
    assert.equal(world.grants.successes.get(u.id) ?? 0, 1, `${u.id} 지급 1회`);
    assert.ok(world.mailer.deliveredTo(u.email).length <= 1, `${u.id} 중복 메일 없음`);
  }
  // 죽지 않은 쪽은 정상적으로 끝난다
  assert.equal(world.mailer.deliveredTo("u2@example.com").length, 1);
});

test(
  "동시 실행 + 지급 직후 사망이 겹치면 안내 메일 1통이 영구 유실된다",
  {
    todo:
      "알려진 격차(이 스위트가 새로 드러낸 것, 이번 변경으로 생긴 회귀 아님): " +
      "겹쳐 도는 두 실행 중 뒤늦은 쪽이 already_redeemed 를 'DB 확정 거절'로 보고 마커를 롤백 삭제하는데, " +
      "그 마커가 사실은 앞선 실행이 남긴 재시도 단서일 수 있다. 지급은 계정당 평생 1회 + 발송 이력 테이블이 없어 " +
      "단서가 사라지면 복구 경로가 없다. 근본 해결은 마커 소유권 토큰(실행 ID)을 넣고 '내가 쓴 마커일 때만 롤백' 으로 " +
      "조건부 삭제하는 것 — 동작 변경이라 별도 결정 필요. 현재 완화책은 cron 이 하루 1회라 겹칠 일이 거의 없다는 점뿐.",
  },
  async () => {
    const { world } = await raceKillDuringSend();
    assert.equal(
      world.mailer.deliveredTo("u1@example.com").length,
      1,
      "u1 은 지급받았으므로 안내 메일이 1통 나갔어야 한다"
    );
    assertInvariants(world); // INV4(영구 유실 없음)도 함께 깨진다
  }
);

// ═════════════════════════════════════════════════════════════════════════════
// F. 지급 실패 갈래 · 레거시 마커
// ═════════════════════════════════════════════════════════════════════════════
test("DB 확정 거절(exhausted)은 마커를 즉시 롤백하고 메일을 만들지 않는다", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.mode = () => "exhausted";
  await runCronSafe(world);
  assert.equal(world.markers.get("u1"), null, "확정 실패는 마커를 남기지 않는다");
  assert.equal(world.mailer.delivered.length, 0);
  assertInvariants(world);
});

test("응답만 유실된 지급(커밋됨)은 마커를 남겨 다음 실행이 정확히 판정한다", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.mode = () => "rpc_error_committed";
  await runCronSafe(world);
  assert.equal(world.outcomes.get("u1").at(-1), "grant:grant_uncertain");
  assert.notEqual(world.markers.get("u1"), null, "불명확한 실패는 마커를 지우면 안 된다");
  assert.equal(world.mailer.delivered.length, 0);

  world.grants.mode = () => "ok";
  nextDay(world);
  await runCronSafe(world);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1, "다음 실행이 지급을 확인하고 발송");
  assertInvariants(world);
});

test("커밋되지 않은 rpc_error 는 마커가 남지만 발송 없이 정리되고 다음 실행이 재지급한다", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.mode = () => "rpc_error";
  await runCronSafe(world);
  assert.equal(world.grants.redeemed.has("u1"), false);
  assert.notEqual(world.markers.get("u1"), null);

  world.grants.mode = () => "ok";
  nextDay(world);
  await runCronSafe(world);
  assert.deepEqual(world.outcomes.get("u1").slice(-2), ["retry:cleared_orphan", "grant:granted/sent"]);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assertInvariants(world);
});

test("레거시 마커(queued_at·sent_at·dispatched 없음)도 그대로 재시도돼 발송된다", async () => {
  const world = makeWorld([optInUser()]);
  // 지난 버전이 남긴 형태: 필수 3필드 + attempts 만
  world.grants.redeemed.set("u1", new Date(world.clock.now - 2 * DAY_MS).toISOString());
  world.grants.successes.set("u1", 1);
  world.markers.rows.set("u1", {
    lost: 15,
    lost_at: "2026-07-20T00:00:00.000Z",
    new_expires: "2026-07-29T00:00:00.000Z",
    attempts: 2,
  });

  await runCronSafe(world);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  assert.equal(world.markers.get("u1"), null);
  assertInvariants(world);
});

test("레거시 마커가 이미 5회 시도됐다면 새 하드 상한(8) 때문에 추가 발송되지 않는다", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.redeemed.set("u1", new Date(world.clock.now - 2 * DAY_MS).toISOString());
  world.grants.successes.set("u1", 1);
  world.markers.rows.set("u1", {
    lost: 15,
    lost_at: "2026-07-20T00:00:00.000Z",
    new_expires: "2026-07-29T00:00:00.000Z",
    attempts: 5, // dispatched 없음 = 실제로 5회 보냈던 레거시
  });

  await runCronSafe(world);
  assert.equal(world.mailer.delivered.length, 0, "레거시 상한 해석이 유지돼야 한다");
  assert.equal(world.outcomes.get("u1").at(-1), "retry:cleared_exhausted");
});

test("마커보다 오래된 지급은 안내하지 않는다 (과거 지급에 이번 실행의 만료일을 붙이지 않는다)", async () => {
  const world = makeWorld([optInUser()]);
  world.grants.redeemed.set("u1", new Date(world.clock.now - 30 * DAY_MS).toISOString());
  world.grants.successes.set("u1", 1);
  world.markers.rows.set("u1", {
    lost: 15,
    lost_at: "2026-07-20T00:00:00.000Z",
    new_expires: "2026-07-29T00:00:00.000Z",
    queued_at: new Date(world.clock.now).toISOString(),
  });

  await runCronSafe(world);
  assert.equal(world.outcomes.get("u1").at(-1), "retry:cleared_stale");
  assert.equal(world.mailer.delivered.length, 0);
  assertInvariants(world);
});

test("재시도 중 수신거부로 바뀐 계정에는 발송하지 않고 마커만 지운다", async () => {
  const user = optInUser();
  const world = makeWorld([user]);
  world.grants.redeemed.set("u1", new Date(world.clock.now).toISOString());
  world.grants.successes.set("u1", 1);
  world.markers.rows.set("u1", {
    lost: 15,
    lost_at: "2026-07-20T00:00:00.000Z",
    new_expires: "2026-07-29T00:00:00.000Z",
    queued_at: new Date(world.clock.now).toISOString(),
  });
  user.optIn = false; // 그 사이 수신거부

  await runCronSafe(world);
  assert.equal(world.outcomes.get("u1").at(-1), "retry:cleared_invalid");
  assert.equal(world.mailer.delivered.length, 0);
  assertInvariants(world);
});

// ═════════════════════════════════════════════════════════════════════════════
// G. 정상 경로 회귀
// ═════════════════════════════════════════════════════════════════════════════
test("정상 경로: 동의자는 1통, 비동의자는 조용한 지급, 재실행해도 변화 없음", async () => {
  const users = [optInUser("u1"), { ...optInUser("u2"), optIn: false }, { ...optInUser("u3"), optIn: null }];
  const world = makeWorld(users);

  await runCronSafe(world);
  nextDay(world);
  await runCronSafe(world);

  assert.equal(world.mailer.delivered.length, 1);
  assert.equal(world.mailer.deliveredTo("u1@example.com").length, 1);
  for (const u of users) assert.equal(world.grants.successes.get(u.id), 1);
  assert.equal(world.markers.rows.size, 0, "모든 마커가 정리됐다");
  assertInvariants(world);
});

test("발송 접수 실패(reject)는 재시도되고 5회 실제 도달 후 포기한다", async () => {
  const world = makeWorld([optInUser()]);
  world.mailer.mode = () => "reject";

  for (let day = 0; day < 10; day++) {
    await runCronSafe(world);
    nextDay(world);
  }
  assert.equal(world.mailer.delivered.length, 0, "접수 실패는 실제 발송이 아니다");
  assert.equal(world.mailer.calls, MAX_MAIL_DISPATCHES, "실제 도달 5회에서 포기");
  assert.equal(world.markers.get("u1"), null);
  assertInvariants(world);
});
