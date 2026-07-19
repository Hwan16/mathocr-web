"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PLANS } from "@/lib/plans";
import { buildOrderId, getPlan } from "@/lib/payments";
import { trackEvent } from "@/lib/analytics";

// PG 선택 — 기본은 나이스페이(포스타트). 토스 심사 통과 후 되돌리려면
// NEXT_PUBLIC_PG_PROVIDER=toss 로 전환한다(토스 경로 보존).
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
const NICE_CLIENT_KEY = process.env.NEXT_PUBLIC_NICEPAY_CLIENT_KEY;
const PG: "nice" | "toss" =
  process.env.NEXT_PUBLIC_PG_PROVIDER === "toss" || !NICE_CLIENT_KEY
    ? "toss"
    : "nice";
const CLIENT_KEY = PG === "nice" ? NICE_CLIENT_KEY : TOSS_CLIENT_KEY;
const PAYMENTS_ENABLED =
  process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true" && !!CLIENT_KEY;

function formatDate(iso: string | null): string {
  if (!iso) return "무제한";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`;
}

function ChargeInner() {
  const searchParams = useSearchParams();
  const preselect = searchParams.get("plan");

  const [loadingUser, setLoadingUser] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  // 결제 비공개(PAYMENTS_ENABLED=false) 기간에도 관리자에게는 결제 UI를 노출한다
  // — 실도메인 결제 테스트·카드사 심사용 결제경로 캡처 목적.
  const [role, setRole] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(
    getPlan(preselect ?? "") ? (preselect as string) : "basic"
  );
  const [paying, setPaying] = useState(false);
  // 상품 내용(유효기간 포함)·환불 규정 확인 체크 — 미체크 시 결제 불가.
  // 분쟁 시 "고지받지 못했다" 주장을 차단하는 핵심 증거라 플랜을 바꾸면 다시 받는다.
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 결제 kill switch (LA-06) — 서버가 승인을 거부하는 상태면 결제창을 열기 전에
  // 안내한다. 조회 실패 시 false 유지(진짜 차단은 서버 승인 라우트가 한다).
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    fetch("/api/payments/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPaused(data?.paused === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, expires_at, role")
          .eq("id", user.id)
          .single();
        if (profile) {
          setCredits(profile.credits);
          setExpiresAt(profile.expires_at);
          setRole(profile.role);
        }
      }
      setLoadingUser(false);
    })();
  }, []);

  const selectedPlan = getPlan(selectedId);
  // 공개 전이라도 관리자는 결제 UI 접근 가능 (실도메인 테스트·심사 캡처용)
  const payAllowed = (PAYMENTS_ENABLED || role === "admin") && !!CLIENT_KEY;

  const onPay = async () => {
    const plan = getPlan(selectedId);
    if (!plan || !user || !CLIENT_KEY || !confirmed || paused) return;
    setError(null);
    setPaying(true);
    trackEvent("cta_click", { label: "charge_pay", location: `charge_${plan.id}` });

    if (PG === "nice") {
      // 나이스 결제창 — 인증 완료 시 returnUrl(서버)이 승인·지급까지 처리한다.
      const AUTHNICE = (
        window as unknown as {
          AUTHNICE?: { requestPay: (options: Record<string, unknown>) => void };
        }
      ).AUTHNICE;
      if (!AUTHNICE) {
        setError("결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
        setPaying(false);
        return;
      }
      AUTHNICE.requestPay({
        clientId: CLIENT_KEY,
        method: "cardAndEasyPay",
        orderId: buildOrderId(plan.id, user.id),
        amount: plan.price,
        goodsName: `AI MathOCR ${plan.name} ${plan.credits}크레딧`,
        returnUrl: `${window.location.origin}/api/payments/nice/return`,
        buyerEmail: user.email ?? undefined,
        fnError: (result: { errorMsg?: string }) => {
          setError(result?.errorMsg ?? "결제창을 여는 중 문제가 발생했습니다.");
          setPaying(false);
        },
      });
      // 결제창(레이어)이 열린 뒤 버튼을 다시 활성화 — 사용자가 창을 닫아도 재시도할
      // 수 있게 한다. 승인·지급은 서버에서 멱등 처리라 중복 결제 위험은 없다.
      window.setTimeout(() => setPaying(false), 3000);
      return;
    }

    try {
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey: user.id });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: plan.price },
        orderId: buildOrderId(plan.id, user.id),
        orderName: `AI MathOCR ${plan.name} ${plan.credits}크레딧`,
        successUrl: `${window.location.origin}/charge/success`,
        failUrl: `${window.location.origin}/charge/fail`,
        customerEmail: user.email ?? undefined,
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우는 조용히 복귀, 그 외에는 메시지 표시
      const err = e as { code?: string; message?: string };
      if (err?.code !== "PAY_PROCESS_CANCELED") {
        setError(err?.message ?? "결제창을 여는 중 문제가 발생했습니다.");
      }
      setPaying(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      {PG === "nice" && (
        <Script src="https://pay.nicepay.co.kr/v1/js/" strategy="afterInteractive" />
      )}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <a href="/" className="inline-flex items-center gap-2 mb-10">
          <img src="/mathocr-icon.png" alt="" width={22} height={22} />
          <span className="font-bold text-zinc-900">
            AI Math<span className="text-[var(--accent)]">OCR</span>
          </span>
        </a>

        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight mb-2">
          크레딧 충전
        </h1>
        <p className="text-zinc-600 mb-8">
          만료 전에 충전하면 남은 크레딧도 새 유효기간으로 함께 연장됩니다.
        </p>

        {loadingUser ? (
          <div className="card rounded-xl p-8 bg-white text-center text-zinc-500">
            불러오는 중…
          </div>
        ) : paused ? (
          <div className="card rounded-xl p-8 bg-white text-center">
            <p className="text-zinc-700 font-medium mb-1">
              결제가 일시 중단되었습니다.
            </p>
            <p className="text-sm text-zinc-500">
              시스템 점검 중입니다. 잠시 후 다시 시도해주세요.
            </p>
          </div>
        ) : !user && PAYMENTS_ENABLED ? (
          <div className="card rounded-xl p-8 bg-white text-center">
            <p className="text-zinc-700 font-medium mb-4">
              크레딧 충전에는 로그인이 필요합니다.
            </p>
            <a
              href="/auth/login?redirect=%2Fcharge"
              className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
            >
              로그인하고 계속하기
            </a>
          </div>
        ) : !user || !payAllowed ? (
          <div className="card rounded-xl p-8 bg-white text-center">
            <p className="text-zinc-700 font-medium mb-1">
              결제 기능을 준비하고 있어요.
            </p>
            <p className="text-sm text-zinc-500">
              오픈 소식은 홈페이지와 이메일로 안내드릴게요.
            </p>
          </div>
        ) : (
          <>
            {!PAYMENTS_ENABLED && (
              <div className="mb-6 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                관리자 미리보기 — 일반 사용자에게는 아직 결제가 공개되지
                않았습니다.
              </div>
            )}
            <div className="card rounded-xl p-5 bg-white mb-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-zinc-500">
                보유 크레딧{" "}
                <strong className="text-zinc-900 text-base">
                  {credits ?? "-"}
                </strong>
              </span>
              <span className="text-zinc-500">
                유효기간{" "}
                <strong className="text-zinc-900">
                  {formatDate(expiresAt)}
                </strong>
              </span>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {PLANS.map((plan) => {
                const selected = plan.id === selectedId;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(plan.id);
                      setConfirmed(false); // 플랜이 바뀌면 확인을 다시 받는다
                    }}
                    className={`card rounded-xl p-5 bg-white text-left transition-shadow ${
                      selected
                        ? "!border-[var(--accent)] ring-1 ring-[var(--accent)]"
                        : "hover:shadow-sm"
                    }`}
                  >
                    <div
                      className="inline-block text-sm font-bold px-2.5 py-0.5 rounded-full mb-2"
                      style={{
                        color: plan.color,
                        backgroundColor: plan.color + "1a",
                      }}
                    >
                      {plan.name}
                    </div>
                    <div className="text-xl font-bold mb-0.5">
                      {plan.price.toLocaleString()}원
                    </div>
                    <div className="text-xs text-zinc-500">
                      {plan.credits} 크레딧 · {plan.validityDays}일 · 크레딧당{" "}
                      {plan.perUnit}원
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 환불·유효기간 안내 — 결제 전 고지 (전자상거래법상 거래조건 표시 + 분쟁 예방) */}
            <div className="card rounded-xl bg-white p-5 mb-4">
              <p className="text-sm font-semibold text-zinc-900 mb-2">
                환불·유효기간 안내
              </p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-600 leading-relaxed">
                <li>결제 완료 즉시 크레딧이 지급됩니다.</li>
                <li>
                  결제 후 <strong className="text-zinc-800">7일 이내</strong>에는
                  미사용 크레딧 전액을 환불받을 수 있습니다. (일부 사용 시
                  사용분 차감)
                </li>
                <li>
                  7일이 지난 후에는 미사용 크레딧 금액에서{" "}
                  <strong className="text-zinc-800">10%를 공제</strong>한 금액이
                  환불됩니다.
                </li>
                <li>
                  <strong className="text-zinc-800">
                    유효기간이 지난 크레딧은 자동 소멸되며 환불 대상이
                    아닙니다.
                  </strong>{" "}
                  만료 전에 충전하면 남아 있는 크레딧의 유효기간도 새 충전분
                  기준으로 함께 연장됩니다.
                </li>
                <li>
                  자세한 내용은{" "}
                  <a
                    href="/terms"
                    className="underline hover:text-zinc-900"
                    target="_blank"
                  >
                    이용약관
                  </a>
                  에서 확인할 수 있습니다.
                </li>
              </ul>
            </div>

            {/* 최종 확인 — 유효기간 있는 상품임을 결제 직전에 명시적으로 확인받는다 */}
            {selectedPlan && (
              <label className="flex items-start gap-2.5 mb-4 cursor-pointer select-none text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  [ {selectedPlan.name} / {selectedPlan.credits}크레딧 /{" "}
                  <strong className="text-zinc-900">
                    유효기간 {selectedPlan.validityDays}일
                  </strong>{" "}
                  / {selectedPlan.price.toLocaleString()}원 ] 상품 내용과 위
                  환불·유효기간 안내를 확인했습니다.
                </span>
              </label>
            )}

            {error && (
              <p className="text-sm text-red-600 mb-4" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={onPay}
              disabled={paying || !confirmed}
              className="btn-primary w-full py-4 rounded-lg text-base disabled:opacity-60"
            >
              {paying
                ? "결제창 여는 중…"
                : `${getPlan(selectedId)?.price.toLocaleString()}원 결제하기`}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function ChargePage() {
  return (
    <Suspense fallback={null}>
      <ChargeInner />
    </Suspense>
  );
}
