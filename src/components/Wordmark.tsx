// AI MathOCR 글자 로고(워드마크) — 2026-11-05 확정(D-057). 글자를 직접 그린 조립형, 'AI'만 보라.
// 좌표 원본은 앱 저장소의 assets/brand_wordmark.svg(대문자 높이 100)와 같다. 바꿀 땐 두 곳을 함께.
// 크기는 className으로 높이만 준다(예: "h-[14px] w-auto") — 높이 = 대문자 높이.
// 'MathOCR'은 글자색(currentColor)을 따르고, 'AI' 보라는 테마와 상관없이 고정한다(자료실 남색 테마 포함).

const AI_PATHS = [
  "M0 100V20L20 0H52L72 20V100H52V68H20V100ZM20 22V48H52V22Z",
  "M84 0H104V100H84Z",
];

const REST_PATHS = [
  "M152 100V0H174L196 36L218 0H240V100H220V34L196 72L172 34V100Z",
  "M268 28H316V100H268L252 84V44ZM272 48V80H296V48Z",
  "M340 8H360V28H380V48H360V80H380V100H356L340 84V48H328V28H340Z",
  "M392 0H412V28H440L456 44V100H436V48H412V100H392Z",
  "M492 0H536L554 18V82L536 100H492L474 82V18ZM496 20L494 22V78L496 80H532L534 78V22L532 20Z",
  "M584 0H634V20H592L586 26V74L592 80H634V100H584L566 82V18Z",
  "M646 100V0H696L714 18V46L698 62L724 100H700L676 64H666V100ZM666 20V44H690L694 40V24L690 20Z",
];

type Props = {
  className?: string;
  /** 옆 아이콘 이미지가 이미 'AI MathOCR'로 읽히면 true — 화면 읽기 프로그램이 두 번 읽지 않게 */
  decorative?: boolean;
};

export default function Wordmark({ className = "", decorative = false }: Props) {
  return (
    <svg
      viewBox="0 0 724 100"
      width={724}
      height={100}
      className={`shrink-0 ${className}`}
      fillRule="evenodd"
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "AI MathOCR" })}
    >
      <g fill="#7C3AED">
        {AI_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="currentColor">
        {REST_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}
