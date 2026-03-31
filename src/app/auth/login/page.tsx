"use client";

import { Suspense, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

const SAVED_EMAIL_KEY = "mathocr_saved_email";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

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
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        return;
      }

      // 이메일 기억하기
      if (rememberEmail) {
        localStorage.setItem(SAVED_EMAIL_KEY, email);
      } else {
        localStorage.removeItem(SAVED_EMAIL_KEY);
      }

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
        <p className="text-zinc-500 text-sm mt-2">계정에 로그인하세요</p>
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
              placeholder="비밀번호 입력"
              required
              className="w-full px-4 py-3 rounded-xl bg-[#0a0a0a] border border-[var(--border-light)] text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(e) => setRememberEmail(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-[#0a0a0a] accent-[var(--accent)]"
              />
              <span className="text-sm text-zinc-400">아이디 기억하기</span>
            </label>
            <a
              href="/auth/reset-password"
              className="text-sm text-zinc-500 hover:text-[var(--accent)] transition-colors"
            >
              비밀번호 찾기
            </a>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <Suspense
        fallback={<div className="text-zinc-500">로딩 중...</div>}
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
