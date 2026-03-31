"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user);
    });
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );

    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* ── Floating Navigation ── */}
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 nav-glass rounded-2xl px-6 py-3 flex items-center gap-8 w-auto">
        <a href="/" className="flex items-center gap-2.5 shrink-0">
          <span
            className="text-2xl font-bold tracking-tighter"
            style={{ fontFamily: "var(--font-en)" }}
          >
            Math
          </span>
          <span className="text-2xl font-bold text-[var(--accent)]" style={{ fontFamily: "var(--font-en)" }}>
            OCR
          </span>
        </a>

        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <a href="#features" className="hover:text-zinc-100 transition-colors">
            기능
          </a>
          <a href="#how" className="hover:text-zinc-100 transition-colors">
            사용법
          </a>
          <a href="#pricing" className="hover:text-zinc-100 transition-colors">
            가격
          </a>
          <a href="#download" className="hover:text-zinc-100 transition-colors">
            다운로드
          </a>
        </div>

        <div className="flex items-center gap-3 ml-auto">
          {isLoggedIn ? (
            <a
              href="/dashboard"
              className="btn-primary text-sm px-5 py-2 rounded-xl"
            >
              마이페이지
            </a>
          ) : (
            <>
              <a
                href="/auth/login"
                className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                로그인
              </a>
              <a
                href="/auth/signup"
                className="btn-primary text-sm px-5 py-2 rounded-xl"
              >
                시작하기
              </a>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero — Split Layout ── */}
      <section className="min-h-screen flex items-center pt-24 pb-20 md:pb-32">
        <div className="max-w-7xl mx-auto px-6 md:px-10 w-full">
          <div className="grid md:grid-cols-[1fr_1.1fr] gap-12 md:gap-16 items-center">
            {/* Left — Copy */}
            <div>
              <div className="reveal">
                <span className="inline-flex items-center gap-2 text-sm text-zinc-400 mb-6 glass rounded-full px-4 py-1.5">
                  <iconify-icon
                    icon="solar:cpu-bolt-bold"
                    className="text-[var(--accent)]"
                    width="16"
                  />
                  AI 기반 수식 인식 엔진
                </span>
              </div>

              <h1 className="reveal reveal-delay-1 text-4xl md:text-5xl lg:text-6xl font-bold leading-tight md:leading-tight mb-6">
                수학문제 PDF,
                <br />
                <span className="text-[var(--accent)]">편집 가능한 HWP</span>로
                <br />
                바꾸세요
              </h1>

              <p className="reveal reveal-delay-2 text-lg md:text-xl text-zinc-400 leading-relaxed mb-10 max-w-lg">
                수식이 이미지가 아닌{" "}
                <span className="text-zinc-200 font-medium">
                  수식편집기 객체
                </span>
                로 변환됩니다. 교재와 시험지를 몇 번의 클릭만으로 완벽한 HWP
                문서로 만드세요.
              </p>

              <div className="reveal reveal-delay-3 flex flex-col sm:flex-row gap-4">
                <a
                  href="/auth/signup"
                  className="btn-primary px-8 py-4 text-lg rounded-2xl text-center"
                >
                  무료로 시작하기
                </a>
                <a
                  href="#how"
                  className="btn-secondary px-8 py-4 text-lg rounded-2xl text-center text-zinc-300"
                >
                  사용법 보기
                </a>
              </div>

              {/* Social proof */}
              <div className="reveal reveal-delay-4 mt-12 flex items-center gap-4">
                <div className="flex -space-x-2">
                  {[
                    "bg-amber-700",
                    "bg-zinc-600",
                    "bg-stone-600",
                    "bg-neutral-500",
                  ].map((bg, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded-full ${bg} border-2 border-[#0a0a0a] flex items-center justify-center text-[10px] font-medium`}
                    >
                      {["김", "이", "박", "정"][i]}
                    </div>
                  ))}
                </div>
                <div className="text-sm text-zinc-500">
                  <span className="text-zinc-300 font-medium">2,847명</span>의
                  선생님이 사용 중
                </div>
              </div>
            </div>

            {/* Right — Product Visual */}
            <div className="reveal reveal-delay-2">
              <div className="bezel-card rounded-3xl p-1.5 accent-glow">
                <div className="rounded-2xl overflow-hidden bg-zinc-900">
                  {/* Mock app interface */}
                  <div className="p-4 border-b border-white/5 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    </div>
                    <div className="ml-3 text-xs text-zinc-500 font-mono">
                      MathOCR v1.0
                    </div>
                  </div>

                  <div className="grid grid-cols-[1.2fr_1fr] min-h-[340px]">
                    {/* PDF side */}
                    <div className="p-6 border-r border-white/5">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
                        PDF Input
                      </div>
                      <div className="space-y-3">
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-dashed border-amber-500/30">
                          <div className="text-xs text-zinc-400 mb-1.5">
                            문제 1
                          </div>
                          <div className="text-[11px] text-zinc-500 leading-relaxed">
                            다음 부등식을 만족시키는
                            <br />
                            정수 x의 개수를 구하시오.
                          </div>
                          <div
                            className="mt-2 text-sm text-zinc-300 text-center py-2"
                            style={{ fontFamily: "var(--font-en)" }}
                          >
                            |2x - 3| {"<"} 5
                          </div>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-3 border border-dashed border-amber-500/30">
                          <div className="text-xs text-zinc-400 mb-1.5">
                            문제 2
                          </div>
                          <div className="text-[11px] text-zinc-500 leading-relaxed">
                            함수 f(x)의 도함수를
                            <br />
                            구하시오.
                          </div>
                          <div
                            className="mt-2 text-sm text-zinc-300 text-center py-2"
                            style={{ fontFamily: "var(--font-en)" }}
                          >
                            f(x) = x&sup3; + 2x&sup2; - 5
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* HWP side */}
                    <div className="p-6">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-3">
                        HWP Output
                      </div>
                      <div className="space-y-3">
                        <div className="bg-zinc-800/40 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <iconify-icon
                              icon="solar:check-circle-bold"
                              className="text-emerald-500"
                              width="14"
                            />
                            <span className="text-xs text-emerald-400">
                              변환 완료
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            수식편집기 객체 2개
                          </div>
                          <div className="text-[11px] text-zinc-400">
                            텍스트 블록 4개
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-[var(--accent)]/10 border border-[var(--accent)]/20 rounded-lg p-2 text-center">
                            <div className="text-xs text-[var(--accent)] font-medium">
                              99.2%
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              인식률
                            </div>
                          </div>
                          <div className="flex-1 bg-zinc-800/40 rounded-lg p-2 text-center">
                            <div className="text-xs text-zinc-300 font-medium">
                              1.3초
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              변환시간
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features — Bento Grid ── */}
      <section id="features" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="reveal max-w-2xl mb-16">
            <span className="text-sm text-[var(--accent)] font-medium mb-3 block">
              핵심 기능
            </span>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
              수식 변환의 모든 것을
              <br />
              하나의 도구로
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Mathpix와 Claude Vision AI가 수식을 정확히 인식하고,
              <br className="hidden md:block" />
              HWP 수식편집기 객체로 완벽하게 변환합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Feature 1 — Large card */}
            <div className="reveal lg:col-span-2 bezel-card rounded-2xl p-8 md:p-10 group">
              <div className="flex flex-col md:flex-row md:items-start gap-6">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center">
                  <iconify-icon
                    icon="solar:document-add-bold"
                    className="text-[var(--accent)]"
                    width="24"
                  />
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">
                    영역 선택 기반 변환
                  </h3>
                  <p className="text-zinc-400 leading-relaxed max-w-xl">
                    PDF를 열고 드래그로 문제 영역을 지정하세요. 그림 영역은 별도
                    지정하면 이미지로 삽입되고, 나머지는 AI가 텍스트와 수식을
                    분리하여 인식합니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="reveal reveal-delay-1 bezel-card rounded-2xl p-8 group">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-5">
                <iconify-icon
                  icon="solar:calculator-bold"
                  className="text-emerald-400"
                  width="24"
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                진짜 수식편집기 객체
              </h3>
              <p className="text-zinc-400 leading-relaxed">
                분수, 루트, 적분, 시그마, 행렬까지. 수식이 이미지가 아닌
                편집 가능한 HWP 수식 객체로 삽입됩니다.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="reveal bezel-card rounded-2xl p-8 group">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center mb-5">
                <iconify-icon
                  icon="solar:layers-bold"
                  className="text-sky-400"
                  width="24"
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">2단 레이아웃 출력</h3>
              <p className="text-zinc-400 leading-relaxed">
                실제 교재처럼 2단 레이아웃으로 출력합니다. 문제 번호, 수식,
                그림이 교재와 동일한 포맷으로 정렬됩니다.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="reveal reveal-delay-1 bezel-card rounded-2xl p-8 group">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center mb-5">
                <iconify-icon
                  icon="solar:shield-check-bold"
                  className="text-violet-400"
                  width="24"
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">AI 이중 검증</h3>
              <p className="text-zinc-400 leading-relaxed">
                Mathpix가 수식을 추출하고, Claude Vision이 구조를 검증합니다.
                하첨자, 위첨자 오류까지 자동으로 교정합니다.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="reveal reveal-delay-2 bezel-card rounded-2xl p-8 group">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center mb-5">
                <iconify-icon
                  icon="solar:gallery-bold"
                  className="text-rose-400"
                  width="24"
                />
              </div>
              <h3 className="text-xl font-semibold mb-2">그래프/그림 지원</h3>
              <p className="text-zinc-400 leading-relaxed">
                그림 영역을 지정하면 자동으로 크기 조절하여 이미지로 삽입합니다.
                수식 인식에 간섭하지 않도록 마스킹 처리됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How It Works — Zig-zag ── */}
      <section id="how" className="py-20 md:py-32 bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="reveal text-center mb-20">
            <span className="text-sm text-[var(--accent)] font-medium mb-3 block">
              사용법
            </span>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight">
              세 단계로 끝나는 변환
            </h2>
          </div>

          {/* Step 1 */}
          <div className="reveal grid md:grid-cols-[1fr_1.1fr] gap-12 md:gap-20 items-center mb-20 md:mb-32">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)] font-bold">
                  1
                </span>
                <span className="text-sm text-zinc-500 uppercase tracking-wider font-medium">
                  Upload
                </span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 leading-snug">
                PDF를 열고
                <br />
                문제 영역을 선택
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg max-w-md">
                수학 교재나 시험지 PDF를 불러오세요. 변환할 문제를 드래그로
                선택하고, 그림이 있다면 그림 영역도 따로 지정합니다.
              </p>
            </div>
            <div className="bezel-card rounded-2xl p-6 md:p-8">
              <div className="aspect-video bg-zinc-900/50 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <iconify-icon
                    icon="solar:upload-minimalistic-bold"
                    className="text-zinc-600"
                    width="48"
                  />
                  <p className="text-sm text-zinc-600 mt-3">
                    PDF 파일을 드래그하여 놓으세요
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 — Reversed */}
          <div className="reveal grid md:grid-cols-[1.1fr_1fr] gap-12 md:gap-20 items-center mb-20 md:mb-32">
            <div className="order-2 md:order-1 bezel-card rounded-2xl p-6 md:p-8">
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm text-zinc-300">
                    Mathpix 수식 추출 중...
                  </span>
                  <span className="text-xs text-zinc-600 ml-auto">1/2</span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900/50">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-sm text-zinc-300">
                    Claude Vision 구조 검증...
                  </span>
                  <span className="text-xs text-zinc-600 ml-auto">2/2</span>
                </div>
                <div className="mt-4 p-4 rounded-lg bg-zinc-900/30 border border-white/5">
                  <div
                    className="text-center text-zinc-300 text-sm"
                    style={{ fontFamily: "var(--font-en)" }}
                  >
                    {"\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}"}
                  </div>
                  <div className="mt-2 flex justify-center">
                    <iconify-icon
                      icon="solar:arrow-down-bold"
                      className="text-[var(--accent)]"
                      width="20"
                    />
                  </div>
                  <div className="text-center text-zinc-400 text-xs mt-1">
                    HWP 수식편집기 객체로 변환
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)] font-bold">
                  2
                </span>
                <span className="text-sm text-zinc-500 uppercase tracking-wider font-medium">
                  Process
                </span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 leading-snug">
                AI가 수식을
                <br />
                자동으로 인식
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg max-w-md">
                Mathpix가 LaTeX로 수식을 추출하고, Claude Vision이 결과를
                검증합니다. 분수, 루트, 적분, 행렬까지 21가지 수식 유형을
                처리합니다.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="reveal grid md:grid-cols-[1fr_1.1fr] gap-12 md:gap-20 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-sm text-[var(--accent)] font-bold">
                  3
                </span>
                <span className="text-sm text-zinc-500 uppercase tracking-wider font-medium">
                  Export
                </span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold mb-4 leading-snug">
                HWP 문서를
                <br />
                바로 다운로드
              </h3>
              <p className="text-zinc-400 leading-relaxed text-lg max-w-md">
                변환이 완료되면 2단 레이아웃의 HWP 파일이 생성됩니다. 수식은
                수식편집기 객체로, 그림은 이미지로 삽입된 완성된 문서를 바로 사용하세요.
              </p>
            </div>
            <div className="bezel-card rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 border border-white/5">
                <div className="w-12 h-12 rounded-xl bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                  <iconify-icon
                    icon="solar:file-check-bold"
                    className="text-[var(--accent)]"
                    width="24"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    수학_시험지_변환결과.hwp
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    12문제 / 수식 47개 / 그림 8개
                  </div>
                </div>
                <div className="shrink-0">
                  <iconify-icon
                    icon="solar:download-minimalistic-bold"
                    className="text-emerald-400"
                    width="20"
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg bg-zinc-900/30">
                  <div className="text-lg font-bold text-zinc-200">12</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">문제</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-zinc-900/30">
                  <div className="text-lg font-bold text-[var(--accent)]">
                    47
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">수식</div>
                </div>
                <div className="text-center p-3 rounded-lg bg-zinc-900/30">
                  <div className="text-lg font-bold text-zinc-200">99.1%</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">정확도</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="reveal text-center mb-16">
            <span className="text-sm text-[var(--accent)] font-medium mb-3 block">
              사용 후기
            </span>
            <h2 className="text-3xl md:text-4xl font-bold">
              현직 선생님들의 이야기
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="reveal bezel-card rounded-2xl p-8">
              <p className="text-zinc-300 leading-relaxed mb-6 text-lg">
                &ldquo;시험지 한 장에 20문제, 예전엔 수식 하나하나 직접 쳤는데
                이제는 10분이면 끝나요. 수식편집기 객체로 변환되니까
                수정도 자유롭고요.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-800/50 flex items-center justify-center text-sm font-medium">
                  김
                </div>
                <div>
                  <div className="text-sm font-medium">김도현</div>
                  <div className="text-xs text-zinc-500">
                    서울 고등학교 수학교사 / 14년차
                  </div>
                </div>
              </div>
            </div>

            <div className="reveal reveal-delay-1 bezel-card rounded-2xl p-8">
              <p className="text-zinc-300 leading-relaxed mb-6 text-lg">
                &ldquo;학원 교재를 직접 만드는데, 기존 교재에서 문제를 가져올 때
                항상 수식이 문제였어요. 이제 원본이랑 똑같은 품질로
                바로 편집할 수 있어서 작업 시간이 절반으로 줄었습니다.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-stone-700/50 flex items-center justify-center text-sm font-medium">
                  박
                </div>
                <div>
                  <div className="text-sm font-medium">박서연</div>
                  <div className="text-xs text-zinc-500">
                    대치동 수학학원 원장
                  </div>
                </div>
              </div>
            </div>

            <div className="reveal bezel-card rounded-2xl p-8 md:col-span-2">
              <p className="text-zinc-300 leading-relaxed mb-6 text-lg max-w-3xl">
                &ldquo;출판사에서 교재 개정 작업할 때 씁니다. 이전 판의 문제를
                스캔해서 넣으면 수식까지 완벽하게 살아나요. 적분이나 시그마 같은
                복잡한 수식도 틀리는 경우가 거의 없어서 검수 시간도 많이
                줄었습니다.&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-neutral-600/50 flex items-center justify-center text-sm font-medium">
                  이
                </div>
                <div>
                  <div className="text-sm font-medium">이준혁</div>
                  <div className="text-xs text-zinc-500">
                    교육 출판사 편집부 / 수학 교재 담당
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 md:py-32 bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="reveal text-center mb-16">
            <span className="text-sm text-[var(--accent)] font-medium mb-3 block">
              가격
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              쓴 만큼만 결제하세요
            </h2>
            <p className="text-zinc-400 text-lg">
              월 구독 없이, 변환한 문제 수만큼만 과금됩니다.
            </p>
          </div>

          <div className="grid md:grid-cols-[1fr_1.2fr] gap-6 max-w-4xl mx-auto">
            {/* Free tier */}
            <div className="reveal bezel-card rounded-2xl p-8">
              <div className="text-sm text-zinc-500 font-medium mb-1">
                체험
              </div>
              <div className="text-3xl font-bold mb-1" style={{ fontFamily: "var(--font-en)" }}>
                0
                <span className="text-lg text-zinc-500 font-normal ml-1">
                  원
                </span>
              </div>
              <div className="text-sm text-zinc-500 mb-6">
                5문제 무료 제공
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "AI 수식 인식 (Mathpix + Claude)",
                  "HWP 수식편집기 변환",
                  "2단 레이아웃 출력",
                  "그림 영역 지원",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-400">
                    <iconify-icon
                      icon="solar:check-circle-linear"
                      className="text-zinc-600 mt-0.5 shrink-0"
                      width="16"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/signup"
                className="btn-secondary block text-center px-6 py-3 rounded-xl text-sm text-zinc-300"
              >
                무료로 시작
              </a>
            </div>

            {/* Pay-per-use */}
            <div className="reveal reveal-delay-1 bezel-card rounded-2xl p-8 border-[var(--accent)]/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-[var(--accent)] text-[#0a0a0a] text-xs font-bold px-4 py-1.5 rounded-bl-xl">
                추천
              </div>
              <div className="text-sm text-[var(--accent)] font-medium mb-1">
                종량제
              </div>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold" style={{ fontFamily: "var(--font-en)" }}>
                  25
                </span>
                <span className="text-lg text-zinc-500">원</span>
                <span className="text-sm text-zinc-600 ml-1">/ 문제</span>
              </div>
              <div className="text-sm text-zinc-500 mb-6">
                크레딧 충전 방식
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  "체험 플랜의 모든 기능",
                  "무제한 변환",
                  "대량 변환 지원",
                  "변환 이력 저장",
                  "우선 지원",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <iconify-icon
                      icon="solar:check-circle-bold"
                      className="text-[var(--accent)] mt-0.5 shrink-0"
                      width="16"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href="/auth/signup"
                className="btn-primary block text-center px-6 py-3 rounded-xl text-sm"
              >
                시작하기
              </a>
              <div className="mt-4 text-center">
                <span className="text-xs text-zinc-500">
                  100문제 = 2,500원 / 1,000문제 = 25,000원
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Download ── */}
      <section id="download" className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="reveal text-center mb-16">
            <span className="text-sm text-[var(--accent)] font-medium mb-3 block">
              다운로드
            </span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              지금 바로 설치하세요
            </h2>
            <p className="text-zinc-400 text-lg">
              설치 후 로그인하면 무료 크레딧 5회가 자동 지급됩니다.
            </p>
          </div>

          <div className="reveal max-w-lg mx-auto">
            <div className="bezel-card rounded-2xl p-8 md:p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-sky-500/10 flex items-center justify-center mx-auto mb-6">
                <iconify-icon
                  icon="solar:monitor-bold"
                  className="text-sky-400"
                  width="32"
                />
              </div>
              <h3 className="text-2xl font-bold mb-2">Windows</h3>
              <p className="text-zinc-500 text-sm mb-6">
                Windows 10 / 11 지원
              </p>
              <a
                href="https://github.com/Hwan16/mathocr-web/releases/latest/download/MathOCR-Setup-v1.0.0.exe"
                className="btn-primary inline-flex items-center gap-2 px-8 py-4 text-lg rounded-2xl"
              >
                <iconify-icon icon="solar:download-minimalistic-bold" width="20" />
                다운로드
                <span className="text-sm opacity-70 ml-1">(61MB)</span>
              </a>
              <p className="text-xs text-zinc-600 mt-4">
                설치 파일 실행 후 안내에 따라 설치하세요
              </p>

              <div className="mt-6 p-4 rounded-xl bg-zinc-800/50 border border-white/5 text-left">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  <span className="text-zinc-300 font-medium">Windows SmartScreen 경고가 뜨나요?</span>
                  <br />
                  코드 서명 인증서가 아직 없어 보안 경고가 표시될 수 있습니다.
                  <br />
                  <span className="text-zinc-300">&ldquo;추가 정보&rdquo;</span> →{" "}
                  <span className="text-zinc-300">&ldquo;실행&rdquo;</span>을
                  클릭하시면 정상적으로 설치됩니다.
                </p>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-500">
                <iconify-icon icon="solar:info-circle-linear" width="16" />
                <span>Windows 전용 — HWP 수식편집기 연동을 위해 Windows 환경이 필요합니다</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA — Full Bleed ── */}
      <section className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/5 via-transparent to-transparent" />
        <div className="max-w-3xl mx-auto px-6 md:px-10 text-center relative">
          <div className="reveal">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight mb-6">
              수식 입력에 쓰는 시간,
              <br />
              <span className="text-[var(--accent)]">
                이제 그만 줄이세요
              </span>
            </h2>
            <p className="text-zinc-400 text-lg leading-relaxed mb-10 max-w-xl mx-auto">
              PDF 한 장이면 됩니다. 나머지는 AI가 처리합니다.
              <br />
              지금 바로 무료로 체험해 보세요.
            </p>
            <a
              href="/auth/signup"
              className="btn-primary inline-block px-10 py-4 text-lg rounded-2xl"
            >
              무료로 시작하기
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span
                className="text-xl font-bold tracking-tighter"
                style={{ fontFamily: "var(--font-en)" }}
              >
                Math
              </span>
              <span
                className="text-xl font-bold text-[var(--accent)]"
                style={{ fontFamily: "var(--font-en)" }}
              >
                OCR
              </span>
            </div>

            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors">
                이용약관
              </a>
              <a href="#" className="hover:text-zinc-300 transition-colors">
                개인정보처리방침
              </a>
              <a href="#" className="hover:text-zinc-300 transition-colors">
                문의하기
              </a>
            </div>

            <div className="text-sm text-zinc-600">
              &copy; 2026 MathOCR. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
