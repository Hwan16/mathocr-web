"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { metaPixelTrack } from "@/lib/meta-pixel";

type State =
  | { phase: "confirming" }
  | { phase: "done"; credits?: number; expiresAt?: string | null }
  | { phase: "error"; message: string };

// 메타 픽셀 Purchase 이벤트 — 주문당 1회만 (성공 페이지 새로고침·재방문 시 중복 방지).
// 금액·통화만 보내며 개인 정보는 포함하지 않는다. (마케팅 백로그 §6-3)
function metaPixelPurchaseOnce(orderId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = `meta_purchase_fired:${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // localStorage 불가 환경(시크릿 모드 등)에서는 중복 방지 없이 1회 전송
  }
  metaPixelTrack("Purchase", { value: amount, currency: "KRW" });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "무제한";
  const d = new Date(iso);
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`;
}

function SuccessInner() {
  const sp = useSearchParams();
  const [state, setState] = useState<State>({ phase: "confirming" });
  const requested = useRef(false);

  useEffect(() => {
    // React StrictMode의 이중 실행으로 승인 API가 두 번 불리지 않게 가드
    // (서버도 멱등이지만 불필요한 왕복을 줄인다)
    if (requested.current) return;
    requested.current = true;

    // 나이스페이 경로 — 승인·지급은 return 라우트(서버)에서 이미 끝났다.
    // 여기서는 갱신된 잔액만 조회해 보여준다.
    if (sp.get("pg") === "nice") {
      const niceOrderId = sp.get("orderId");
      const niceAmount = Number(sp.get("amount"));
      if (niceOrderId) metaPixelPurchaseOnce(niceOrderId, niceAmount);
      (async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setState({ phase: "done" });
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("credits, expires_at")
          .eq("id", user.id)
          .single();
        setState({
          phase: "done",
          credits: profile?.credits,
          expiresAt: profile?.expires_at,
        });
      })();
      return;
    }

    const paymentKey = sp.get("paymentKey");
    const orderId = sp.get("orderId");
    const amount = Number(sp.get("amount"));

    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      setState({ phase: "error", message: "결제 정보가 누락되었습니다." });
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          metaPixelPurchaseOnce(orderId, amount);
          setState({
            phase: "done",
            credits: data.credits,
            expiresAt: data.expires_at,
          });
        } else {
          setState({
            phase: "error",
            message: data?.error ?? "결제 승인에 실패했습니다.",
          });
        }
      } catch {
        setState({
          phase: "error",
          message: "네트워크 오류가 발생했습니다. 잠시 후 새로고침해주세요.",
        });
      }
    })();
  }, [sp]);

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-6">
      <div className="card rounded-2xl bg-white p-10 max-w-md w-full text-center">
        {state.phase === "confirming" && (
          <>
            <div className="text-4xl mb-4" aria-hidden>
              ⏳
            </div>
            <h1 className="text-xl font-bold mb-2">결제를 확인하고 있어요…</h1>
            <p className="text-sm text-zinc-500">
              창을 닫지 말고 잠시만 기다려주세요.
            </p>
          </>
        )}
        {state.phase === "done" && (
          <>
            <div className="text-4xl mb-4" aria-hidden>
              🎉
            </div>
            <h1 className="text-xl font-bold mb-2">충전 완료!</h1>
            <p className="text-zinc-600 mb-6">
              보유 크레딧{" "}
              <strong className="text-zinc-900">{state.credits ?? "-"}</strong>
              <br />
              유효기간{" "}
              <strong className="text-zinc-900">
                {formatDate(state.expiresAt)}
              </strong>
            </p>
            <div className="flex gap-3 justify-center">
              <a
                href="/dashboard"
                className="btn-primary px-5 py-2.5 rounded-lg text-sm"
              >
                내 대시보드
              </a>
              <a
                href="/"
                className="btn-outline px-5 py-2.5 rounded-lg text-sm"
              >
                홈으로
              </a>
            </div>
          </>
        )}
        {state.phase === "error" && (
          <>
            <div className="text-4xl mb-4" aria-hidden>
              ⚠️
            </div>
            <h1 className="text-xl font-bold mb-2">
              결제 확인에 실패했습니다
            </h1>
            <p className="text-sm text-zinc-600 mb-6">{state.message}</p>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              카드에서 결제가 이뤄졌다면 잠시 후 자동으로 지급되거나 승인되지
              않은 결제는 청구되지 않습니다. 문제가 계속되면
              aimathocr.official@gmail.com 으로 문의해주세요.
            </p>
            <a
              href="/charge"
              className="btn-outline px-5 py-2.5 rounded-lg text-sm inline-block"
            >
              충전 페이지로 돌아가기
            </a>
          </>
        )}
      </div>
    </main>
  );
}

export default function ChargeSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessInner />
    </Suspense>
  );
}
