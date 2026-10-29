import type { Metadata } from "next";
import { articleSeoMetadata } from "@/lib/articles";
import ArticleShell from "@/components/article/ArticleShell";
import { LINK, Section, Step, SummaryBox, Warn } from "@/components/article/Prose";
import UpdateCard from "./UpdateCard";

export const metadata: Metadata = {
  title: "한글 실행·응답 오류 해결 가이드",
  description:
    "MathOCR 변환 중 '한글이 응답하지 않아' 또는 '한글 프로그램을 실행하지 못해' 문서를 만들지 못했다는 오류가 뜰 때, AI 인식 결과를 그대로 살려 한글 문서를 다시 만드는 방법을 그림과 함께 안내합니다.",
  alternates: { canonical: "/help/hwp-launch" },
  ...articleSeoMetadata("/help/hwp-launch"),
};

// 앱의 복구 창에서 [그림으로 보는 해결 방법]으로 연결되는 페이지.
// 복구 창 스크린샷은 앱 화면을 그대로 렌더링한 것(2배율, v2.3.2에서 촬영 — v2.3.3도 같은 모양).
// v2.3.2: 버튼이 [다시 만들기] 하나로 합쳐지고(숨은 한글 정리는 자동),
// 확인할 것은 다시 만들기도 실패했을 때만 창이 알려 준다 — 이 페이지도 그 흐름을 따른다.
// 페이지는 "그림은 최신 버전 기준"이라고 안내한다(UpdateCard, 2026-10-01 사용자 결정 —
// 버전 번호를 박지 않아 최신 버전 업데이트를 계속 유도). ⚠️ 복구 창 모양이 바뀌는
// 릴리스에서는 이 그림들도 새로 찍어 교체할 것.
const STEPS: {
  title: string;
  body: React.ReactNode;
  image?: string;
  imageAlt?: string;
  imageWidth?: string;
  example?: { text: React.ReactNode; image: string; imageAlt: string };
  warning?: React.ReactNode;
}[] = [
  {
    title: "오류 창에서 [다시 만들기] 누르기",
    body: (
      <>
        <strong className="text-zinc-900">[다시 만들기]</strong>를 누르면 뒤에 멈춰 있는 한글을
        자동으로 정리한 뒤, 보관해 둔 인식 결과로 한글 문서만 다시 만듭니다. AI 인식을 기다릴
        필요가 없고 <strong className="text-zinc-900">크레딧도 추가로 차감되지 않습니다.</strong>{" "}
        화면에 열려 있는 한글 문서는 건드리지 않으니 안심하세요.{" "}
        <strong className="text-zinc-900">대부분 여기서 해결됩니다.</strong>
      </>
    ),
    image: "/guide/hwp-launch/recovery-dialog.png",
    imageAlt:
      "한글 문서를 만들지 못했어요 창 — '보관해 둔 인식 결과로 한글 문서를 다시 만들까요?' 질문과 닫기·다시 만들기 버튼",
    imageWidth: "max-w-md",
  },
  {
    title: "그래도 안 되면: 창이 알려 주는 것 하나만 확인하고 다시 누르기",
    body: (
      <>
        다시 만들기도 실패하면 창이{" "}
        <strong className="text-zinc-900">&lsquo;이번에도 한글 문서를 만들지
        못했어요&rsquo;</strong>로 바뀌고 확인할 것을 하나 알려 줍니다. 열려 있는 한글 창이 있으면
        그 창의 이름을 짚어 주니, 안내 창이면 완료하거나 닫고 작업 중인 문서는 저장한 뒤 한글을
        모두 닫아 주세요. 열린 창이 없다면 바탕화면이나 시작 메뉴에서{" "}
        <strong className="text-zinc-900">한글을 직접 한 번 실행</strong>해서 뜨는 안내 창을 모두
        닫은 뒤 한글을 닫아 주세요. 그다음 <strong className="text-zinc-900">[다시
        만들기]</strong>를 다시 누르면 됩니다.
      </>
    ),
    image: "/guide/hwp-launch/retry-dialog.png",
    imageAlt:
      "이번에도 한글 문서를 만들지 못했어요 창 — '다시 만들기 전에 이것만 확인해 주세요' 안내와 다시 만들기 버튼",
    imageWidth: "max-w-md",
    example: {
      text: (
        <>
          <strong className="text-zinc-900">안내 창 예시</strong> — 한컴오피스를 새로
          설치·업데이트·복구한 직후에는 처음 실행할 때 아래와 같은 창이 떠서 변환을 막는 경우가
          있습니다. 끝까지 완료하거나 닫아 주세요.
        </>
      ),
      image: "/guide/hwp-repair/step-5.png",
      imageAlt: "한컴오피스 설치 후 처음 실행하면 뜨는 '한컴 기본 설정' 창 예시",
    },
  },
  {
    title: "그래도 안 되면: [닫기] 누른 뒤 컴퓨터 재시작",
    body: (
      <>
        오류 창에서 <strong className="text-zinc-900">[닫기]</strong>를 누르면 차감된 크레딧이
        바로 반환됩니다. 그다음 <strong className="text-zinc-900">컴퓨터를 재시작</strong>하고
        다시 변환해 보세요. 재시작하면 뒤에 멈춰 있던 한글이 모두 정리됩니다.
      </>
    ),
    warning: (
      <>
        [닫기]를 누르지 않고 바로 재시작하면 크레딧 반환이 <strong>최대 4시간가량</strong>{" "}
        늦어질 수 있습니다. 재시작 전에 [닫기]를 먼저 눌러 주세요.
      </>
    ),
  },
];

export default function HwpLaunchGuidePage() {
  return (
    // 이미 쓰는 분이 오류를 겪고 오는 글 — 오른쪽 기능 카드는 빼고 해결 단계에만 집중.
    // 띠는 글자만(복구 창 그림은 1단계에 바로 나온다)
    <ArticleShell
      href="/help/hwp-launch"
      location="help_hwp_launch"
      toc={[]}
      promo={false}
      hero={{
        lead: "대부분 버튼 한 번이면 해결됩니다 · AI 인식 결과는 그대로 보관됩니다",
      }}
    >
      <article>
        {/* 어떤 오류일 때 이 가이드를 따라하나 */}
        <SummaryBox title="이런 오류가 떴다면 이 가이드를 따라 하세요">
          <div className="rounded-lg bg-white border border-zinc-200 px-4 py-3 text-[15px] text-zinc-800 space-y-1 mb-5 break-keep">
            <p>&ldquo;한글이 응답하지 않아 문서를 만들지 못했어요&rdquo;</p>
            <p>&ldquo;한글 프로그램을 실행하지 못해 문서를 만들지 못했어요&rdquo;</p>
            <p>&ldquo;한글이 문서를 만드는 도중 오류가 나서 문서를 만들지 못했어요&rdquo;</p>
          </div>
          <p className="prose-p">
            MathOCR은 PC에 설치된 한/글을 <strong className="text-zinc-900">화면에 보이지 않게 실행</strong>해서 HWP
            문서를 만듭니다. 이때 한글에 업데이트·초기 설정 같은 안내 창이 떠 있거나, 이전에 실패한 한글이 화면에 보이지
            않는 채 뒤에 멈춰 있으면 한글이 응답하지 않아 변환이 실패할 수 있습니다.
          </p>
          <p className="mt-4 rounded-lg bg-white border border-[var(--accent-border)] px-4 py-3 text-[15px] text-zinc-800 leading-relaxed break-keep">
            <strong className="text-[var(--accent)]">AI 인식 결과는 사라지지 않아요.</strong> 오류 창을 닫지 말고{" "}
            <strong className="text-zinc-900">[다시 만들기]</strong>를 누르세요. 멈춰 있는 한글을 자동으로 정리한 뒤 AI
            인식 없이 한글 문서만 바로 만들며, 크레딧도 추가로 차감되지 않습니다.
          </p>
        </SummaryBox>

        {/* 먼저 최신 버전으로 — 그림·단계는 최신 버전 기준 */}
        <UpdateCard />

        {/* 단계별 절차 */}
        <Section title="해결 순서">
          <ol className="space-y-12">
            {STEPS.map((step, i) => (
              <Step key={i} n={i + 1} title={step.title}>
                {step.body}
                {step.warning && <Warn>{step.warning}</Warn>}
                {step.image && (
                  <img
                    src={step.image}
                    alt={step.imageAlt}
                    loading="lazy"
                    className={`mt-5 w-full rounded-lg border border-zinc-200 ${step.imageWidth ?? ""}`}
                  />
                )}
                {step.example && (
                  <div className="mt-6">
                    <p className="text-[15px] text-zinc-700 leading-relaxed break-keep">{step.example.text}</p>
                    <img
                      src={step.example.image}
                      alt={step.example.imageAlt}
                      loading="lazy"
                      className="mt-3 w-full rounded-lg border border-zinc-200"
                    />
                  </div>
                )}
              </Step>
            ))}
          </ol>
        </Section>

        {/* 그래도 안 될 때 */}
        <Section title="그래도 안 되나요?">
          <ul className="prose-p space-y-3 list-disc pl-5 marker:text-[var(--accent)]">
            <li>
              한글을 항상 <strong className="text-zinc-900">&lsquo;관리자 권한으로 실행&rsquo;</strong>하도록 설정해 두었다면
              그 설정을 끈 뒤 다시 시도해 보세요. MathOCR과 한글의 실행 권한이 다르면 연결이 막힐 수 있습니다.
            </li>
            <li>
              한글 자체가 실행되지 않거나 &lsquo;설치가 손상&rsquo;되었다는 오류가 뜨면{" "}
              <a href="/help/hwp-repair" className={LINK}>
                한글 연결 오류 해결 가이드
              </a>
              를 따라 복구 설치해 주세요.
            </li>
            <li>
              그래도 같은 오류가 반복되면{" "}
              <a href="mailto:aimathocr.official@gmail.com" className={LINK}>
                aimathocr.official@gmail.com
              </a>
              으로 오류 화면을 캡처해서 보내 주세요. 확인 후 도와드리겠습니다.
            </li>
          </ul>
        </Section>
      </article>
    </ArticleShell>
  );
}
