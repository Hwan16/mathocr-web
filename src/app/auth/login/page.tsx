"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { metaPixelTrack } from "@/lib/meta-pixel";

const SAVED_EMAIL_KEY = "mathocr_saved_email";

// 로그인 후 이동 경로를 같은 출처의 내부 경로로만 제한한다(오픈 리다이렉트 방지).
// 고정 base로 파싱하므로 브라우저의 제어문자 제거·프로토콜 상대 URL 정규화까지
// 반영된다 — origin이 base와 달라지면(외부로 탈출) 대시보드로 대체한다.
function safeInternalPath(raw: string | null): string {
  if (!raw) return "/dashboard";
  try {
    const base = "https://internal.invalid";
    const u = new URL(raw, base);
    if (u.origin === base && u.pathname.startsWith("/")) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    // 파싱 불가 → 안전 기본값
  }
  return "/dashboard";
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // 오픈 리다이렉트 방지(LA-10): 내부 경로만 허용. 단순 문자열 접두사 검사는
  // 탭·개행 등 제어문자(`/%09/evil.com` → 브라우저 정규화 후 `//evil.com`)로
  // 우회되므로, 고정 base로 파싱해 origin이 그대로일 때만 통과시킨다.
  const redirect = safeInternalPath(searchParams.get("redirect"));
  // 이메일 인증 링크를 타고 돌아온 경우 (signup의 emailRedirectTo).
  // 안내 배너는 상태로 유지한다 — 아래 효과가 중복 집계 방지를 위해 URL에서
  // 파라미터를 지운 뒤에도 첫 화면의 안내는 남아야 하므로.
  const justConfirmed = searchParams.get("confirmed") === "1";
  const [confirmBanner, setConfirmBanner] = useState<"success" | "failed" | null>(null);
  const confirmHandled = useRef(false);

  useEffect(() => {
    if (!justConfirmed || confirmHandled.current) return;
    confirmHandled.current = true;
    // Supabase는 만료·재사용된 링크도 이 주소로 돌려보내며 실패 사유를 URL 해시에
    // 담는다(#error=...&error_code=otp_expired). 실패면 가입 완료로 집계하지 않는다.
    if (window.location.hash.includes("error")) {
      setConfirmBanner("failed");
    } else {
      setConfirmBanner("success");
      // LA-14: 인증 링크 도착 = 가입 완료 신호. 폼 제출(begin_registration·Lead)과
      // 분리해 광고 성과를 인증 마친 계정 기준으로 잡는다.
      trackEvent("verified_signup", { method: "password" });
      metaPixelTrack("CompleteRegistration");
    }
    // 새로고침 시 재집계되지 않도록 파라미터·해시를 URL에서 지운다 (배너는 상태로 유지).
    // 인증 메일 링크에는 redirect 파라미터가 없지만, 혹시 있으면 보존한다.
    const rawRedirect = searchParams.get("redirect");
    router.replace(
      rawRedirect
        ? `/auth/login?redirect=${encodeURIComponent(rawRedirect)}`
        : "/auth/login"
    );
  }, [justConfirmed, router, searchParams]);

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

      {confirmBanner === "success" && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          이메일 인증이 완료되었습니다. 로그인해주세요. 🎉
        </div>
      )}
      {confirmBanner === "failed" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          인증 링크가 만료되었거나 이미 사용된 링크입니다. 이미 인증을 마쳤다면 그대로
          로그인해주세요.
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
