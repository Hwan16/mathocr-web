"use client";

import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/analytics";
import { SIGNUP_FREE_CREDITS } from "@/lib/plans";
import { metaPixelTrack } from "@/lib/meta-pixel";
import { naverWcsTrans } from "@/lib/naver-wcs";
import ResendConfirmationMail, {
  startResendCooldown,
} from "@/components/ResendConfirmationMail";
import { getStoredUtm } from "@/lib/utm";
// 동의받은 약관/방침의 버전(시행일) — lib/consent.ts 단일 출처 (서버와 자동 일치)
import { CONSENT_VERSION } from "@/lib/consent";
// 가입 기본 프로모션(얼리버드) — 서버(/api/auth/signup)와 같은 상수를 공유
import { DEFAULT_SIGNUP_PROMO } from "@/lib/promo";

export default function SignupPage() {
  // useSearchParams는 Suspense 경계가 필요하다 (Next.js 규칙)
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoStatus, setPromoStatus] = useState<
    "idle" | "checking" | "valid" | "invalid" | "error"
  >("idle");
  const [promoBonusCredits, setPromoBonusCredits] = useState<number>(0);
  // 코드에 유효기간이 지정된 경우(일수) — 가입 시 만료일이 최소 now()+n일로 연장됨
  const [promoValidityDays, setPromoValidityDays] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  // 마케팅 수신 동의 (LA-09) — 순수 선택·기본 해제. 얼리버드 등 혜택 지급과
  // 무관하며, 체크하지 않아도 가입·혜택에 아무 영향이 없다.
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  // 이메일 인증(Confirm email)이 켜진 경우: 가입 후 "메일 확인" 안내 화면으로 전환
  const [confirmEmailSent, setConfirmEmailSent] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  // 혜택 링크(?promo=코드) 경유 — 얼리버드 팝업/배너가 이 형태로 연결된다.
  const promoFromLink = searchParams.get("promo")?.trim() ?? "";

  // ── 자동 적용 프로모션 (2026-07-16) ──
  // 링크 코드가 없어도 기본 프로모션(얼리버드)을 모든 방문자에게 적용한다.
  // 입력칸(promoCode)과는 분리된 상태를 쓴다 — 자동 코드가 소진·비활성이어도
  // 입력칸 검증 게이트에 걸려 가입이 막히는 일이 없게 (fail-open).
  const autoPromoCode = (promoFromLink || DEFAULT_SIGNUP_PROMO).toLowerCase();
  const [autoPromoStatus, setAutoPromoStatus] = useState<
    "none" | "checking" | "valid" | "closed"
  >(autoPromoCode ? "checking" : "none");
  const [autoPromoBonus, setAutoPromoBonus] = useState<number>(0);
  const [autoPromoDays, setAutoPromoDays] = useState<number | null>(null);
  const benefitName =
    autoPromoCode === "earlybird" ? "얼리버드 혜택" : "프로모션 혜택";

  // 진입 시 자동 프로모션이 아직 지급 가능한지 확인해 배너에 반영한다.
  useEffect(() => {
    if (!autoPromoCode) return;
    let cancelled = false;
    fetch("/api/auth/validate-promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: autoPromoCode }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((result) => {
        if (cancelled) return;
        if (result?.valid) {
          setAutoPromoBonus(
            typeof result.bonus_credits === "number" ? result.bonus_credits : 0
          );
          setAutoPromoDays(
            typeof result.validity_days === "number" ? result.validity_days : null
          );
          setAutoPromoStatus("valid");
        } else {
          setAutoPromoStatus("closed");
        }
      })
      .catch(() => {
        // 확인 실패 시 혜택을 약속하지 않는다 (지급은 서버가 알아서 시도)
        if (!cancelled) setAutoPromoStatus("closed");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleValidatePromo(codeOverride?: string) {
    const trimmed = (codeOverride ?? promoCode).trim();
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
        setPromoValidityDays(
          typeof result.validity_days === "number" ? result.validity_days : null
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

    if (!agreeTerms || !agreePrivacy) {
      setError("필수 약관에 동의해주세요.");
      return;
    }

    // 프로모션 코드를 입력했다면 [확인] 검증을 통과해야 가입 진행.
    // 서버는 코드 적용에 실패해도 가입 자체는 성공시키므로(보너스만 미지급),
    // 오타 코드가 아무 안내 없이 넘어가는 일을 여기서 막는다.
    // (코드를 수정하면 promoStatus가 idle로 리셋되어 재검증이 강제된다)
    if (promoCode.trim() && promoStatus !== "valid") {
      if (promoStatus === "invalid") {
        setError(
          "유효하지 않은 프로모션 코드입니다. 코드를 다시 확인하거나, 지운 뒤 가입해주세요."
        );
      } else if (promoStatus === "error") {
        setError(
          "프로모션 코드 확인에 실패했습니다. [확인]을 다시 눌러보거나, 코드를 지우고 가입 후 마이페이지에서 입력해주세요."
        );
      } else {
        setError("프로모션 코드 옆 [확인] 버튼을 눌러 코드를 먼저 확인해주세요.");
      }
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
          // 직접 입력한 코드가 우선, 없으면 자동 프로모션(서버도 같은 기본값을
          // 적용하므로 빈 값이어도 얼리버드는 누락되지 않는다)
          promo_code: promoCode.trim() || autoPromoCode,
          agreed_terms: agreeTerms,
          agreed_privacy: agreePrivacy,
          marketing_opt_in: agreeMarketing,
          consent_version: CONSENT_VERSION,
          // 가입 출처(M4) — 방문 시 저장해둔 first-touch UTM (없으면 직접 유입)
          ...(getStoredUtm() ?? {}),
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

      // 이메일 인증이 켜져 있으면 세션이 없다 → 메일 확인 안내로 전환
      if (result.needs_confirmation) {
        // LA-14: 폼 제출은 '가입 시작' 신호만. 가입 완료(verified_signup·
        // CompleteRegistration)는 인증 링크가 도착하는 /auth/login?confirmed=1 에서 집계한다.
        trackEvent("begin_registration", { method: "password" });
        metaPixelTrack("Lead");
        // 방금 첫 인증 메일이 발송됐으므로 재발송 쿨다운을 미리 걸어둔다
        startResendCooldown(email);
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

      // 가입 성공 → 자동 로그인 → 대시보드
      // (Confirm email이 꺼진 환경 — 인증 단계가 없으므로 시작·완료를 함께 집계)
      trackEvent("begin_registration", { method: "password" });
      trackEvent("verified_signup", { method: "password" });
      metaPixelTrack("Lead");
      metaPixelTrack("CompleteRegistration");
      naverWcsTrans({ type: "sign_up" });
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

        {/* 자동 프로모션 배너 — 모든 방문자에게 표시 (2026-07-16 자동 적용).
            마감 안내는 혜택 링크로 온 방문자에게만 보여준다 (조용한 fail-open —
            혜택을 본 적 없는 방문자에게 '마감' 문구는 혼란만 준다). */}
        {!confirmEmailSent &&
          autoPromoStatus !== "none" &&
          (autoPromoStatus !== "closed" || !!promoFromLink) && (
          <div
            className={`mb-5 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              autoPromoStatus === "closed"
                ? "bg-zinc-100 border-zinc-200 text-zinc-600"
                : "bg-violet-50 border-violet-200 text-violet-800"
            }`}
          >
            {autoPromoStatus === "valid" ? (
              <>
                🎁 {benefitName} 자동 적용 중 — 가입 후{" "}
                <strong>이메일 인증을 마치면</strong> 기본 {SIGNUP_FREE_CREDITS} +
                보너스 {autoPromoBonus} ={" "}
                <strong>총 {SIGNUP_FREE_CREDITS + autoPromoBonus}크레딧</strong>
                이 지급됩니다
                {autoPromoDays
                  ? ` (인증 완료 후 ${autoPromoDays}일간 사용 가능)`
                  : ""}
                .
                {benefitName === "얼리버드 혜택" && (
                  <span className="mt-1 block text-xs text-violet-600">
                    한정 인원 · 이메일 인증 완료 후 지급 · 1인 1회
                  </span>
                )}
              </>
            ) : autoPromoStatus === "closed" ? (
              <>
                아쉽지만 {benefitName}이 마감되었어요. 가입 시 기본 무료
                크레딧은 그대로 받을 수 있어요.
              </>
            ) : (
              <>🎁 {benefitName}을 확인하고 있어요…</>
            )}
          </div>
        )}

        {confirmEmailSent ? (
          /* 이메일 인증 안내 (Confirm email 활성 시) */
          <div className="card rounded-xl p-8 shadow-sm text-center">
            <div className="text-4xl mb-4" aria-hidden>
              📮
            </div>
            <h2 className="text-lg font-bold text-zinc-900 mb-2">
              확인 메일을 보냈어요
            </h2>
            <p className="text-sm text-zinc-600 leading-relaxed mb-1">
              <strong className="text-zinc-900">{email}</strong> 주소로 보낸
              메일의 인증 링크를 누르면 가입이 완료됩니다.
            </p>
            {(promoStatus === "valid" || autoPromoStatus === "valid") && (
              <p className="text-sm text-violet-700 leading-relaxed mb-1">
                🎁 인증을 마치고 로그인하면{" "}
                {promoStatus === "valid" ? "프로모션" : benefitName} 크레딧이
                자동으로 지급됩니다.
              </p>
            )}
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              메일이 안 보이면 스팸함을 확인해주세요. 이미 가입된 이메일이라면
              메일이 오지 않을 수 있어요 — 바로 로그인해 보세요.
            </p>
            <div className="mb-6 flex justify-center">
              <ResendConfirmationMail email={email} />
            </div>
            <a
              href="/auth/login"
              className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
            >
              로그인 페이지로
            </a>
          </div>
        ) : (
        /* Form Card */
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
                  className="flex-1 min-w-0 px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => handleValidatePromo()}
                  disabled={!promoCode.trim() || promoStatus === "checking"}
                  className="shrink-0 px-4 py-3 rounded-lg border border-zinc-300 text-zinc-600 text-sm hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  확인
                </button>
              </div>
              {promoStatus === "idle" && (
                <p className="mt-1.5 text-xs text-zinc-500">
                  {autoPromoStatus === "valid"
                    ? `${benefitName}은 자동 적용돼요 — 다른 코드가 있을 때만 입력하세요.`
                    : "프로모션 코드를 입력하면 추가 크레딧을 받을 수 있습니다."}
                </p>
              )}
              {promoStatus === "checking" && (
                <p className="mt-1.5 text-xs text-zinc-500">확인 중...</p>
              )}
              {promoStatus === "valid" && (
                <p className="mt-1.5 text-xs text-emerald-600">
                  ✓ 사용 가능한 코드입니다. 이메일 인증을 마치면{" "}
                  {SIGNUP_FREE_CREDITS}+{promoBonusCredits}크레딧이 지급됩니다
                  {promoValidityDays
                    ? ` (인증 완료 후 ${promoValidityDays}일간 사용 가능)`
                    : ""}
                  .
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

            {/* 약관 동의 (이용약관 / 개인정보 수집·이용을 각각 구분하여 받음) */}
            <div className="space-y-2.5 rounded-lg border border-zinc-200 p-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="agree-terms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                />
                <label htmlFor="agree-terms" className="text-xs text-zinc-600 leading-relaxed cursor-pointer">
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
                  id="agree-privacy"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                />
                <label htmlFor="agree-privacy" className="text-xs text-zinc-600 leading-relaxed cursor-pointer">
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
                  id="agree-marketing"
                  checked={agreeMarketing}
                  onChange={(e) => setAgreeMarketing(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                />
                <label
                  htmlFor="agree-marketing"
                  className="text-xs text-zinc-600 leading-relaxed cursor-pointer"
                >
                  <span className="text-zinc-400">(선택)</span>{" "}
                  <span className="font-medium text-zinc-700">
                    광고성 정보 수신 동의(이메일)
                  </span>{" "}
                  — 무료 크레딧이 사라지기 전 만료 알림과 시작 가이드, 할인
                  소식을 보내드려요. 마이페이지에서 언제든 끌 수 있어요.
                </label>
              </div>
              {/* 받는 메일 전부 공개 — 자동 메일이 3종뿐인 지금만 쓸 수 있는 신뢰 카드.
                  메일 종류·발송 정책이 바뀌면 이 목록도 반드시 함께 갱신할 것.
                  "7일 전" 같은 확정 시점은 쓰지 않는다(환영 메일 중복 방지로 생략되는 케이스 존재). */}
              <div className="ml-7 rounded-lg bg-zinc-50 border border-zinc-100 px-3.5 py-3">
                <p className="text-[11px] font-medium text-zinc-500 mb-1.5">
                  이 동의로 받는 메일은 지금 이게 전부예요
                </p>
                <ul className="space-y-1 text-[11px] text-zinc-500 leading-relaxed">
                  <li className="flex gap-1.5">
                    <span className="text-[var(--accent)]">·</span>
                    환영 메일 1통 — 지급된 크레딧과 만료일, 첫 변환 가이드
                  </li>
                  <li className="flex gap-1.5">
                    <span className="text-[var(--accent)]">·</span>
                    만료 전 미리 알림 — 안 쓴 크레딧이 사라지기 전에
                  </li>
                  <li className="flex gap-1.5">
                    <span className="text-[var(--accent)]">·</span>
                    할인·이벤트 소식 — 생기면 가끔
                  </li>
                </ul>
                <p className="mt-1.5 text-[11px] text-zinc-400">
                  모든 메일 하단에서 언제든 수신거부할 수 있어요.
                </p>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !agreeTerms || !agreePrivacy}
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
        )}

        {/* Benefits */}
        {!confirmEmailSent && (
          <div className="mt-6 text-center text-xs text-zinc-500">
            가입 시 무료 체험 크레딧 5회가 제공됩니다 (유효기간 7일)
          </div>
        )}
      </div>
    </div>
  );
}
