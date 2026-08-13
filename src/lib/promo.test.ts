import test from "node:test";
import assert from "node:assert/strict";

import {
  EARLYBIRD_SIGNUP_CUTOFF,
  canClaimGrandfatheredEarlybird,
  isRetiredSignupPromo,
} from "./promo.ts";

test("earlybird 코드 비교는 공백과 대소문자를 정규화한다", () => {
  assert.equal(isRetiredSignupPromo(" EARLYBIRD "), true);
  assert.equal(isRetiredSignupPromo("re_earlybird"), false);
});

test("종료 시각 직전 가입자만 1차 시각 가드를 통과한다", () => {
  const cutoff = Date.parse(EARLYBIRD_SIGNUP_CUTOFF);

  assert.equal(
    canClaimGrandfatheredEarlybird("earlybird", new Date(cutoff - 1).toISOString()),
    true,
  );
  assert.equal(
    canClaimGrandfatheredEarlybird("earlybird", new Date(cutoff).toISOString()),
    false,
  );
  assert.equal(
    canClaimGrandfatheredEarlybird("earlybird", new Date(cutoff + 1).toISOString()),
    false,
  );
});

test("날짜나 코드가 잘못되면 얼리버드 자격을 주지 않는다", () => {
  assert.equal(canClaimGrandfatheredEarlybird("other", "2026-08-13T00:00:00Z"), false);
  assert.equal(canClaimGrandfatheredEarlybird("earlybird", null), false);
  assert.equal(canClaimGrandfatheredEarlybird("earlybird", "not-a-date"), false);
});
