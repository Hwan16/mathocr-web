"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function FailInner() {
  const sp = useSearchParams();
  const message = sp.get("message") ?? "결제가 완료되지 않았습니다.";
  const code = sp.get("code");

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-6">
      <div className="card rounded-2xl bg-white p-10 max-w-md w-full text-center">
        <div className="text-4xl mb-4" aria-hidden>
          💳
        </div>
        <h1 className="text-xl font-bold mb-2">결제가 진행되지 않았어요</h1>
        <p className="text-sm text-zinc-600 mb-1">{message}</p>
        {code && <p className="text-xs text-zinc-400 mb-6">오류 코드: {code}</p>}
        <p className="text-xs text-zinc-400 mb-6">
          카드 금액은 청구되지 않았습니다. 다시 시도하시거나, 문제가 계속되면
          aimathocr.official@gmail.com 으로 문의해주세요.
        </p>
        <a
          href="/charge"
          className="btn-primary px-5 py-2.5 rounded-lg text-sm inline-block"
        >
          다시 시도하기
        </a>
      </div>
    </main>
  );
}

export default function ChargeFailPage() {
  return (
    <Suspense fallback={null}>
      <FailInner />
    </Suspense>
  );
}
