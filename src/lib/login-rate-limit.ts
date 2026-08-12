// 로그인 시도 제한 — /api/auth/login(웹)과 /api/auth/token(데스크톱 앱) 공용.
//
// 왜 필요한가 (2026-08-11 감사):
//   ① 가용성(더 큰 이유): /api/auth/token 은 service_role 클라이언트로 로그인을
//      **대행**한다. GoTrue 가 보는 소스 IP 는 모든 사용자가 공유하는 Vercel egress
//      IP 하나다. 외부에서 아무 값이나 쏟아부으면 그 공유 IP 의 auth 한도가 소진돼
//      정상 고객의 앱 로그인이 전부 실패한다. 앱은 로그인 없이는 변환 자체가 불가하므로
//      유료 제품이 통째로 멈춘다. 공격 비용은 사실상 0원이고 로그인도 필요 없다.
//   ② 무차별 대입: 계정 잠금도, 계정당·IP당 시도 제한도 없었다.
//
//   같은 폴더의 resend-confirmation 라우트는 이미 3중 제한을 갖고 있는데 로그인만
//   빠져 있었다(docs/CODEX_MATHOCR_AUDIT_2026-07-11.md:534 에 한 달 넘게 미해결).
//
// 설계: **실패했을 때만 카운트**한다(peek → 인증 시도 → 실패 시 bump).
//   성공까지 세면 공유 IP(학원 NAT) 뒤의 여러 강사가 서로를 밀어내 정상 사용자가
//   막힌다. 이메일 키는 normalizeEmailAlias 로 접어 +별칭·지메일 점 변형 우회를 막는다.
//
// Redis 장애 시에는 인스턴스 메모리로 폴백하고, 그마저 안 되면 통과시킨다(fail-open) —
// 방어 장치가 정상 로그인을 막는 쪽이 더 나쁘기 때문이다.

import { NextResponse } from "next/server";
import { peekRateLimit, bumpRateLimit } from "./rate-limit";
import { normalizeEmailAlias } from "./email";

const IP_LIMIT = 20;
const IP_WINDOW_MS = 10 * 60 * 1000; // 10분
const PAIR_LIMIT = 5;
const PAIR_WINDOW_MS = 10 * 60 * 1000; // 10분

// ⚠️ 이메일 **단독** 카운터를 쓰지 않는 이유 (2026-08-12 검증에서 발견):
//   이메일만으로 세면 공격자가 고객 이메일 하나만 알아도(문의 메일·영수증 등에서
//   쉽게 얻는다) 10분마다 아무 비밀번호로 5번씩 던져 그 계정을 **무기한 잠글 수 있다**.
//   피해자는 비밀번호가 맞아도, 재설정을 해도 데스크톱 앱에 로그인할 수 없다
//   = 돈을 낸 고객이 제품을 못 쓴다. 공격 비용 0원.
//   막으려던 무차별 대입은 정작 공개 anon 키로 Supabase 를 직접 때리면 우회되므로
//   실익은 작고 부작용만 실재했다.
//
//   그래서 좁은 한도는 (이메일 + IP) 조합에 건다. 한 출처에서의 집중 추측은 5회로
//   묶이고, 특정 계정을 잠그려면 IP 를 계속 갈아타야 하는데 그러면 IP 한도에도
//   걸린다. 분산 공격으로 한 계정에 많은 시도를 하는 경우는 남지만, 최소 6자
//   비밀번호를 IP 수십 개로 뚫는 비용이 훨씬 크고 계정 잠금 부작용이 없다.

export type LoginGate = { retryAfter: number; message: string };

function keys(ip: string | null, email: string): { ipKey: string; pairKey: string | null } {
  const normalized =
    typeof email === "string" ? normalizeEmailAlias(email) : null;
  const ipPart = ip ?? "unknown";
  return {
    ipKey: `login:ip:${ipPart}`,
    pairKey: normalized ? `login:pair:${ipPart}:${normalized}` : null,
  };
}

/**
 * 로그인 시도를 허용할지 판정. 막아야 하면 LoginGate, 통과면 null.
 * 카운트를 올리지 않는다 — 실패 후 recordLoginFailure 를 부를 것.
 */
export async function checkLoginRateLimit(
  ip: string | null,
  email: string
): Promise<LoginGate | null> {
  const { ipKey, pairKey } = keys(ip, email);

  // 두 조회를 병렬로 — Upstash 지연이 로그인 응답에 두 배로 쌓이지 않게 한다.
  const [ipCheck, pairCheck] = await Promise.all([
    peekRateLimit(ipKey, IP_LIMIT, IP_WINDOW_MS),
    pairKey
      ? peekRateLimit(pairKey, PAIR_LIMIT, PAIR_WINDOW_MS)
      : Promise.resolve({ allowed: true, retryAfter: 0 }),
  ]);

  if (!ipCheck.allowed) {
    return {
      retryAfter: ipCheck.retryAfter,
      message:
        "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요. 비밀번호가 기억나지 않으면 비밀번호 재설정을 이용해주세요.",
    };
  }
  if (!pairCheck.allowed) {
    return {
      retryAfter: pairCheck.retryAfter,
      message:
        "로그인 시도 횟수를 초과했습니다. 10분 후 다시 시도하거나 비밀번호 재설정을 이용해주세요.",
    };
  }

  return null;
}

/** 인증 실패 시에만 호출 — 두 카운터를 함께 올린다. */
export async function recordLoginFailure(
  ip: string | null,
  email: string
): Promise<void> {
  const { ipKey, pairKey } = keys(ip, email);
  await Promise.all([
    bumpRateLimit(ipKey, IP_WINDOW_MS),
    pairKey ? bumpRateLimit(pairKey, PAIR_WINDOW_MS) : Promise.resolve(),
  ]);
}

export function loginTooMany(gate: LoginGate) {
  return NextResponse.json(
    { error: gate.message, retry_after: gate.retryAfter },
    { status: 429, headers: { "Retry-After": String(gate.retryAfter) } }
  );
}
