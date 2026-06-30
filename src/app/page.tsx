"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { FAQS } from "@/lib/faqs";
import { FaqStructuredData } from "./structured-data";

const DOWNLOAD_URL =
  "https://github.com/Hwan16/mathocr-web/releases/download/v1.5.2/MathOCR-Setup-v1.5.2.exe";
const DOWNLOAD_LABEL = "v1.5.2 (125MB)";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  return (
    <>
      {/* ── 상단 네비게이션 (풀폭 sticky) ── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-16 flex items-center gap-10">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={40} height={40} />
            <span className="text-xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-[15px] text-zinc-600">
            <a href="#features" onClick={() => trackEvent("nav_click", { label: "features" })} className="hover:text-zinc-900 transition-colors">기능</a>
            <a href="#guide" onClick={() => trackEvent("nav_click", { label: "guide" })} className="hover:text-zinc-900 transition-colors">사용법</a>
            <a href="#pricing" onClick={() => trackEvent("nav_click", { label: "pricing" })} className="hover:text-zinc-900 transition-colors">가격</a>
            <a href="#download" onClick={() => trackEvent("nav_click", { label: "download" })} className="hover:text-zinc-900 transition-colors">다운로드</a>
          </nav>

          <div className="flex items-center gap-3 ml-auto">
            {/* PC 전용 기능이라 모바일(md 미만)에서는 숨긴다 */}
            <a
              href="/report"
              onClick={() => trackEvent("nav_click", { label: "report_header" })}
              className="hidden md:inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
            >
              <span aria-hidden>⚠</span>
              변환이 안됐나요?
            </a>
            {isLoggedIn ? (
              <a href="/dashboard" className="btn-primary text-sm px-5 py-2.5 rounded-lg">
                마이페이지
              </a>
            ) : (
              <>
                <a
                  href="/auth/login"
                  onClick={() => trackEvent("cta_click", { label: "login", location: "header" })}
                  className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors px-2"
                >
                  로그인
                </a>
                <a href="/auth/signup" onClick={() => trackEvent("cta_click", { label: "sign_up", location: "header" })} className="btn-primary text-sm px-5 py-2.5 rounded-lg">
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
                수학문제 PDF를
                <br />
                편집 가능한 <span className="text-[var(--accent)]">HWP</span>로
              </h1>

              <p className="text-lg lg:text-xl text-zinc-600 leading-relaxed mb-9">
                수식이 이미지가 아닌 <strong className="text-zinc-900 font-semibold">한글 수식편집기 객체</strong>로
                변환됩니다. 시험지·교재 제작에 쓰는 수식 입력 시간을
                문제당 몇 초로 줄이세요.
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
                회원가입 시 5문제 무료 · 월 구독 없음 · Windows 10/11
              </p>
            </div>

            {/* 우: 데스크톱 앱 화면 (실제 앱 라이트 테마 반영 목업)
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
                {/* 툴바 */}
                <div className="flex items-center gap-3 px-4 h-11 border-b border-zinc-200 bg-white">
                  <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <span className="px-1.5 py-0.5 border border-zinc-200 rounded">◀</span>
                    <span className="px-2 py-0.5 border border-zinc-200 rounded">3 / 12</span>
                    <span className="px-1.5 py-0.5 border border-zinc-200 rounded">▶</span>
                  </div>
                  <span className="px-3 py-1 rounded-md bg-sky-600 text-white text-[11px] font-medium">문제</span>
                  <span className="px-3 py-1 rounded-md bg-emerald-600/90 text-white text-[11px] font-medium">그림</span>
                  <div className="ml-auto text-[11px] text-zinc-400">
                    잔여 크레딧: 105
                  </div>
                </div>
                {/* 본문: PDF 뷰 + 우측 패널 */}
                <div className="grid grid-cols-[7fr_3fr] min-h-[380px]">
                  <div className="p-5 bg-zinc-50 border-r border-zinc-200">
                    <div className="bg-white border border-zinc-200 rounded-md p-5 h-full shadow-sm">
                      {/* 문제 영역 박스 (파랑) */}
                      <div className="border-2 border-sky-500 rounded-sm p-3 mb-4 relative">
                        <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5 rounded-sm">1</span>
                        <p className="text-[12px] text-zinc-700 leading-relaxed">
                          1. 양의 실수 <em>x</em>에 대하여 √x = ½(1−a) 일 때,
                          √(x+a) − √(x−a+2) 의 값을 구하시오.
                        </p>
                      </div>
                      {/* 문제+그림 영역 */}
                      <div className="border-2 border-sky-500 rounded-sm p-3 relative">
                        <span className="absolute -top-2.5 left-2 bg-sky-500 text-white text-[10px] px-1.5 rounded-sm">2</span>
                        <p className="text-[12px] text-zinc-700 leading-relaxed mb-2">
                          2. 함수 y = f(x)의 그래프가 그림과 같을 때,
                        </p>
                        <div className="border-2 border-emerald-500 rounded-sm h-16 flex items-center justify-center relative">
                          <span className="absolute -top-2.5 left-2 bg-emerald-500 text-white text-[10px] px-1.5 rounded-sm">그림</span>
                          <svg width="72" height="44" viewBox="0 0 72 44" className="text-zinc-400">
                            <path d="M4 40 L4 4 M4 40 L68 40" stroke="currentColor" strokeWidth="1.5" fill="none" />
                            <path d="M8 36 Q28 4 48 22 T68 10" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* 우측 패널 */}
                  <div className="p-4 bg-white">
                    <div className="border border-zinc-200 rounded-md px-3 py-2 text-[11px] text-zinc-400 mb-3">
                      시험지 명 입력 (선택)
                    </div>
                    <div className="text-[10px] text-zinc-400 grid grid-cols-[1fr_2fr_2fr] gap-1 px-1 mb-1.5">
                      <span>#</span><span>타입</span><span>답안</span>
                    </div>
                    {[
                      ["1", "문제", "12"],
                      ["2", "문제", "③"],
                    ].map(([n, t, a]) => (
                      <div
                        key={n}
                        className="grid grid-cols-[1fr_2fr_2fr] gap-1 text-[11px] text-zinc-600 border-t border-zinc-100 px-1 py-1.5"
                      >
                        <span>{n}</span>
                        <span className="text-sky-600">{t}</span>
                        <span>{a}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_2fr_2fr] gap-1 text-[11px] text-zinc-600 border-t border-zinc-100 px-1 py-1.5">
                      <span>└</span>
                      <span className="text-emerald-600">그림</span>
                      <span className="text-zinc-400">2번 연결</span>
                    </div>
                    <div className="mt-6 btn-primary rounded-md text-center text-[12px] py-2.5">
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
              ["AI 이중 검증", "Mathpix 인식 + Claude 구조 교정"],
              ["시험지 레이아웃", "2단 구성·답안 미주 자동 생성"],
              ["종량제 과금", "월 구독 없이 문제당 25원"],
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
              수식 입력을 다시 할 필요가 없습니다
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              드래그로 문제를 지정하면, 텍스트·수식·그림을 분리해
              완성된 HWP 시험지로 만들어 드립니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                title: "영역 선택 기반 변환",
                desc: "PDF나 사진을 열고 문제 영역을 드래그하면 끝. 그림은 그림 영역으로 따로 지정하면 원본 그대로 이미지로 삽입되고, 수식 인식을 방해하지 않게 자동 마스킹됩니다.",
              },
              {
                title: "진짜 수식편집기 객체",
                desc: "분수·루트·적분·시그마·행렬·case 분기까지 21개 카테고리의 수식이 한글 수식편집기에서 그대로 수정 가능한 객체로 들어갑니다. 더블클릭하면 바로 편집할 수 있습니다.",
              },
              {
                title: "AI 이중 검증 파이프라인",
                desc: "Mathpix가 수식을 추출하고 Claude Vision이 원본 이미지와 대조해 구조를 검증합니다. 첨자 오류, 줄바꿈, 띄어쓰기까지 교정한 뒤 HWP 문법으로 변환합니다.",
              },
              {
                title: "시험지 형식 그대로 출력",
                desc: "2단 레이아웃, 문제 번호, 객관식 보기 정렬, 답안 미주까지 실제 시험지 형식으로 출력됩니다. 시험지 명을 입력하면 파일명에도 그대로 반영됩니다.",
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

      {/* ── 사용법 (캡쳐 + 영상 구조) ── */}
      <section id="guide" className="py-20 lg:py-28 bg-zinc-50 border-y border-zinc-200">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="max-w-3xl mb-14">
            <div className="text-sm font-semibold text-[var(--accent)] mb-3">사용법</div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
              처음 쓰는 분도 5분이면 충분합니다
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              아래 순서를 그대로 따라 하면 첫 변환까지 한 번에 끝납니다.
            </p>
          </div>

          {/* 동영상 가이드
              TODO: 동영상 준비 시 아래 placeholder를 YouTube embed로 교체
              <iframe className="w-full aspect-video rounded-xl" src="https://www.youtube.com/embed/VIDEO_ID" ... /> */}
          <div className="media-frame rounded-xl aspect-video max-w-4xl mx-auto mb-20 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white border border-zinc-300 flex items-center justify-center">
              <iconify-icon icon="solar:play-bold" width="24" className="text-[var(--accent)]" />
            </div>
            <span className="text-sm">전체 과정 동영상 가이드 (준비 중)</span>
          </div>

          {/* 스텝 1~5 */}
          <div className="space-y-16 lg:space-y-20">
            {[
              {
                n: 1,
                title: "회원가입 후 프로그램 설치",
                desc: "홈페이지에서 회원가입하면 무료 크레딧 5개가 지급됩니다. Windows용 설치 파일을 다운로드해 실행하세요. 설치 중 보안 경고가 보이면 \"추가 정보\" → \"실행\"을 누르면 됩니다.",
                img: "step-1.png",
                imgLabel: "스크린샷: 회원가입 화면 + 설치 과정",
              },
              {
                n: 2,
                title: "로그인하고 PDF 또는 사진 열기",
                desc: "프로그램을 실행해 가입한 계정으로 로그인합니다. 시험지 PDF를 드래그해서 놓거나, 핸드폰으로 찍은 문제 사진(JPG/PNG, 최대 10장)을 올려도 됩니다.",
                img: "step-2.png",
                imgLabel: "스크린샷: 로그인 + 파일 열기 화면",
              },
              {
                n: 3,
                title: "문제 영역을 드래그로 지정",
                desc: "변환할 문제를 마우스 드래그로 감싸면 파란 박스가 생깁니다. 문제 안에 그래프나 도형이 있으면 [그림] 모드로 바꿔 그림 영역을 한 번 더 지정하세요. 우측 목록에 답안도 미리 입력할 수 있습니다.",
                img: "step-3.png",
                imgLabel: "스크린샷: 영역 지정 + 답안 입력",
              },
              {
                n: 4,
                title: "변환하기 버튼 클릭",
                desc: "시험지 명을 입력하고 [변환하기]를 누르면 AI가 문제별로 수식을 인식합니다. 진행률이 실시간으로 표시되고, 문제 수에 따라 수십 초 안에 완료됩니다.",
                img: "step-4.png",
                imgLabel: "스크린샷: 변환 진행 화면",
              },
              {
                n: 5,
                title: "완성된 HWP 확인",
                desc: "변환이 끝나면 시험지 명으로 저장된 HWP 파일이 열립니다. 수식을 더블클릭해 보세요 — 수식편집기에서 바로 수정할 수 있습니다.",
                img: "step-5.png",
                imgLabel: "스크린샷: 완성된 HWP 결과물",
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
                {/* TODO: 실제 캡쳐 준비 시 /public/guide/{step.img} 추가 후
                    <img src={`/guide/${step.img}`} ... /> 로 교체 */}
                <div className="lg:[direction:ltr] media-frame rounded-xl aspect-[16/10] flex items-center justify-center">
                  <span className="text-sm">{step.imgLabel}</span>
                </div>
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
              월 구독 없이, 쓴 만큼만
            </h2>
            <p className="text-lg text-zinc-600 leading-relaxed">
              변환한 문제 수만큼만 크레딧이 차감됩니다. 변환에 실패한 문제는
              과금되지 않습니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5 max-w-4xl">
            {/* 무료 체험 */}
            <div className="card rounded-xl p-8">
              <div className="text-sm font-medium text-zinc-500 mb-2">무료 체험</div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-bold">0원</span>
              </div>
              <div className="text-sm text-zinc-500 mb-7">가입 즉시 5문제 제공</div>
              <ul className="space-y-3 mb-8 text-[15px] text-zinc-600">
                {[
                  "모든 기능 제한 없이 사용",
                  "AI 이중 검증 동일 적용",
                  "PDF + 이미지 업로드",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <iconify-icon
                      icon="solar:check-circle-bold"
                      width="18"
                      className="text-zinc-400 shrink-0"
                    />
                    {t}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/signup"
                onClick={() => trackEvent("cta_click", { label: "sign_up", location: "pricing_free" })}
                className="btn-outline block text-center px-6 py-3.5 rounded-lg text-[15px]"
              >
                무료로 시작
              </a>
            </div>

            {/* 종량제 */}
            <div className="card rounded-xl p-8 !border-[var(--accent)] relative">
              <div className="absolute -top-3 left-8 bg-[var(--accent)] text-white text-xs font-semibold px-3 py-1 rounded-full">
                기본 요금제
              </div>
              <div className="text-sm font-medium text-[var(--accent)] mb-2">종량제</div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-4xl font-bold">25원</span>
                <span className="text-zinc-500">/ 문제</span>
              </div>
              <div className="text-sm text-zinc-500 mb-7">크레딧 충전 방식</div>
              <ul className="space-y-3 mb-8 text-[15px] text-zinc-600">
                {[
                  "100문제 2,500원 · 1,000문제 25,000원",
                  "실패한 문제는 크레딧 자동 반환",
                  "변환 이력 대시보드 제공",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <iconify-icon
                      icon="solar:check-circle-bold"
                      width="18"
                      className="text-[var(--accent)] shrink-0"
                    />
                    {t}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/signup"
                onClick={() => trackEvent("cta_click", { label: "sign_up", location: "pricing_paid" })}
                className="btn-primary block text-center px-6 py-3.5 rounded-lg text-[15px]"
              >
                회원가입
              </a>
            </div>
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
                <p>Windows 10 / 11 · 한글(HWP) 설치 필요</p>
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
              회원가입하면 5문제를 무료로 변환할 수 있습니다.
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
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row md:items-center justify-between gap-5">
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
              href="mailto:seize.win@gmail.com"
              className="hover:text-zinc-900 transition-colors"
            >
              문의하기
            </a>
          </div>
          <div className="text-sm text-zinc-400">
            &copy; 2026 AI MathOCR. All rights reserved.
          </div>
        </div>
      </footer>
    </>
  );
}
