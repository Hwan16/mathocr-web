"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { metaPixelTrack } from "@/lib/meta-pixel";
import { getStoredUtm } from "@/lib/utm";

// ── 얼리버드 사전 신청 페이지 (0015 — 신청제, 2026-07-11 사용자 결정) ──
// 회원가입이 아니다: 이메일만 남기면 오픈 날 30문제 무료 코드를 메일로 보낸다.
// (오픈 전에 크레딧을 즉시 뿌리지 않기 위한 구조 — 코드는 오픈까지 비활성 보관)
// 선착순 200명. 마감되면 서버(GET /api/earlybird/apply)가 알려줘 자동 마감 화면 전환.
//
// 결제 오픈 날: SERVICE_OPENED = true 로 바꿔 배포하면 "오픈했어요 → 가입" 안내로 전환.
const SERVICE_OPENED = false;

export default function EarlybirdPage() {
  const [status, setStatus] = useState<"checking" | "open" | "closed">(
    "checking"
  );
  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      // ?preview=1 은 디자인 확인용 강제 오픈 (실제 접수 가능 여부는 서버가 판단)
      if (new URLSearchParams(window.location.search).get("preview") === "1") {
        setStatus("open");
        return;
      }
      try {
        const res = await fetch("/api/earlybird/apply");
        const r = await res.json().catch(() => ({}));
        if (!cancelled) setStatus(res.ok && r.open ? "open" : "closed");
      } catch {
        // 상태 확인 실패 시에도 폼은 연다 (마감 여부는 신청 시 서버가 최종 판단)
        if (!cancelled) setStatus("open");
      }
    }
    check();
    trackEvent("earlybird_page_view");
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!agree) {
      setError("오픈 안내 메일 수신에 동의해주세요 — 코드가 메일로 발송되기 때문이에요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/earlybird/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          agreed_marketing: true,
          // 가입 출처(M4) — 방문 시 저장해둔 first-touch UTM
          ...(getStoredUtm() ?? {}),
        }),
      });
      const r = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (r.error === "already") {
          setNotice(r.message ?? "이미 신청된 이메일입니다.");
          return;
        }
        if (r.error === "full") {
          setStatus("closed");
          return;
        }
        setError(r.message ?? r.error ?? "신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }

      trackEvent("earlybird_apply", { method: "email" });
      metaPixelTrack("Lead");
      setDone(true);
    } catch {
      setError("신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-zinc-50">
      <div className="w-full max-w-[440px]">
        <div className="card rounded-2xl shadow-sm overflow-hidden">
          {/* 히어로: 마스코트 — contain으로 전신 노출, 배경은 이미지 그라데이션과 맞춤 */}
          <div className="relative bg-gradient-to-b from-[#eae1fc] to-white">
            <img
              src="/earlybird-mascot.webp"
              alt="AI MathOCR 마스코트"
              className="w-full h-48 object-contain"
            />
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white" />
            <span className="absolute top-3 left-3 text-[11px] font-semibold tracking-widest bg-violet-600 text-white rounded-full px-3 py-1">
              EARLY BIRD · 선착순 200명
            </span>
          </div>

          {SERVICE_OPENED ? (
            /* 오픈 후: 신청 대신 가입 안내 */
            <div className="px-7 pb-8 pt-2 text-center">
              <h1 className="text-xl font-bold text-zinc-900 mb-2">
                AI MathOCR이 정식 오픈했어요
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed mb-6">
                얼리버드 신청은 종료되었습니다. 지금 가입하면 무료 체험
                5문제로 바로 시작할 수 있어요.
              </p>
              <a
                href="/auth/signup"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
              >
                회원가입하고 시작하기
              </a>
            </div>
          ) : done ? (
            /* 신청 완료 */
            <div className="px-7 pb-8 pt-2 text-center">
              <div className="text-4xl mb-3" aria-hidden>
                🎉
              </div>
              <h1 className="text-lg font-bold text-zinc-900 mb-2">
                얼리버드 신청 완료!
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed">
                정식 오픈 날 <strong className="text-zinc-900">{email}</strong>{" "}
                주소로
                <br />
                <strong className="text-violet-700">
                  총 30문제 무료 코드
                </strong>
                를 보내드릴게요.
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed mt-3 mb-6">
                메일이 스팸함으로 가지 않도록 noreply@mathocr.ai.kr 을
                주소록에 추가해두시면 좋아요.
              </p>
              <a
                href="/"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
              >
                홈으로
              </a>
            </div>
          ) : status === "closed" ? (
            /* 선착순 마감 */
            <div className="px-7 pb-8 pt-2 text-center">
              <h1 className="text-xl font-bold text-zinc-900 mb-2">
                얼리버드 신청이 마감되었어요
              </h1>
              <p className="text-sm text-zinc-600 leading-relaxed mb-6">
                선착순 200명이 모두 찼습니다. 정식 오픈 후에도 가입 시{" "}
                <b>무료 체험 5문제</b>는 받을 수 있어요.
              </p>
              <a
                href="/"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-sm"
              >
                홈으로
              </a>
            </div>
          ) : (
            /* 신청 폼 */
            <div className="px-7 pb-7 pt-1">
              <h1 className="text-xl font-bold text-zinc-900 leading-snug">
                얼리버드 신청하면{" "}
                <span className="text-violet-700">30문제 무료!</span>
              </h1>
              <p className="mt-2.5 text-sm text-zinc-600 leading-relaxed">
                7월 중 정식 오픈 예정이에요.
                <br />
                이메일을 남겨주시면, 정식 오픈날 프로모션 코드를 보내드려요.
              </p>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    이메일
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="코드를 받을 이메일 주소"
                    required
                    className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-border)] transition-colors"
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-zinc-200 p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="eb-agree"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-zinc-300 accent-[var(--accent)] cursor-pointer shrink-0"
                    />
                    <label
                      htmlFor="eb-agree"
                      className="text-xs text-zinc-600 leading-relaxed cursor-pointer"
                    >
                      <span className="text-zinc-400">(필수)</span> 오픈·혜택
                      안내 메일 수신과 이를 위한 개인정보 수집·이용에
                      동의합니다.
                    </label>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed pl-7">
                    수집 항목: 이메일 · 목적: 얼리버드 오픈 안내 / 혜택 지급 ·
                    보유: 안내 완료 또는 동의 철회 시까지 · 수신거부: 메일 하단
                    링크로 언제든 가능
                  </p>
                </div>

                {error && <p className="text-red-600 text-sm">{error}</p>}
                {notice && <p className="text-emerald-700 text-sm">{notice}</p>}

                <button
                  type="submit"
                  disabled={loading || !agree}
                  className="w-full btn-primary py-3 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "신청 중..." : "선착순 얼리버드 신청하기"}
                </button>
              </form>

              <p className="mt-3 text-[11px] text-zinc-400 leading-relaxed">
                코드는 1인 1회 사용 가능하며, 이메일 변형 등 중복 신청은
                하나로 처리됩니다.
              </p>
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
