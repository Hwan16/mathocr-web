"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        if (error.message.includes("already registered")) {
          setError("이미 가입된 이메일입니다.");
        } else {
          setError(error.message);
        }
        return;
      }

      // 가입 성공 → 자동 로그인 → 대시보드
      await supabase.auth.signInWithPassword({ email, password });
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex items-center gap-2">
            <span
              className="text-3xl font-bold tracking-tighter"
              style={{ fontFamily: "var(--font-en)" }}
            >
              Math
            </span>
            <span
              className="text-3xl font-bold text-[var(--accent)]"
              style={{ fontFamily: "var(--font-en)" }}
            >
              OCR
            </span>
          </a>
          <p className="text-zinc-500 text-sm mt-2">새 계정을 만드세요</p>
        </div>

        {/* Form Card */}
        <div className="bezel-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                이메일
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[var(--border-light)] text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[var(--border-light)] text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                비밀번호 확인
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="비밀번호 재입력"
                required
                className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[var(--border-light)] text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="mt-6 text-center text-xs text-zinc-600">
          가입 시 무료 체험 크레딧 5회가 제공됩니다
        </div>
      </div>
    </div>
  );
}
