"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { PLANS } from "@/lib/plans";
import { buildOrderId, getPlan } from "@/lib/payments";
import { trackEvent } from "@/lib/analytics";

const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
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
  const [selectedId, setSelectedId] = useState<string>(
    getPlan(preselect ?? "") ? (preselect as string) : "basic"
  );
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          .select("credits, expires_at")
          .eq("id", user.id)
          .single();
        if (profile) {
          setCredits(profile.credits);
          setExpiresAt(profile.expires_at);
        }
      }
      setLoadingUser(false);
    })();
  }, []);

  const onPay = async () => {
    const plan = getPlan(selectedId);
    if (!plan || !user || !CLIENT_KEY) return;
    setError(null);
    setPaying(true);
    trackEvent("cta_click", { label: "charge_pay", location: `charge_${plan.id}` });
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

        {!PAYMENTS_ENABLED ? (
          <div className="card rounded-xl p-8 bg-white text-center">
            <p className="text-zinc-700 font-medium mb-1">
              결제 기능을 준비하고 있어요.
            </p>
            <p className="text-sm text-zinc-500">
              오픈 소식은 홈페이지와 이메일로 안내드릴게요.
            </p>
          </div>
        ) : loadingUser ? (
          <div className="card rounded-xl p-8 bg-white text-center text-zinc-500">
            불러오는 중…
          </div>
        ) : !user ? (
          <div className="card rounded-xl p-8 bg-white text-center">
            <p className="text-zinc-700 font-medium mb-4">
              크레딧 충전에는 로그인이 필요합니다.
            </p>
            <a
              href="/auth/login"
              className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
            >
              로그인하고 계속하기
            </a>
          </div>
        ) : (
          <>
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
                    onClick={() => setSelectedId(plan.id)}
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

            {error && (
              <p className="text-sm text-red-600 mb-4" role="alert">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={onPay}
              disabled={paying}
              className="btn-primary w-full py-4 rounded-lg text-base disabled:opacity-60"
            >
              {paying
                ? "결제창 여는 중…"
                : `${getPlan(selectedId)?.price.toLocaleString()}원 결제하기`}
            </button>

            <p className="text-xs text-zinc-400 mt-4 leading-relaxed">
              결제 완료 즉시 크레딧이 지급됩니다. 미사용 크레딧은 결제일로부터
              7일 이내 전액 환불받을 수 있으며, 자세한 내용은{" "}
              <a href="/terms" className="underline hover:text-zinc-600">
                이용약관
              </a>
              을 확인해주세요.
            </p>
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
