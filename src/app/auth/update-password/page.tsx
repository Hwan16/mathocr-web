"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    // 1) onAuthStateChange로 PASSWORD_RECOVERY 이벤트 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          if (session) setReady(true);
        }
      }
    );

    // 2) URL hash에 토큰이 있으면 직접 세션 설정
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (accessToken && refreshToken) {
        supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => {
            if (!error) setReady(true);
            else setError("인증 링크가 만료되었거나 유효하지 않습니다.");
          });
      }
    }

    // 3) 이미 세션이 있으면 바로 ready
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    // 4) 3초 후에도 안 되면 에러 표시
    const timeout = setTimeout(() => {
      setReady((prev) => {
        if (!prev) setError("인증 링크가 만료되었거나 유효하지 않습니다.");
        return prev;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">인증 확인 중...</div>
      </div>
    );
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
          <p className="text-zinc-500 text-sm mt-2">새 비밀번호 설정</p>
        </div>

        <div className="bezel-card rounded-2xl p-8">
          {error && !ready ? (
            <div className="text-center space-y-4">
              <p className="text-red-400 text-sm">{error}</p>
              <a
                href="/auth/reset-password"
                className="inline-block text-sm text-[var(--accent)] hover:underline"
              >
                다시 비밀번호 재설정 요청하기
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  새 비밀번호
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
                  새 비밀번호 확인
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

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary py-3 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "변경 중..." : "비밀번호 변경"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
