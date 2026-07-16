"use client";

import { Suspense, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";

const SAVED_EMAIL_KEY = "mathocr_saved_email";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get("redirect") || "/dashboard";
  // 오픈 리다이렉트 방지(LA-10): 내부 경로만 허용. "https://..." 같은 외부
  // 주소와 "//host"·"/\host"(프로토콜 상대 URL·백슬래시 변종)는 대시보드로 대체.
  const redirect =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.startsWith("/\\")
      ? rawRedirect
      : "/dashboard";
  // 이메일 인증 링크를 타고 돌아온 경우 (signup의 emailRedirectTo)
  const justConfirmed = searchParams.get("confirmed") === "1";

  // 저장된 이메일 불러오기
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_EMAIL_KEY);
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (
          error.code === "email_not_confirmed" ||
          error.message?.includes("not confirmed")
        ) {
          setError(
            "이메일 인증이 아직 완료되지 않았습니다. 가입 시 받은 메일의 인증 링크를 눌러주세요."
          );
        } else {
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        }
        return;
      }

      // 이메일 기억하기
      if (rememberEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }

      // 인증 후 프로모션 지급 (LA-02) — 가입 때 보관된 얼리버드 등 pending
      // 코드가 있으면 지금 지급된다. 실패해도 로그인은 계속 진행
      // (pending 이 남아 다음 로그인 때 재시도). 결과는 sessionStorage에 담아
      // 대시보드가 1회성 배너로 보여준다 (지급/마감/IP 제한을 사용자가 알 수 있게).
      try {
        const claimRes = await fetch("/api/promo/claim-pending", { method: "POST" });
        const claim = await claimRes.json().catch(() => null);
        if (claim?.applied) {
          sessionStorage.setItem(
            "mathocr_promo_notice",
            JSON.stringify({ type: "applied", credits: claim.credits_granted ?? 0 })
          );
        } else if (claim?.error === "exhausted" || claim?.error === "ip_limit") {
          sessionStorage.setItem(
            "mathocr_promo_notice",
            JSON.stringify({ type: claim.error })
          );
        }
      } catch {
        // 지급 재시도는 다음 로그인에서 — 로그인 흐름을 막지 않는다
      }

      trackEvent("login", { method: "password" });
      router.push(redirect);
      router.refresh();
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      {/* Logo */}
      <div className="text-center mb-8">
        <a href="/" className="inline-flex flex-col items-center gap-3">
          <img src="/mathocr-icon.png" alt="AI MathOCR" width={56} height={56} />
          <span className="text-2xl font-bold tracking-tight">
            AI Math<span className="text-[var(--accent)]">OCR</span>
          </span>
        </a>
        <p className="text-zinc-500 text-sm mt-2">계정에 로그인하세요</p>
      </div>

      {justConfirmed && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          이메일 인증이 완료되었습니다. 로그인해주세요. 🎉
        </div>
      )}

      {/* Form Card */}
      <div className="card rounded-xl p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              이메일
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              required
              className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1.5">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 입력"
              required
              className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 accent-[var(--accent)]"
              />
              <span className="text-sm text-zinc-600">아이디 기억하기</span>
            </label>
            <a
              href="/auth/reset-password"
              className="text-sm text-zinc-500 hover:text-[var(--accent)] transition-colors"
            >
              비밀번호 찾기
            </a>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-zinc-500">
          계정이 없으신가요?{" "}
          <a
            href="/auth/signup"
            className="text-[var(--accent)] hover:underline"
          >
            회원가입
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <Suspense
        fallback={<div className="text-zinc-500">로딩 중...</div>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
