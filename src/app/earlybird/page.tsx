"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { trackEvent } from "@/lib/analytics";
import { metaPixelTrack } from "@/lib/meta-pixel";
import { getStoredUtm } from "@/lib/utm";

// ── 얼리버드 전용 가입 페이지 ──
// 일반 가입(/auth/signup)과 분리된 경험: 선착순 200명 · 가입 즉시 총 30문제(기본 5 +
// 보너스 25, 유효 30일) · 혜택 조건으로 오픈 소식 메일 수신 동의(필수)를 받는다.
// 코드는 화면에 노출하지 않고 서버로 자동 적용한다. 결제 오픈 시 이 페이지는
// earlybird 코드 비활성화만으로 자동 '마감' 상태가 된다 (배포 불필요).

// 서버(api/auth/signup/route.ts)의 CONSENT_VERSION과 반드시 일치시킬 것.
const CONSENT_VERSION = "2026-07-11";
const EARLYBIRD_CODE = "earlybird";

// 가입은 됐지만 보너스가 미적용된 경우의 안내문 (signup API의 promo_error)
const PROMO_ERROR_NOTICES: Record<string, string> = {
  exhausted:
    "아쉽게도 방금 선착순 200명이 마감되어 보너스 크레딧은 적용되지 못했어요. 기본 무료 5문제는 정상 지급되었습니다.",
  already_redeemed:
    "이미 얼리버드 혜택을 받은 이력이 있는 이메일이라 보너스는 적용되지 않았어요. 기본 무료 5문제는 정상 지급되었습니다.",
  ip_limit:
    "같은 네트워크에서 참여 한도(24시간 내 2회)를 초과해 보너스는 적용되지 않았어요. 기본 무료 5문제는 정상 지급되었습니다.",
};

function EarlybirdContent() {
  const [codeStatus, setCodeStatus] = useState<"checking" | "open" | "closed">(
    "checking"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);
  const [promoNotice, setPromoNotice] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // 코드 상태 사전 확인 — 선착순 소진/비활성이면 마감 화면으로.
  // ?preview=1 은 디자인 확인용 강제 오픈 (실제 지급은 서버가 판단하므로 안전).
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (searchParams.get("preview") === "1") {
        setCodeStatus("open");
        return;
      }
      try {
        const res = await fetch("/api/auth/validate-promo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: EARLYBIRD_CODE }),
        });
        const result = await res.json().catch(() => ({}));
        if (!cancelled) {
          setCodeStatus(res.ok && result.valid ? "open" : "closed");
        }
      } catch {
        // 확인 실패 시에도 가입 자체는 가능하므로 열어둔다 (지급은 서버가 판단)
        if (!cancelled) setCodeStatus("open");
      }
    }
    check();
    trackEvent("earlybird_page_view");
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

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
    if (!agreeTerms || !agreePrivacy) {
      setError("필수 약관에 동의해주세요.");
      return;
    }
    if (!agreeMarketing) {
      setError(
        "얼리버드 혜택을 받으려면 오픈 소식 메일 수신에 동의해주세요. 동의를 원치 않으시면 일반 회원가입을 이용해주세요."
      );
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
          promo_code: EARLYBIRD_CODE,
          agreed_terms: agreeTerms,
          agreed_privacy: agreePrivacy,
          consent_version: CONSENT_VERSION,
          marketing_opt_in: true,
          ...(getStoredUtm() ?? {}),
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = result.error ?? "회원가입 중 오류가 발생했습니다.";
        if (message.includes("already registered")) {
          setError("이미 가입된 이메일입니다. 로그인해 주세요.");
        } else {
          setError(message);
        }
        return;
      }

      // 가입은 성공 — 보너스 미적용 사유가 있으면 정직하게 안내
      if (!result.promo_applied) {
        setPromoNotice(
          PROMO_ERROR_NOTICES[result.promo_error as string] ??
            "보너스 크레딧 적용이 확인되지 않았어요. 기본 무료 5문제는 정상 지급되었습니다. 문제가 있으면 문의해주세요."
        );
      }

      trackEvent("sign_up", { method: "earlybird" });
      metaPixelTrack("CompleteRegistration");

      if (result.needs_confirmation) {
        setConfirmEmailSent(true);
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
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("회원가입 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-zinc-50">
      <div className="w-full max-w-[440px]">
        <div className="card rounded-2xl shadow-sm overflow-hidden">
          {/* 히어로: 마스코트 (원본 배경색과 동일한 라벤더 → 흰색으로 페이드) */}
          <div className="relative bg-[#eae1fc]">
            <img
              src="/earlybird-mascot.webp"
              alt="AI MathOCR 마스코트"
              className="w-full h-44 object-cover object-top"
            />
            {/* 발끝 크롭을 자연스럽게 가리는 하단 페이드 */}
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
            <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-widest bg-violet-600 text-white rounded-full px-3 py-1">
              EARLY BIRD · 선착순 200명
            </span>
          </div>

          {confirmEmailSent ? (
            /* 가입 완료 → 메일 인증 안내 */
            <div className="px-7 pb-8 pt-2 text-center">
              <div className="text-4xl mb-3" aria-hidden>
                📮
              </div>
              <h1 className="text-lg font-bold text-zinc-900 mb-2">
                거의 다 됐어요 — 메일함을 확인해주세요
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed mb-1">
                <strong className="text-zinc-900">{email}</strong> 주소로 보낸
                인증 링크를 누르면 가입이 완료되고,
                {promoNotice ? (
                  <> 무료 크레딧이 준비됩니다.</>
                ) : (
                  <>
                    {" "}
                    <strong className="text-violet-700">총 30문제</strong>가 바로
                    준비됩니다.
                  </>
                )}
              </p>
              {promoNotice && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-left leading-relaxed">
                  {promoNotice}
                </p>
              )}
              <p className="text-xs text-zinc-400 leading-relaxed mt-3 mb-6">
                메일이 안 보이면 스팸함을 확인해주세요.
              </p>
              <a
                href="/auth/login"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
              >
                로그인 페이지로
              </a>
            </div>
          ) : codeStatus === "closed" ? (
            /* 선착순 마감 */
            <div className="px-7 pb-8 pt-2 text-center">
              <h1 className="text-xl font-bold text-zinc-900 mb-2">
                얼리버드가 마감되었어요
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed mb-6">
                선착순 200명이 모두 찼습니다. 지금 가입해도{" "}
                <b>무료 체험 5문제</b>는 받을 수 있어요.
              </p>
              <a
                href="/auth/signup"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
              >
                일반 회원가입으로 시작하기
              </a>
            </div>
          ) : (
            /* 얼리버드 가입 폼 */
            <div className="px-7 pb-7 pt-1">
              <h1 className="text-xl font-bold text-zinc-900 leading-snug">
                지금 가입하면{" "}
                <span className="text-violet-700">30문제 무료</span>
              </h1>
              <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
                정식 오픈 전 얼리버드 — 시험지 한 장을 통째로 한글(HWP)로
                변환해 보세요.
              </p>

              <ul className="mt-4 space-y-1.5 text-sm text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="text-[var(--accent)] mt-0.5">✓</span>
                  가입 즉시 총 <b>30문제</b> (기본 5 + 보너스 25 · 유효기간
                  30일)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[var(--accent)] mt-0.5">✓</span>
                  정식 오픈 소식을 메일로 가장 먼저 안내
                </li>
              </ul>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

                {/* 동의: 필수 약관 2종 + 얼리버드 혜택 조건(메일 수신) */}
                <div className="space-y-2.5 rounded-lg border border-zinc-200 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="eb-agree-terms"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="eb-agree-terms"
                      className="text-xs text-zinc-600 leading-relaxed cursor-pointer"
                    >
                      <span className="text-zinc-400">(필수)</span>{" "}
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
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="eb-agree-privacy"
                      checked={agreePrivacy}
                      onChange={(e) => setAgreePrivacy(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="eb-agree-privacy"
                      className="text-xs text-zinc-600 leading-relaxed cursor-pointer"
                    >
                      <span className="text-zinc-400">(필수)</span>{" "}
                      <a
                        href="/privacy"
                        target="_blank"
                        className="text-[var(--accent)] hover:underline"
                      >
                        개인정보 수집·이용
                      </a>
                      에 동의합니다.
                    </label>
                  </div>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="eb-agree-marketing"
                      checked={agreeMarketing}
                      onChange={(e) => setAgreeMarketing(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="eb-agree-marketing"
                      className="text-xs text-zinc-600 leading-relaxed cursor-pointer"
                    >
                      <span className="text-zinc-400">(얼리버드 혜택 조건)</span>{" "}
                      정식 오픈 소식·혜택 안내 메일 수신에 동의합니다. 수신
                      거부는 언제든 가능합니다.
                    </label>
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !agreeTerms || !agreePrivacy}
                  className="w-full btn-primary py-3 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "가입 중..." : "선착순 30문제 받고 시작하기"}
                </button>
              </form>

              <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
                얼리버드 혜택은 1인 1회 제공됩니다. 이메일 변형 등 중복·부정
                가입이 확인되면 지급된 크레딧이 회수될 수 있습니다.
              </p>

              <div className="mt-4 text-center text-sm text-zinc-500">
                이미 계정이 있으신가요?{" "}
                <a
                  href="/auth/login"
                  className="text-[var(--accent)] hover:underline"
                >
                  로그인
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}

export default function EarlybirdPage() {
  // useSearchParams 는 Suspense 경계가 필요하다 (Next App Router)
  return (
    <Suspense fallback={null}>
      <EarlybirdContent />
    </Suspense>
  );
}
