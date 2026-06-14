"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [promoBonusCredits, setPromoBonusCredits] = useState<number>(0);
  const [error, setError] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleValidatePromo() {
    const trimmed = promoCode.trim();
    if (!trimmed) return;

    setPromoStatus("checking");
    try {
      const response = await fetch("/api/auth/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPromoStatus("error");
        return;
      }

      if (result.valid) {
        setPromoBonusCredits(
          typeof result.bonus_credits === "number" ? result.bonus_credits : 0
        );
        setPromoStatus("valid");
      } else {
        setPromoStatus("invalid");
      }
    } catch {
      setPromoStatus("error");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          promo_code: promoCode,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = result.error ?? "회원가입 중 오류가 발생했습니다.";
        if (message.includes("already registered")) {
          setError("이미 가입된 이메일입니다.");
        } else {
          setError(message);
        }
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("가입은 완료됐지만 자동 로그인에 실패했습니다. 로그인해 주세요.");
        return;
      }

      // 가입 성공 → 자동 로그인 → 대시보드
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <a href="/" className="inline-flex flex-col items-center gap-3">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={56} height={56} />
            <span className="text-2xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <p className="text-zinc-500 text-sm mt-2">새 계정을 만드세요</p>
        </div>

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
                placeholder="6자 이상"
                required
                className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                비밀번호 확인
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호 재입력"
                required
                className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                프로모션 코드 (선택)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    if (promoStatus !== "idle") setPromoStatus("idle");
                  }}
                  placeholder="있다면 입력하세요"
                  className="flex-1 px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
                />
                <button
                  type="button"
                  onClick={handleValidatePromo}
                  disabled={!promoCode.trim() || promoStatus === "checking"}
                  className="px-4 py-3 rounded-lg border border-zinc-300 text-zinc-600 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  확인
                </button>
              </div>
              {promoStatus === "idle" && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  프로모션 코드를 입력하면 추가 크레딧을 받을 수 있습니다.
                </p>
              )}
              {promoStatus === "checking" && (
                <p className="mt-1.5 text-xs text-zinc-500">확인 중...</p>
              )}
              {promoStatus === "valid" && (
                <p className="mt-1.5 text-xs text-emerald-600">
                  ✓ 사용 가능한 코드입니다. 가입 시 +{promoBonusCredits}크레딧 보너스가 적용됩니다.
                </p>
              )}
              {promoStatus === "invalid" && (
                <p className="mt-1.5 text-xs text-red-600">
                  ✗ 유효하지 않은 코드입니다.
                </p>
              )}
              {promoStatus === "error" && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  확인에 실패했습니다. 잠시 후 다시 시도해주세요.
                </p>
              )}
            </div>

            {/* 약관 동의 */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="terms"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
              />
              <label htmlFor="terms" className="text-xs text-zinc-600 leading-relaxed cursor-pointer">
                <a
                  href="/terms"
                  target="_blank"
                  className="text-[var(--accent)] hover:underline"
                >
                  서비스 이용약관
                </a>
                에 동의합니다.
              </label>
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !agreed}
              className="w-full btn-primary py-3 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-zinc-500">
            이미 계정이 있으신가요?{" "}
            <a
              href="/auth/login"
              className="text-[var(--accent)] hover:underline"
            >
              로그인
            </a>
          </div>
        </div>

        {/* Benefits */}
        <div className="mt-6 text-center text-xs text-zinc-500">
          가입 시 무료 체험 크레딧 5회가 제공됩니다
        </div>
      </div>
    </div>
  );
}
