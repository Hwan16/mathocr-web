"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { metaPixelTrack } from "@/lib/meta-pixel";
import { naverWcsTrans } from "@/lib/naver-wcs";

type State =
  | { phase: "confirming" }
  | { phase: "done"; credits?: number; expiresAt?: string | null }
  | { phase: "error"; message: string };

// 구매 전환 이벤트(메타 Purchase + 네이버 purchase) — 주문당 1회만 (성공 페이지
// 새로고침·재방문 시 중복 방지). 금액·통화·주문 난수 suffix만 보내며 개인 정보는
// 포함하지 않는다. (마케팅 백로그 §6-3) localStorage 키 이름은 메타 단독 시절
// 값을 유지한다 — 바꾸면 과거 주문이 새 키로 재발사된다.
//
// P1-7 (72.1 감사, 커밋 C): URL 파라미터만 믿고 쏘지 않는다. 나이스 경로는
// 발사 전에 본인 결제 이력(RLS "본인 결제 이력 조회")에서 최근 1시간 내
// status=completed + 금액 일치 행을 확인하고, 서버가 기록한 금액으로만 보낸다
// — 성공 URL 직접 입력(임의 ref·amount)으로 광고 전환 데이터를 오염시키는
// 경로 차단. 토스 경로는 /api/payments/confirm 성공 응답 뒤에만 발사하므로
// 이미 서버 검증이 선행된다. (크레딧 지급·잔액은 이 이벤트와 무관 — 광고
// 측정 데이터 정합성만의 문제)
function purchaseConversionOnce(orderId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = `meta_purchase_fired:${orderId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    // localStorage 불가 환경(시크릿 모드 등)에서는 중복 방지 없이 1회 전송
  }
  metaPixelTrack("Purchase", { value: amount, currency: "KRW" });
  // 네이버 전환 id는 주문 난수 suffix만 — 토스 경로의 전체 orderId에는 사용자
  // UUID가 들어 있어 제3자 전송 금지(LA-10과 동일 원칙). 나이스 경로의 ref는
  // 이미 suffix라 그대로 통과한다.
  const safeId = orderId.split("_").pop() || orderId;
  naverWcsTrans({ type: "purchase", value: String(amount), id: safeId });
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
      // ref = 주문 난수 suffix (LA-10 — 전체 orderId는 사용자 UUID가 들어 있어
      // URL 노출 제거). Purchase 중복 방지 키로만 쓰인다.
      const niceRef = sp.get("ref") ?? sp.get("orderId");
      const niceAmount = Number(sp.get("amount"));
      (async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          // 세션이 없으면 결제 실재를 확인할 수 없다 — 전환 이벤트도 보내지
          // 않는다 (P1-7 fail-closed: 위조 가능성이 있는 신호는 버린다)
          setState({ phase: "done" });
          return;
        }
        if (niceRef && Number.isFinite(niceAmount) && niceAmount > 0) {
          // P1-7 서버 조회 게이팅: RLS로 본인 행만 보이는 payments에서 방금
          // 결제(1시간 창)가 실재하는지 확인 — 있으면 서버 기록 금액으로 발사
          const { data: recent } = await supabase
            .from("payments")
            .select("amount, created_at")
            .eq("status", "completed")
            .gte(
              "created_at",
              new Date(Date.now() - 60 * 60 * 1000).toISOString()
            )
            .order("created_at", { ascending: false })
            .limit(5);
          const verified = (recent ?? []).find((p) => p.amount === niceAmount);
          if (verified) purchaseConversionOnce(niceRef, verified.amount);
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
          purchaseConversionOnce(orderId, amount);
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
