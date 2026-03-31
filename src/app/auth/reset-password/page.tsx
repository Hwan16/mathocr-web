"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSent(true);
    } catch {
      setError("요청 중 오류가 발생했습니다.");
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
          <p className="text-zinc-500 text-sm mt-2">비밀번호 재설정</p>
        </div>

        <div className="bezel-card rounded-2xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✉️</div>
              <h3 className="text-lg font-semibold text-zinc-100">
                이메일을 확인해주세요
              </h3>
              <p className="text-sm text-zinc-400">
                <span className="text-[var(--accent)]">{email}</span>
                으로 비밀번호 재설정 링크를 보냈습니다.
              </p>
              <p className="text-xs text-zinc-600">
                이메일이 안 보이면 스팸함을 확인해주세요.
              </p>
              <a
                href="/auth/login"
                className="inline-block mt-4 text-sm text-[var(--accent)] hover:underline"
              >
                로그인으로 돌아가기
              </a>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400 mb-6">
                가입한 이메일을 입력하면 비밀번호 재설정 링크를 보내드립니다.
              </p>
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

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "전송 중..." : "재설정 링크 보내기"}
                </button>
              </form>

              <div className="mt-6 text-center text-sm text-zinc-500">
                <a
                  href="/auth/login"
                  className="text-[var(--accent)] hover:underline"
                >
                  로그인으로 돌아가기
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
