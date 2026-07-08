"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FAQS } from "@/lib/faqs";
import { FaqStructuredData } from "./structured-data";
import { PLANS, SIGNUP_FREE_CREDITS, SIGNUP_FREE_VALIDITY_DAYS, CREDIT_RULE } from "@/lib/plans";
import EarlyBirdPopup from "@/components/EarlyBirdPopup";

const DOWNLOAD_URL =
  "https://github.com/Hwan16/mathocr-web/releases/download/v1.9.1/MathOCR-Setup-v1.9.1.exe";
const DOWNLOAD_LABEL = "v1.9.1 (124MB)";

// 결제 오픈 게이트 — Vercel 환경변수에 NEXT_PUBLIC_PAYMENTS_ENABLED=true 를
// 넣기 전까지 구매 버튼은 기존 "곧 오픈" 안내를 유지한다.
const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

// 사업자 정보 (전자상거래법 제10조 표시 의무).
// 사업자등록·통신판매업 신고 완료 후 아래 값을 채우고 SHOW_BUSINESS_INFO 를
// true 로 바꾸면 푸터에 노출된다. (미등록 상태에서는 노출하지 않는다.)
const SHOW_BUSINESS_INFO = true;
const BUSINESS_INFO = {
  company: "환희에듀테크랩", // 상호
  ceo: "김기환", // 대표자명
  privacyOfficer: "김기환", // 개인정보 보호책임자
  bizRegNo: "880-61-00784", // 사업자등록번호
  mailOrderNo: "2026-인천연수구-1787", // 통신판매업 신고번호
  address: "인천광역시 연수구 송도문화로84번길 24, 206동 201호", // 사업장 주소
  phone: "010-4552-5994", // 전화번호
  email: "aimathocr.official@gmail.com",
};

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 구매 버튼 placeholder 안내(결제 연동 전). 클릭 시 잠깐 토스트로 안내한다.
  const [purchaseNotice, setPurchaseNotice] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  useEffect(() => {
    if (!purchaseNotice) return;
    const t = setTimeout(() => setPurchaseNotice(false), 5000);
    return () => clearTimeout(t);
  }, [purchaseNotice]);

  return (
    <>
      {/* ── 상단 네비게이션 (풀폭 sticky) ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-12 h-16 flex items-center gap-4 md:gap-10">
          <a href="/" className="flex items-center gap-2 md:gap-2.5 shrink-0">
            <img
              src="/mathocr-icon.png"
              alt="AI MathOCR"
              width={40}
              height={40}
              className="w-8 h-8 md:w-10 md:h-10"
            />
            <span className="text-lg md:text-xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-5 lg:gap-8 text-[15px] text-zinc-600 whitespace-nowrap">
            <a href="#features" onClick={() => trackEvent("nav_click", { label: "features" })} className="hover:text-zinc-900 transition-colors">기능</a>
            <a href="#showcase" onClick={() => trackEvent("nav_click", { label: "showcase" })} className="hover:text-zinc-900 transition-colors">변환 결과</a>
            <a href="#guide" onClick={() => trackEvent("nav_click", { label: "guide" })} className="hover:text-zinc-900 transition-colors">사용법</a>
            <a href="#pricing" onClick={() => trackEvent("nav_click", { label: "pricing" })} className="hover:text-zinc-900 transition-colors">가격</a>
            <a href="#download" onClick={() => trackEvent("nav_click", { label: "download" })} className="hover:text-zinc-900 transition-colors">다운로드</a>
          </nav>

          <div className="flex items-center gap-2 md:gap-3 ml-auto shrink-0">
            {/* PC 전용 기능이라 모바일(md 미만)에서는 숨긴다 */}
            <a
              href="/report"
              onClick={() => trackEvent("nav_click", { label: "report_header" })}
              className="hidden lg:inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors whitespace-nowrap"
            >
              <span aria-hidden>⚠</span>
              변환이 안됐나요?
            </a>
            {isLoggedIn ? (
              <a href="/dashboard" className="btn-primary text-sm px-3.5 py-2 md:px-5 md:py-2.5 rounded-lg whitespace-nowrap">
                마이페이지
              </a>
            ) : (
              <>
                <a
                  href="/auth/login"
                  onClick={() => trackEvent("cta_click", { label: "login", location: "header" })}
                  className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors px-1.5 md:px-2 whitespace-nowrap"
                >
                  로그인
                </a>
                <a href="/auth/signup" onClick={() => trackEvent("cta_click", { label: "sign_up", location: "header" })} className="btn-primary text-sm px-3.5 py-2 md:px-5 md:py-2.5 rounded-lg whitespace-nowrap">
                  회원가입
                </a>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── 변환 실패 신고: 우하단 플로팅 버튼 (스크롤 따라다님, PC 전용이라 모바일 숨김) ── */}
      <a
        href="/report"
        onClick={() => trackEvent("nav_click", { label: "report_floating" })}
        className="fixed bottom-6 right-6 z-50 hidden md:inline-flex items-center gap-2 px-5 py-3.5 rounded-full bg-red-600 text-white text-sm font-semibold shadow-lg shadow-red-600/30 hover:bg-red-700 transition-colors"
      >
        <span aria-hidden>⚠</span> 변환이 안됐나요?
      </a>

      {/* ── Hero ── */}
      <section className="border-b border-zinc-200 bg-gradient-to-b from-[var(--accent-soft)] to-white">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid lg:grid-cols-[5fr_7fr] gap-12 lg:gap-16 items-center">
            {/* 좌: 카피 */}
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] bg-white border border-[var(--accent-border)] rounded-full px-4 py-1.5 mb-7">
                Windows 데스크톱 프로그램
              </div>

              <h1 className="text-4xl lg:text-[3.4rem] font-bold leading-[1.2] lg:leading-[1.18] mb-6 tracking-tight">
                수학문제 OCR,
                <br />
                PDF와 이미지를 편집 가능한 <span className="text-[var(--accent)]">HWP</span>로
              </h1>

              <p className="text-lg lg:text-xl text-zinc-600 leading-relaxed mb-9">
                수식이 이미지가 아닌 <strong className="text-zinc-900 font-semibold">한글 수식편집기 객체</strong>로
                변환됩니다. PDF는 물론 핸드폰으로 찍은 사진도 그대로 올릴 수
                있어, 시험지·교재 제작에 쓰는 수식 입력 시간이 문제당 몇 초로
                줄어듭니다.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="#download"
                  onClick={() => trackEvent("nav_click", { label: "download_hero" })}
                  className="btn-primary px-8 py-4 text-base rounded-lg text-center inline-flex items-center justify-center gap-2"
                >
                  <iconify-icon icon="solar:download-minimalistic-linear" width="20" />
                  무료로 다운로드
                </a>
                <a
                  href="#guide"
                  onClick={() => trackEvent("nav_click", { label: "guide_hero" })}
                  className="btn-outline px-8 py-4 text-base rounded-lg text-center"
                >
                  사용법 보기
                </a>
              </div>

              <p className="text-sm text-zinc-500 mt-5">
                Windows 10/11 전용 · 문제 속 그림은 크레딧 차감 없이
              </p>
            </div>

            {/* 우: 데스크톱 앱 화면 (실제 앱 v1.8 UI 반영 목업 — 계정 칩·해설 모드·플로팅 페이지 컨트롤)
                TODO: 실제 앱 스크린샷 확보 시 /public/guide/hero-app.png 로 교체 */}
            <div className="hidden sm:block">
              <div className="rounded-xl border border-zinc-300 bg-white shadow-[0_24px_64px_-16px_rgba(24,24,27,0.18)] overflow-hidden">
                {/* 타이틀바 */}
                <div className="flex items-center gap-2 px-4 h-9 bg-zinc-100 border-b border-zinc-200">
                  <img src="/mathocr-icon.png" alt="" width={16} height={16} />
                  <span className="text-[11px] text-zinc-600">
                    AI MathOCR — 수학문제 PDF/이미지 → HWP 변환
                  </span>
                  <div className="ml-auto flex gap-3 text-zinc-400 text-[10px]">
                    <span>─</span><span>□</span><span>✕</span>
                  </div>
                </div>
                {/* 툴바: 파일 · 모드 토글(문제/그림/해설) · 설정 · 계정 칩 */}
                <div className="flex items-center gap-1.5 px-3 h-11 border-b border-zinc-200 bg-white overflow-hidden whitespace-nowrap">
                  <span className="px-2 py-1 border border-zinc-200 rounded-md text-[10px] text-zinc-600">파일 열기</span>
                  <span className="ml-1.5 px-2.5 py-1 rounded-lg bg-sky-500 text-white text-[10px] font-semibold">문제</span>
                  <span className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-500 text-[10px]">그림</span>
                  <span className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-500 text-[10px]">해설</span>
                  <span className="ml-1.5 px-2 py-1 border border-zinc-200 rounded-md text-[10px] text-zinc-600">설정</span>
                  {/* 계정 칩: 이메일 · 크레딧 pill · 유효기간 */}
                  <div className="ml-auto flex items-center gap-1.5 bg-zinc-100 rounded-full pl-2.5 pr-1.5 py-[3px]">
                    <span className="text-[10px] font-medium text-zinc-700">teacher@naver.com</span>
                    <span className="text-[10px] bg-[var(--accent)] text-white font-semibold rounded-full px-2 py-[1px]">크레딧 105</span>
                    <span className="hidden min-[700px]:max-lg:inline min-[1200px]:inline text-[10px] text-zinc-500 pr-1">유효기간: 2026. 08. 05 (D-28)</span>
                  </div>
                </div>
                {/* 본문: PDF 뷰 + 우측 패널 */}
                <div className="grid grid-cols-[7fr_3fr] min-h-[380px]">
                  <div className="relative p-5 pb-14 bg-zinc-100/70 border-r border-zinc-200">
                    <div className="bg-white border border-zinc-200 p-5 h-full shadow-sm">
                      {/* 문제 영역 박스 (파랑·직각) */}
                      <div className="border-2 border-sky-500 p-3 mb-4 relative">
                        <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5">1</span>
                        <p className="text-[12px] text-zinc-700 leading-relaxed">
                          1. 양의 실수 <em>x</em>에 대하여 √x = ½(1−a) 일 때,
                          √(x+a) − √(x−a+2) 의 값을 구하시오.
                        </p>
                      </div>
                      {/* 문제+그림 영역 */}
                      <div className="border-2 border-sky-500 p-3 relative">
                        <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5">2</span>
                        <p className="text-[12px] text-zinc-700 leading-relaxed mb-2">
                          2. 함수 y = f(x)의 그래프가 그림과 같을 때,
                        </p>
                        <div className="border-2 border-emerald-500 h-16 flex items-center justify-center relative">
                          <span className="absolute -top-2.5 left-2 bg-emerald-500 text-white text-[10px] px-1.5">그림</span>
                          <svg width="72" height="44" viewBox="0 0 72 44" className="text-zinc-400">
                            <path d="M4 40 L4 4 M4 40 L68 40" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            <path d="M8 36 Q28 4 48 22 T68 10" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    {/* 플로팅 뷰어 컨트롤: 페이지 네비 + 줌 (실제 앱은 뷰어 하단 중앙 알약) */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white border border-zinc-200 rounded-full px-3.5 py-1.5 shadow-sm text-[10px] text-zinc-500 whitespace-nowrap">
                      <span className="text-zinc-300">◀</span>
                      <span className="font-semibold text-zinc-800">1</span>
                      <span className="text-zinc-400">/ 12</span>
                      <span>▶</span>
                      <span className="text-zinc-200">│</span>
                      <span className="relative inline-block w-14 h-[3px] bg-zinc-200 rounded-full">
                        <span className="absolute left-[18%] -top-[4px] w-[11px] h-[11px] bg-[var(--accent)] rounded-full" />
                      </span>
                      <span>100%</span>
                      <span className="px-1.5 py-0.5 border border-zinc-200 rounded-md text-zinc-600">맞춤</span>
                    </div>
                  </div>
                  {/* 우측 패널: 시험지명 · 요약 · 문항/그림/답안/해설 표 */}
                  <div className="p-3.5 bg-white flex flex-col">
                    <div className="border border-zinc-200 rounded-md px-3 py-2 text-[11px] text-zinc-400">
                      시험지 명 입력 (선택)
                    </div>
                    <div className="text-[10px] text-zinc-500 px-1 mt-2.5 mb-1">문제 2 · 해설 2</div>
                    <div className="grid grid-cols-[30px_30px_1fr_34px] text-[10px] text-zinc-400 text-center px-1 pb-1.5">
                      <span>문항</span><span>그림</span><span>답안</span><span>해설</span>
                    </div>
                    {[
                      ["1", "", "12", "해1"],
                      ["2", "✓", "③", "해2"],
                    ].map(([n, fig, a, sol], i) => (
                      <div
                        key={n}
                        className={`grid grid-cols-[30px_30px_1fr_34px] text-[11px] text-center border-t border-zinc-100 px-1 py-1.5 ${i % 2 ? "bg-zinc-50" : ""}`}
                      >
                        <span className="text-sky-600 font-medium">{n}</span>
                        <span className="text-emerald-600">{fig}</span>
                        <span className="text-zinc-700">{a}</span>
                        <span className="text-[var(--accent)]">{sol}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1.5 mt-auto pt-2.5 text-[10px] text-zinc-500">
                      <span className="px-2 py-1 border border-zinc-200 rounded-md">▲</span>
                      <span className="px-2 py-1 border border-zinc-200 rounded-md">▼</span>
                      <span className="ml-auto px-2 py-1 border border-zinc-200 rounded-md">삭제</span>
                    </div>
                    <div className="mt-2.5 btn-primary rounded-md text-center text-[12px] py-2.5">
                      변환하기
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 핵심 사실 스트립 ── */}
      <section className="border-b border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              ["수식편집기 객체", "이미지가 아닌 편집 가능한 한글 수식"],
              ["AI 교차 검증", "프론티어 AI가 인식부터 구조까지 검증"],
              ["그림은 무료", "문제 속 그래프·도형은 크레딧 차감 없이"],
              ["필요한 만큼 충전", "월 구독 없이 · 크레딧당 최저 140원"],
            ].map(([title, desc]) => (
              <div key={title}>
                <div className="font-semibold text-zinc-900 mb-1">{title}</div>
                <div className="text-sm text-zinc-500 leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 기능 ── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">기능</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              지저분한 원본도, 편집 가능한 HWP 시험지로
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              수학문제 OCR의 품질은 원본 처리에서 갈립니다. AI가 원문만 골라
              복원하고, 문제·그림·해설 영역을 원하는 대로 지정해 완성된
              HWP로 만들어 드립니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                title: "더러운 원본도, 깔끔한 문제만",
                desc: "스캔 얼룩·인쇄 잡티·회색 배경이 있어도 프론티어 AI가 원문 수식과 텍스트만 골라 복원합니다. 그림 배경의 음영은 자동으로 흰색 처리하고, 인식을 방해하는 요소는 걸러냅니다.",
              },
              {
                title: "문제·그림·해설 영역을 내 마음대로",
                desc: "드래그로 문제 영역을, [그림] 모드로 그래프·도형 영역을 따로 지정하세요. 영역 크기까지 자유롭게 조절되고, 문제 속 그림은 크레딧 차감 없이 원본 그대로 함께 담깁니다.",
              },
              {
                title: "문제뿐 아니라 해설·정답까지",
                desc: "해설 영역을 지정하면 정답과 풀이 과정도 함께 변환됩니다. 정답은 미주로 문제와 자동 연결돼, 시험지와 해설지를 한 번에 완성할 수 있습니다.",
              },
              {
                title: "진짜 한글 수식편집기 객체",
                desc: "분수·루트·적분·시그마·극한·행렬·조건분기까지 21개 유형의 수식이 이미지가 아닌 편집 가능한 객체로 들어갑니다. 첨자 종속, 부등호(≤·≥·≠), 집합·각도(°) 표기까지 한국 중·고등학교 시험지 규칙에 맞춰 자동 교정하고, 더블클릭하면 바로 수정됩니다.",
              },
            ].map((f) => (
              <div key={f.title} className="card rounded-xl p-8">
                <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
                <p className="text-zinc-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 변환 결과 쇼케이스 (Before → After) ── */}
      <section id="showcase" className="py-20 lg:py-28 border-t border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">변환 결과</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              결과물로 보여드립니다
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              말로 하는 설명보다 실제 변환 결과가 정확합니다. 왼쪽이 원본,
              오른쪽이 AI MathOCR의 수학문제 OCR이 만든 HWP입니다.
            </p>
          </div>

          <div className="space-y-20">
            {/* 1. 연필 필기 자동 제거 */}
            <div>
              <h3 className="text-2xl font-bold mb-3">
                연필 필기 자국은 AI가 알아서 지웁니다
              </h3>
              <p className="text-zinc-600 leading-relaxed text-lg mb-7">
                필기·낙서·채점 자국은 걸러내고 <strong className="text-zinc-900 font-semibold">원래
                문제의 텍스트와 수식만 골라</strong> 깨끗한 HWP로 복원합니다.
              </p>
              <div className="grid md:grid-cols-2 gap-5 items-start">
                <figure className="card rounded-xl overflow-hidden">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-500">
                    <span className="w-2 h-2 rounded-full bg-zinc-300" aria-hidden />
                    원본
                  </figcaption>
                  <div className="p-5">
                    <img
                      src="/showcase/pencil-before.png"
                      alt="연필 필기가 가득한 수학 문제 사진"
                      className="w-full rounded-md"
                      loading="lazy"
                    />
                  </div>
                </figure>
                <figure className="card rounded-xl overflow-hidden !border-[var(--accent-border)]">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-[var(--accent-border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden />
                    변환된 HWP
                  </figcaption>
                  <div className="p-5">
                    <img
                      src="/showcase/pencil-after.png"
                      alt="필기가 제거되고 문제만 남은 HWP 변환 결과"
                      className="w-full rounded-md"
                      loading="lazy"
                    />
                  </div>
                </figure>
              </div>
            </div>

            {/* 2. 평가원 스타일 박스·보기 */}
            <div>
              <h3 className="text-2xl font-bold mb-3">
                조건 [박스]와 &lt;보기&gt;까지, 평가원 스타일 그대로
              </h3>
              <p className="text-zinc-600 leading-relaxed text-lg mb-7">
                (가)·(나) 조건 박스도, <strong className="text-zinc-900 font-semibold">&lt;보 기&gt; 라벨이
                윗선에 얹힌 모양</strong>도 실제 시험지 규격 그대로 재현됩니다.
              </p>
              {/* 조건 [박스] 쌍 */}
              <h4 className="text-lg font-bold text-zinc-800 mb-4">조건 [박스]</h4>
              <div className="grid md:grid-cols-2 gap-5 items-start mb-10">
                <figure className="card rounded-xl overflow-hidden">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-500">
                    <span className="w-2 h-2 rounded-full bg-zinc-300" aria-hidden />
                    원본
                  </figcaption>
                  <img
                    src="/showcase/box14-before.png"
                    alt="조건 박스가 포함된 수학 시험지 원본"
                    className="w-full"
                    loading="lazy"
                  />
                </figure>
                <figure className="card rounded-xl overflow-hidden !border-[var(--accent-border)]">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-[var(--accent-border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden />
                    변환된 HWP
                  </figcaption>
                  <img
                    src="/showcase/box14-after.png"
                    alt="조건 박스가 그대로 재현된 HWP 변환 결과"
                    className="w-full"
                    loading="lazy"
                  />
                </figure>
              </div>

              {/* <보기> 박스 쌍 */}
              <h4 className="text-lg font-bold text-zinc-800 mb-4">&lt;보기&gt; 박스</h4>
              <div className="grid md:grid-cols-2 gap-5 items-start">
                <figure className="card rounded-xl overflow-hidden">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-500">
                    <span className="w-2 h-2 rounded-full bg-zinc-300" aria-hidden />
                    원본
                  </figcaption>
                  <img
                    src="/showcase/box7-before.png"
                    alt="보기 박스가 포함된 수학 시험지 원본"
                    className="w-full"
                    loading="lazy"
                  />
                </figure>
                <figure className="card rounded-xl overflow-hidden !border-[var(--accent-border)]">
                  <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-[var(--accent-border)] bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden />
                    변환된 HWP
                  </figcaption>
                  <img
                    src="/showcase/box7-after.png"
                    alt="보기 박스가 그대로 재현된 HWP 변환 결과"
                    className="w-full"
                    loading="lazy"
                  />
                </figure>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 사용법 (캡쳐 + 영상 구조) ── */}
      <section id="guide" className="py-20 lg:py-28 bg-zinc-50 border-y border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">사용법</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              처음 쓰는 분도 2분이면 충분합니다
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              아래 순서를 그대로 따라 하면 첫 변환까지 한 번에 끝납니다.
            </p>
          </div>

          {/* 동영상 가이드 — 영상 교체 시 H.264+AAC 코덱 유지(브라우저 호환), 비율 781:540 */}
          <figure className="card rounded-xl overflow-hidden max-w-4xl mx-auto mb-20">
            <figcaption className="flex items-center gap-2 px-5 py-3 border-b border-zinc-200 bg-zinc-50 text-sm font-semibold text-zinc-500">
              <iconify-icon
                icon="solar:play-bold"
                width="14"
                className="text-[var(--accent)]"
              />
              전체 과정 동영상 가이드
            </figcaption>
            <video
              className="w-full aspect-[781/540] bg-zinc-100"
              src="/guide/usage-guide.mp4"
              poster="/guide/usage-guide-poster.jpg"
              controls
              playsInline
              preload="metadata"
            >
              브라우저가 동영상 재생을 지원하지 않습니다.
            </video>
          </figure>

          {/* 스텝 1~5 */}
          <div className="space-y-16 lg:space-y-20">
            {[
              {
                n: 1,
                title: "회원가입 후 프로그램 설치",
                desc: "홈페이지에서 회원가입하면 무료 크레딧 5개가 지급됩니다. Windows용 설치 파일을 다운로드해 실행하세요. 설치 중 보안 경고가 보이면 \"추가 정보\" → \"실행\"을 누르면 됩니다.",
                img: "step-1.webp",
                imgLabel: "설치 후 로그인된 AI MathOCR 첫 화면 — PDF·이미지 파일을 끌어다 놓는 업로드 영역",
              },
              {
                n: 2,
                title: "로그인하고 PDF 또는 이미지 열기",
                desc: "프로그램을 실행해 가입한 계정으로 로그인합니다. 시험지 PDF나 핸드폰으로 찍은 문제 이미지(JPG/PNG, 최대 10장)를 드래그해서 놓거나, [파일 열기]로 업로드하세요. PDF와 이미지 모두 여러 개를 함께 첨부할 수 있고, 회전된 이미지도 프로그램 안에서 바로 회전시킬 수 있으니 방향 걱정 없이 자유롭게 올리면 됩니다.",
                img: "step-2.webp",
                imgLabel: "시험지 이미지 2장을 연 화면 — 왼쪽 목록에서 순서 변경·회전·삭제 가능",
              },
              {
                n: 3,
                title: "문제 영역을 드래그로 지정",
                desc: "변환할 문제를 마우스 드래그로 감싸면 파란 박스가 생깁니다. 문제 안에 그래프나 도형이 있으면 [그림] 모드로 그림 영역을, 해설이 있으면 [해설] 모드로 해설 영역을 따로 지정하세요. 우측 목록에 답안도 미리 입력할 수 있으며, 입력한 답안과 해설은 모두 해당 문제에 미주로 연결됩니다.",
                img: "step-3.webp",
                imgLabel: "문제 6개가 파란 박스로, 그림 영역이 초록 박스로 지정된 화면과 우측 답안 입력 목록",
              },
              {
                n: 4,
                title: "변환하기 버튼 클릭",
                desc: "시험지 명을 입력하고 [변환하기]를 누르면 AI가 문제별로 수식을 인식합니다. 진행률이 실시간으로 표시되고, 문제 수에 따라 수십 초 안에 완료됩니다.",
                img: "step-4.webp",
                imgLabel: "변환 진행 중 화면 — 진행률 50%와 문제별 OCR 완료 표시, 변환 취소 버튼",
              },
              {
                n: 5,
                title: "완성된 HWP 확인",
                desc: "변환이 끝나면 시험지 명으로 저장된 HWP 파일이 열립니다. 수식을 더블클릭해 보세요 — 수식편집기에서 바로 수정할 수 있습니다.",
                img: "step-5.webp",
                imgLabel: "변환된 HWP를 한/글에서 연 모습 — 2단 시험지에 수식과 문항 배치",
              },
            ].map((step, i) => (
              <div
                key={step.n}
                className={`grid lg:grid-cols-2 gap-8 lg:gap-14 items-center ${
                  i % 2 === 1 ? "lg:[direction:rtl]" : ""
                }`}
              >
                <div className="lg:[direction:ltr]">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-9 h-9 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center font-bold">
                      {step.n}
                    </span>
                    <div className="h-px flex-1 bg-zinc-200" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">{step.title}</h3>
                  <p className="text-zinc-600 leading-relaxed text-lg">{step.desc}</p>
                </div>
                <figure className="lg:[direction:ltr] card rounded-xl overflow-hidden">
                  <img
                    src={`/guide/${step.img}`}
                    alt={step.imgLabel}
                    className="w-full"
                    loading="lazy"
                  />
                </figure>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 가격 ── */}
      <section id="pricing" className="py-20 lg:py-28">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">가격</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              많이 담을수록, 더 저렴하게
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              월 구독 없이 필요한 만큼만 충전하세요. 많이 살수록 크레딧당 단가가
              낮아지고, 문제 속 그림은 크레딧 차감 없이 함께 넣을 수 있습니다.
            </p>
            {/* 유효기간 연장 정책 강조 — grant_plan_credits(0009)의 실제 동작과 일치 */}
            <div className="mt-5 inline-flex items-start gap-2.5 rounded-xl border border-[var(--accent-border)] bg-white px-4 py-2.5 text-[15px] text-zinc-800">
              <iconify-icon
                icon="solar:check-circle-bold"
                width="18"
                className="shrink-0 mt-0.5"
                style={{ color: "var(--accent)" }}
              />
              <span>
                만료 전에 충전하면 <strong>남은 크레딧도 새 유효기간으로 함께 연장</strong>됩니다
                — 쓰던 크레딧이 사라지지 않아요.
              </span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`card rounded-xl p-8 relative ${
                  plan.featured ? "!border-[var(--accent)]" : ""
                }`}
              >
                {plan.featured && (
                  <div
                    className="absolute -top-3 left-8 text-white text-xs font-semibold px-3 py-1 rounded-full"
                    style={{ backgroundColor: plan.color }}
                  >
                    가장 인기
                  </div>
                )}
                <div className="mb-2">
                  <span
                    className="inline-block text-base font-bold px-3.5 py-1 rounded-full tracking-wide"
                    style={{ color: plan.color, backgroundColor: plan.color + "1a" }}
                  >
                    {plan.name}
                  </span>
                </div>
                <div className="text-sm text-zinc-500 mb-4">
                  {plan.credits} 크레딧 · 유효기간 {plan.validityDays}일
                </div>

                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-zinc-400 line-through">
                    {plan.listPrice.toLocaleString()}원
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: plan.color, backgroundColor: plan.color + "1a" }}
                  >
                    {plan.discountPct}% 할인
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-4xl font-bold">
                    {plan.price.toLocaleString()}원
                  </span>
                </div>
                <div className="text-sm text-zinc-500 mb-7">
                  크레딧당 {plan.perUnit}원
                </div>

                <ul className="space-y-3 mb-8 text-[15px] text-zinc-600">
                  {[
                    `${plan.credits} 크레딧 충전`,
                    `유효기간 ${plan.validityDays}일 · 재충전 시 함께 연장`,
                    "문제 속 그림은 무료",
                    "실패한 문제는 차감 안 됨",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <iconify-icon
                        icon="solar:check-circle-bold"
                        width="18"
                        className="shrink-0"
                        style={{ color: plan.color }}
                      />
                      {t}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    trackEvent("cta_click", {
                      label: "purchase",
                      location: `pricing_${plan.id}`,
                    });
                    if (PAYMENTS_ENABLED) {
                      window.location.href = `/charge?plan=${plan.id}`;
                    } else {
                      setPurchaseNotice(true);
                    }
                  }}
                  className={`block w-full text-center px-6 py-3.5 rounded-lg text-[15px] ${
                    plan.featured ? "btn-primary" : "btn-outline"
                  }`}
                >
                  구매하기
                </button>
              </div>
            ))}
          </div>

          {/* 크레딧 차감 기준(구조화 표) + 무료 체험 */}
          <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <h3 className="text-base font-bold text-zinc-900">크레딧 차감 기준</h3>
              <a
                href="/auth/signup"
                onClick={() => trackEvent("cta_click", { label: "sign_up", location: "pricing_free" })}
                className="btn-outline text-center px-5 py-2.5 rounded-lg text-sm whitespace-nowrap"
              >
                가입하고 {SIGNUP_FREE_CREDITS} 크레딧 무료 체험 ({SIGNUP_FREE_VALIDITY_DAYS}일)
              </a>
            </div>
            <dl className="grid sm:grid-cols-2 gap-x-10">
              {CREDIT_RULE.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-zinc-200 py-2.5"
                >
                  <dt className="text-sm text-zinc-600">{row.label}</dt>
                  <dd
                    className={`text-sm font-semibold ${
                      row.free ? "text-emerald-600" : "text-zinc-900"
                    }`}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── 다운로드 (PC/모바일 분기) ── */}
      <section id="download" className="py-20 lg:py-28 bg-zinc-50 border-y border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-2xl mx-auto text-center">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">다운로드</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              Windows PC에서 시작하세요
            </h2>

            {/* PC 전용: 다운로드 버튼 */}
            <div className="hidden md:block">
              <p className="text-lg text-zinc-600 mb-9">
                설치 후 로그인하면 무료 크레딧 5개가 자동 지급됩니다.
              </p>
              <a
                href={DOWNLOAD_URL}
                onClick={() => trackEvent("app_download", { version: DOWNLOAD_LABEL })}
                className="btn-primary inline-flex items-center gap-2.5 px-10 py-4 text-lg rounded-lg"
              >
                <iconify-icon icon="solar:download-minimalistic-linear" width="22" />
                Windows용 다운로드
                <span className="text-sm opacity-75">{DOWNLOAD_LABEL}</span>
              </a>
              <div className="mt-6 text-sm text-zinc-500 space-y-1.5">
                <p>Windows 10 / 11 · 정품 한글(한컴오피스) 필요</p>
                <p>
                  <span className="text-zinc-700 font-medium">한글 뷰어(무료)로는 변환되지 않습니다</span>{" "}
                  · 한글 2014 이상 권장
                </p>
                <p>
                  설치 시 보안 경고가 나타나면{" "}
                  <span className="text-zinc-700 font-medium">&ldquo;추가 정보&rdquo;</span> →{" "}
                  <span className="text-zinc-700 font-medium">&ldquo;실행&rdquo;</span>을 눌러주세요
                </p>
              </div>
            </div>

            {/* 모바일 전용: PC 안내 */}
            <div className="md:hidden">
              <div className="card rounded-xl p-8 text-left">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
                    <iconify-icon
                      icon="solar:monitor-linear"
                      width="24"
                      className="text-[var(--accent)]"
                    />
                  </div>
                  <h3 className="font-bold text-lg">Windows PC 전용 프로그램입니다</h3>
                </div>
                <p className="text-zinc-600 leading-relaxed mb-5">
                  AI MathOCR은 한글(HWP)과 연동되는 Windows 데스크톱 프로그램이라
                  모바일에서는 설치할 수 없습니다.
                </p>
                <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-sm text-zinc-700 leading-relaxed">
                  PC에서 <strong className="font-semibold text-[var(--accent)]">mathocr.ai.kr</strong>에
                  접속한 뒤 이 페이지에서 다운로드하세요.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 lg:py-28">
        {/* 홈 전용 FAQPage 구조화 데이터 (질문/답은 아래 화면과 동일한 @/lib/faqs 출처) */}
        <FaqStructuredData />
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="grid lg:grid-cols-[1fr_2fr] gap-10 lg:gap-20">
            <div>
              <div className="text-sm font-semibold text-[var(--accent)] mb-3">FAQ</div>
              <h2 className="text-3xl font-bold tracking-tight">
                자주 묻는 질문
              </h2>
            </div>
            <div className="divide-y divide-zinc-200">
              {FAQS.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-lg text-zinc-900">
                    {item.q}
                    <iconify-icon
                      icon="solar:alt-arrow-down-linear"
                      width="20"
                      className="text-zinc-400 group-open:rotate-180 transition-transform shrink-0 ml-4"
                    />
                  </summary>
                  <p className="text-zinc-600 leading-relaxed mt-3 pr-8">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 하단 CTA ── */}
      <section className="bg-[var(--accent)] text-white">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 py-16 lg:py-20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-3">
              오늘 시험지 작업부터 줄여보세요
            </h2>
            <p className="text-white/85 text-lg">
              회원가입하면 무료 크레딧 5개로 바로 시작할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <a
              href="/auth/signup"
              onClick={() => trackEvent("cta_click", { label: "sign_up", location: "bottom" })}
              className="bg-white text-[var(--accent)] font-semibold px-8 py-4 rounded-lg hover:bg-violet-50 transition-colors"
            >
              무료 회원가입
            </a>
            <a
              href="#download"
              onClick={() => trackEvent("nav_click", { label: "download_bottom" })}
              className="border border-white/40 text-white font-medium px-8 py-4 rounded-lg hover:bg-white/10 transition-colors"
            >
              다운로드
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 py-10 bg-white">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="flex items-center gap-2">
              <img src="/mathocr-icon.png" alt="AI MathOCR" width={28} height={28} />
              <span className="font-bold">
                AI Math<span className="text-[var(--accent)]">OCR</span>
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="/terms" className="hover:text-zinc-900 transition-colors">
                이용약관
              </a>
              <a
                href="/privacy"
                className="font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                개인정보처리방침
              </a>
              <a
                href="mailto:aimathocr.official@gmail.com"
                className="hover:text-zinc-900 transition-colors"
              >
                문의하기
              </a>
            </div>
          </div>

          {/* 사업자 정보 (전자상거래법 제10조) — 등록 완료 후 SHOW_BUSINESS_INFO=true */}
          {SHOW_BUSINESS_INFO ? (
            <div className="border-t border-zinc-100 pt-5 text-xs text-zinc-400 leading-relaxed space-y-0.5">
              <p>
                상호: {BUSINESS_INFO.company} | 대표자: {BUSINESS_INFO.ceo} |
                개인정보 보호책임자: {BUSINESS_INFO.privacyOfficer}
              </p>
              <p>
                사업자등록번호: {BUSINESS_INFO.bizRegNo} | 통신판매업 신고번호:{" "}
                {BUSINESS_INFO.mailOrderNo}
              </p>
              <p>
                주소: {BUSINESS_INFO.address} | 전화: {BUSINESS_INFO.phone} |
                이메일: {BUSINESS_INFO.email}
              </p>
              <p className="pt-1.5">
                &copy; 2026 AI MathOCR. All rights reserved.
              </p>
            </div>
          ) : (
            <div className="border-t border-zinc-100 pt-5 text-sm text-zinc-400">
              &copy; 2026 AI MathOCR. All rights reserved.
            </div>
          )}
        </div>
      </footer>

      {/* 구매 버튼 placeholder 안내 토스트 (결제 연동 전) */}
      {purchaseNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-[92vw] max-w-md">
          <div className="flex items-center gap-3 bg-zinc-900 text-white text-sm px-5 py-3.5 rounded-xl shadow-lg">
            <iconify-icon
              icon="solar:info-circle-bold"
              width="18"
              className="text-[var(--accent)] shrink-0"
            />
            <span className="leading-relaxed">
              결제 기능은 곧 오픈됩니다. 지금은 가입 후 {SIGNUP_FREE_CREDITS} 크레딧을
              무료로 체험할 수 있어요.
            </span>
            <button
              type="button"
              onClick={() => setPurchaseNotice(false)}
              className="ml-auto text-white/60 hover:text-white shrink-0"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── 얼리버드 안내 팝업 (결제 오픈 후 컴포넌트 내 POPUP_ENABLED=false) ── */}
      <EarlyBirdPopup />
    </>
  );
}
