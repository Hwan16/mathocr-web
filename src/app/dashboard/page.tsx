"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import ExpiryConsentBanner from "@/components/ExpiryConsentBanner";

interface Profile {
  credits: number;
  expires_at: string | null;
  role: string;
  marketing_opt_in: boolean | null;
}

interface Conversion {
  id: string;
  pdf_name: string | null;
  problem_count: number;
  solution_count?: number; // 해설 수(0005 마이그레이션 이후). 없으면 0으로 간주.
  credits_used: number;
  refunded_credits: number;
  status: string;
  created_at: string;
}

// 로그인 직후 프로모션 지급 결과 1회성 안내 (login/page.tsx가 sessionStorage에 기록)
type PromoNotice =
  | { type: "applied"; credits: number }
  | { type: "exhausted" }
  | { type: "ip_limit" };

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [totalConversions, setTotalConversions] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [promoNotice, setPromoNotice] = useState<PromoNotice | null>(null);
  const [consentHighlight, setConsentHighlight] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const limit = 10;

  // 프로모션 지급 결과 배너 — 읽는 즉시 지워 새로고침 시 반복 표시하지 않는다
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("mathocr_promo_notice");
      if (raw) {
        sessionStorage.removeItem("mathocr_promo_notice");
        setPromoNotice(JSON.parse(raw));
      }
    } catch {
      // 파싱·접근 실패 시 배너 없이 진행
    }
  }, []);

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setUser(user);

    // 프로필
    const { data: profileData } = await supabase
      .from("profiles")
      .select("credits, expires_at, role, marketing_opt_in")
      .eq("id", user.id)
      .single();
    setProfile(profileData);

    // 변환 이력
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data: convData, count } = await supabase
      .from("conversions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    setConversions(convData ?? []);
    setTotalConversions(count ?? 0);
    setLoading(false);
  }, [page, supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isExpired =
    profile?.expires_at && new Date(profile.expires_at) < new Date();
  const totalPages = Math.ceil(totalConversions / limit);

  // 만료 임박(7일 이내) + 크레딧 보유 + 마케팅 수신 미동의 → 동의 권유 배너.
  // 프로모션 지급 배너와 같은 화면에 겹치지 않게 한다 ("한 화면에 권유 1개").
  const showExpiryConsentBanner =
    !promoNotice &&
    profile != null &&
    profile.marketing_opt_in !== true &&
    (profile.credits ?? 0) > 0 &&
    profile.expires_at != null &&
    !isExpired &&
    new Date(profile.expires_at).getTime() - Date.now() <=
      7 * 24 * 60 * 60 * 1000;

  // 잔액 카드의 "만료 알림 메일 꺼짐 → 켜기" 클릭 시: 실제 동의 지점(계정
  // 설정의 토글 — 광고성 수신 동의 설명이 있는 곳)으로 스크롤 + 잠깐 강조.
  // 여기서 바로 동의 처리하지 않는 이유: 동의는 설명을 읽은 지점에서 받는다.
  function focusConsentRow() {
    document
      .getElementById("marketing-consent-setting")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setConsentHighlight(true);
    setTimeout(() => setConsentHighlight(false), 2000);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={36} height={36} />
            <span className="text-lg font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-600">{user?.email}</span>
            {profile?.role === "admin" && (
              <a
                href="/admin"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                관리자
              </a>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">마이페이지</h1>

        {/* 프로모션 지급 결과 안내 (로그인 직후 1회) */}
        {promoNotice && (
          <div
            className={`mb-6 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${
              promoNotice.type === "applied"
                ? "bg-violet-50 border-violet-200 text-violet-800"
                : "bg-zinc-50 border-zinc-200 text-zinc-600"
            }`}
          >
            <span>
              {promoNotice.type === "applied" ? (
                <>
                  🎉 프로모션 보너스 <strong>{promoNotice.credits}크레딧</strong>이
                  지급되었습니다. 잔여 크레딧에 반영되어 있어요.
                </>
              ) : promoNotice.type === "exhausted" ? (
                <>
                  아쉽지만 프로모션 선착순이 마감되어 보너스는 지급되지
                  않았어요. 가입 기본 크레딧은 정상 지급되었습니다.
                </>
              ) : (
                <>
                  같은 네트워크(IP)에서 이미 지급된 이력이 있어 보너스가 아직
                  지급되지 않았어요. 24시간이 지난 뒤 다시 로그인하면 자동으로
                  재시도됩니다.
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => setPromoNotice(null)}
              className="shrink-0 text-zinc-400 hover:text-zinc-600"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        )}

        {/* 만료 임박 × 미동의 → 만료 알림 켜기 권유 (1회, 닫으면 같은 만료건 재노출 없음) */}
        {showExpiryConsentBanner && profile?.expires_at && (
          <ExpiryConsentBanner
            credits={profile.credits}
            expiresAt={profile.expires_at}
            onConsented={loadData}
          />
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* 크레딧 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">잔여 크레딧</div>
            <div className="text-3xl font-bold text-[var(--accent)]">
              {profile?.credits ?? 0}
              <span className="text-base font-normal text-zinc-500 ml-1">
                회
              </span>
            </div>
            {/* 미동의자 전용 상시 상태 표시 — 배너를 닫은 사용자를 위한 잔류 경로.
                동의 처리는 계정 설정 토글에서만 한다(설명을 읽는 지점에서 동의). */}
            {profile?.marketing_opt_in !== true && (
              <button
                type="button"
                onClick={focusConsentRow}
                className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 transition-colors group"
              >
                <svg
                  aria-hidden
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
                  <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
                  <path d="M18 8a6 6 0 0 0-9.33-5" />
                  <path d="m1 1 22 22" />
                </svg>
                <span>만료 알림 메일 꺼짐</span>
                <span className="font-medium text-[var(--accent)] group-hover:underline">
                  켜기
                </span>
              </button>
            )}
          </div>

          {/* 유효기간 — 정상: 파란색 / 만료: 빨간 볼드 + 배지 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">유효기간</div>
            <div
              className={`text-xl ${
                isExpired
                  ? "font-bold text-red-600"
                  : profile?.expires_at
                    ? "font-semibold text-blue-600"
                    : "font-semibold text-zinc-900"
              }`}
            >
              {profile?.expires_at
                ? new Date(profile.expires_at).toLocaleDateString("ko-KR")
                : "무제한"}
              {isExpired && (
                <span className="ml-2 inline-block align-middle rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  만료됨
                </span>
              )}
            </div>
          </div>

          {/* 총 변환 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">총 변환 횟수</div>
            <div className="text-3xl font-bold text-zinc-900">
              {totalConversions}
              <span className="text-base font-normal text-zinc-500 ml-1">
                건
              </span>
            </div>
          </div>
        </div>

        {/* 약관 개정 사전 공지 (약관 제10조의 서비스 내 공지) — 이용자에게 불리할 수
            있는 변경이라 눈에 띄는 위치(잔액/유효기간 카드 바로 아래)에 둔다. 상단
            배너와 경쟁하지 않게 배너가 아닌 한 줄 텍스트로.
            시행일(2026-08-21)이 지나면 삭제. */}
        <p className="mb-10 text-sm text-zinc-600">
          2026년 8월 21일부터 서비스 이용약관이 일부 개정됩니다 —{" "}
          <a
            href="/terms"
            className="text-[var(--accent)] underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            자세히 보기
          </a>
        </p>

        {/* Promo Code */}
        <PromoRedeemCard onRedeemed={loadData} />

        {/* Conversion History */}
        <div className="bezel-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold">변환 이력</h2>
          </div>

          {conversions.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-500">
              아직 변환 이력이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                    <th className="px-6 py-3 font-medium">날짜</th>
                    <th className="px-6 py-3 font-medium">시험지명</th>
                    <th className="px-6 py-3 font-medium text-center">
                      문제(해설) 수
                    </th>
                    <th className="px-6 py-3 font-medium text-center">
                      크레딧
                    </th>
                    <th className="px-6 py-3 font-medium text-center">반환</th>
                    <th className="px-6 py-3 font-medium text-center">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-zinc-50"
                    >
                      <td className="px-6 py-3 text-zinc-600">
                        {new Date(c.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-6 py-3 text-zinc-800">
                        {c.pdf_name || "—"}
                      </td>
                      <td className="px-6 py-3 text-center text-zinc-700">
                        {c.problem_count}
                        {(c.solution_count ?? 0) > 0 && (
                          <span className="text-zinc-400">(+{c.solution_count})</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {c.credits_used > 0 ? (
                          <span className="text-red-600 font-medium">
                            -{c.credits_used}
                          </span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {c.refunded_credits > 0 ? (
                          <span
                            className="text-emerald-600 font-medium"
                            title="변환에 실패한 문제만큼 자동 반환된 크레딧입니다."
                          >
                            +{c.refunded_credits}
                          </span>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                {totalConversions}건 중 {(page - 1) * limit + 1}–
                {Math.min(page * limit, totalConversions)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 hover:text-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Credit Grant History */}
        <CreditHistoryCard />

        {/* Account Settings */}
        <div className="bezel-card rounded-2xl p-6 mt-10">
          <h2 className="text-lg font-semibold mb-1">계정 설정</h2>
          <div className="divide-y divide-[var(--border-subtle)]">
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-800">
                  비밀번호 변경
                </div>
                <p className="text-sm text-zinc-500">
                  가입 이메일로 비밀번호 재설정 링크를 보내드립니다.
                </p>
              </div>
              <a
                href="/auth/reset-password"
                className="shrink-0 px-4 py-2 rounded-xl text-sm border border-[var(--border-light)] text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                변경하기
              </a>
            </div>
            {profile && (
              <div id="marketing-consent-setting">
                {/* 하이라이트는 안쪽 레이어에 — 바깥 div는 divide-y 구분선 폭을
                    형제 행과 동일하게 유지한다 */}
                <div
                  className={`rounded-xl px-3 -mx-3 transition-all duration-500 ${
                    consentHighlight
                      ? "ring-2 ring-[var(--accent)] ring-offset-2 bg-[var(--accent-soft)]"
                      : ""
                  }`}
                >
                  {/* key: 배너에서 동의 후 loadData로 profile이 갱신되면 토글도
                      새 값으로 다시 마운트되게 한다 (내부 state 초기값 고정 문제) */}
                  <MarketingConsentRow
                    key={String(profile.marketing_opt_in)}
                    initialOptIn={profile.marketing_opt_in === true}
                  />
                </div>
              </div>
            )}
            <div className="py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-zinc-800">
                  회원 탈퇴
                </div>
                <p className="text-sm text-zinc-500">
                  계정과 이용 데이터가 삭제되며, 잔여 크레딧은 복구할 수
                  없습니다.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="shrink-0 px-4 py-2 rounded-xl text-sm border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                탈퇴하기
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeleteModal && user?.email && (
        <DeleteAccountModal
          email={user.email}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

// 마케팅 수신 설정 토글 (LA-09) — /api/account/marketing-consent가
// profiles.marketing_opt_in 갱신 + user_consents 동의/철회 감사 기록을 함께 처리.
function MarketingConsentRow({ initialOptIn }: { initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    if (saving) return;
    const next = !optIn;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/account/marketing-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opt_in: next }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setOptIn(result.opt_in === true);
      } else {
        setError(result.error ?? "설정 변경에 실패했습니다.");
      }
    } catch {
      setError("설정 변경에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="py-4 flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium text-zinc-800">
          할인·혜택 소식 메일 받기
        </div>
        {/* "광고성 정보 수신 동의" 명칭은 법정 표기(KISA 안내서) — 삭제 금지.
            발송 판정은 크레딧이 아니라 계정 단위다 — expiry-reminder의 decideKind는
            payments(status=completed·amount>0) 이력이 있는 계정에만 비동의 상태로
            중립형 만료 안내를 보낸다. 유료 이력이 없는 계정의 만료 알림은 KISA
            해석상 광고성이라 동의자에게만 발송된다. "필수 안내는 관계없이 발송" 식
            안내나 "무료 크레딧" 단위 서술은 사실과 달라 쓰지 않는다
            (약관 개정안·수신거부 안내와 같은 계정 단위 표현으로 유지할 것). */}
        <p className="text-sm text-zinc-500">
          광고성 정보 수신 동의(이메일)입니다. 만료 전 미리 알림·시작
          가이드·할인 소식을 보내드려요 — 유료 결제 이력이 없는 계정의 만료
          알림은 이 동의가 있어야 보내드릴 수 있어요.
        </p>
        {error && <p className="mt-1 text-sm text-red-600">✗ {error}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={optIn}
        aria-label="할인·혜택 소식 메일 받기"
        onClick={handleToggle}
        disabled={saving}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
          optIn ? "bg-[var(--accent)]" : "bg-zinc-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            optIn ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function DeleteAccountModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const supabase = createClient();

  const emailMatches =
    confirmEmail.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!emailMatches || status === "submitting") return;
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok && result.success) {
        // 서버에서 계정이 이미 삭제됨 — 브라우저에 남은 세션만 정리
        await supabase.auth.signOut({ scope: "local" });
        setStatus("done");
      } else {
        setStatus("error");
        setMessage(result.error ?? "탈퇴 처리에 실패했습니다.");
      }
    } catch {
      setStatus("error");
      setMessage("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  if (status === "done") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
        <div className="bezel-card w-full max-w-md rounded-2xl bg-white p-6 text-center">
          <h2 className="text-lg font-semibold mb-2">탈퇴가 완료되었습니다</h2>
          <p className="text-sm text-zinc-500 mb-6">
            그동안 AI MathOCR를 이용해주셔서 감사합니다.
          </p>
          <a
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            홈으로
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bezel-card w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-lg font-semibold mb-3">정말 탈퇴하시겠어요?</h2>
        <ul className="text-sm text-zinc-600 space-y-2 mb-5 list-disc pl-5">
          <li>
            <span className="font-medium text-red-600">
              잔여 크레딧은 즉시 소멸
            </span>
            되며 복구할 수 없습니다. 환불 대상 크레딧이 있다면 탈퇴 전에{" "}
            <a
              href="mailto:aimathocr.official@gmail.com"
              className="underline"
            >
              aimathocr.official@gmail.com
            </a>
            으로 문의해주세요.
          </li>
          <li>변환 이력 등 계정 정보가 모두 삭제됩니다.</li>
          <li>
            결제·동의 기록은 전자상거래법에 따라 5년간 보존 후 파기됩니다.
          </li>
        </ul>
        <label className="block text-sm text-zinc-600 mb-2">
          확인을 위해 가입 이메일{" "}
          <span className="font-medium text-zinc-900">{email}</span> 을
          입력해주세요.
        </label>
        <input
          type="email"
          value={confirmEmail}
          onChange={(e) => {
            setConfirmEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          placeholder={email}
          className="w-full px-4 py-2.5 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-300 text-sm focus:outline-none focus:border-red-400 transition-colors"
        />
        {status === "error" && (
          <p className="mt-2 text-sm text-red-600">✗ {message}</p>
        )}
        <div className="mt-5 flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={status === "submitting"}
            className="px-4 py-2 rounded-xl text-sm border border-[var(--border-light)] text-zinc-600 hover:text-zinc-900 disabled:opacity-40 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleDelete}
            disabled={!emailMatches || status === "submitting"}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === "submitting" ? "처리 중..." : "탈퇴하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoRedeemCard({ onRedeemed }: { onRedeemed: () => void }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function handleRedeem() {
    const trimmed = code.trim();
    if (!trimmed || status === "submitting") return;

    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok && result.success) {
        setStatus("success");
        const expiryNote = result.expires_at
          ? ` · ${new Date(result.expires_at).toLocaleDateString("ko-KR")}까지 사용 가능`
          : "";
        setMessage(
          `+${result.credits_granted}크레딧이 지급되었습니다. (잔여 ${result.new_credits}회${expiryNote})`
        );
        setCode("");
        onRedeemed();
      } else {
        setStatus("error");
        setMessage(result.error ?? "코드 적용에 실패했습니다.");
      }
    } catch {
      setStatus("error");
      setMessage("코드 적용에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <div className="bezel-card rounded-2xl p-6 mb-10">
      <h2 className="text-lg font-semibold mb-1">프로모션 코드</h2>
      <p className="text-sm text-zinc-500 mb-4">
        프로모션 코드가 있다면 입력하고 크레딧을 받으세요.
      </p>
      <div className="flex gap-2 max-w-md">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRedeem();
          }}
          placeholder="코드 입력"
          className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
        <button
          onClick={handleRedeem}
          disabled={!code.trim() || status === "submitting"}
          className="shrink-0 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {status === "submitting" ? "적용 중..." : "적용"}
        </button>
      </div>
      {status === "success" && (
        <p className="mt-2 text-sm text-emerald-600">✓ {message}</p>
      )}
      {status === "error" && (
        <p className="mt-2 text-sm text-red-600">✗ {message}</p>
      )}
    </div>
  );
}

interface CreditEventRow {
  type: "purchase" | "promo" | "admin" | "signup" | "expiry";
  label: string;
  detail: string | null;
  delta: number;
  refunded: boolean;
  at: string;
}

// 크레딧 지급 내역 — 가입/프로모션/구매/운영자 지급/만료를 시간순으로 보여준다.
// 데이터 조립은 /api/credits/history 가 담당(기존 payments·promo 기록 + 합성 이벤트).
function CreditHistoryCard() {
  const [events, setEvents] = useState<CreditEventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/credits/history")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEvents(d?.events ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const shown = expanded ? events : events.slice(0, 8);

  return (
    <div className="bezel-card rounded-2xl overflow-hidden mt-10">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
        <h2 className="text-lg font-semibold">크레딧 지급 내역</h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          변환에 사용·반환된 크레딧은 위 변환 이력에서 확인할 수 있어요.
        </p>
      </div>
      {!loaded ? (
        <div className="px-6 py-8 text-center text-zinc-400 text-sm">
          불러오는 중…
        </div>
      ) : events.length === 0 ? (
        <div className="px-6 py-8 text-center text-zinc-500 text-sm">
          지급 내역이 없습니다.
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {shown.map((e, i) => (
              <li
                key={`${e.at}-${i}`}
                className="px-6 py-3 flex items-center justify-between gap-4 text-sm"
              >
                <div className="min-w-0">
                  <span className="text-zinc-800">{e.label}</span>
                  {e.detail && (
                    <span className="ml-2 text-zinc-400">{e.detail}</span>
                  )}
                  {e.refunded && (
                    <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600">
                      환불됨
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span
                    className={`font-medium ${
                      e.refunded
                        ? "text-zinc-300 line-through"
                        : e.delta >= 0
                          ? "text-emerald-600"
                          : "text-red-600"
                    }`}
                  >
                    {e.delta >= 0 ? `+${e.delta}` : e.delta}
                  </span>
                  <span className="text-zinc-400 text-xs w-24 text-right">
                    {new Date(e.at).toLocaleDateString("ko-KR")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {events.length > 8 && (
            <div className="px-6 py-3 border-t border-[var(--border-subtle)] text-center">
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                {expanded ? "접기" : `전체 보기 (${events.length}건)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    started: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    failed: "bg-red-500/10 text-red-600 border-red-500/20",
  };
  const labels: Record<string, string> = {
    completed: "완료",
    started: "진행 중",
    failed: "실패",
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${styles[status] ?? "text-zinc-600 border-zinc-700"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
