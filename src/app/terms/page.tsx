"use client";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex items-center gap-2">
            <span
              className="text-3xl font-bold tracking-tighter"
              style={{ fontFamily: "var(--font-en)" }}
            >
              Math
            </span>
            <span
              className="text-3xl font-bold text-[var(--accent)]"
              style={{ fontFamily: "var(--font-en)" }}
            >
              OCR
            </span>
          </a>
          <h1 className="text-2xl font-bold mt-4">서비스 이용약관</h1>
          <p className="text-zinc-500 text-sm mt-2">
            최종 수정일: 2026년 4월 1일
          </p>
        </div>

        {/* Terms Content */}
        <div className="bezel-card rounded-2xl p-8 md:p-10">
          <TermsContent />
        </div>

        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}

export function TermsContent() {
  return (
    <div className="space-y-8 text-sm text-zinc-300 leading-relaxed">
      {/* 제1조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제1조 (목적)
        </h2>
        <p>
          본 약관은 MathOCR(이하 &ldquo;본 프로그램&rdquo;)을 제공함에 있어,
          개발자(이하 &ldquo;제공자&rdquo;)와 서비스를 이용하는
          이용자(이하 &ldquo;이용자&rdquo;) 간의 권리, 의무 및 책임 사항,
          서비스 이용 조건 및 절차 등 기본적인 사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      {/* 제2조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제2조 (용어의 정의)
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-zinc-100">서비스:</strong> 이용자가 업로드한
            PDF 또는 이미지 파일 내의 수학 문제를 OCR(광학 문자 인식) 기술을
            통해 추출하고, 이를 HWP(아래아한글) 형식으로 변환하여 제공하는
            소프트웨어 및 관련 부가 서비스를 의미합니다.
          </li>
          <li>
            <strong className="text-zinc-100">콘텐츠:</strong> 이용자가 서비스
            이용을 위해 업로드하는 PDF, 이미지 파일 및 이를 통해 생성된 결과물을
            의미합니다.
          </li>
          <li>
            <strong className="text-zinc-100">크레딧:</strong> 서비스 이용을 위해
            사전에 충전하는 유료 이용권으로, 문제 1건 변환 시 1크레딧이
            차감됩니다.
          </li>
        </ul>
      </section>

      {/* 제3조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제3조 (서비스의 제공 및 제한)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            본 프로그램은 인공지능 OCR 기술을 기반으로 하며, 기술적 특성상
            100%의 정확도를 보장하지 않습니다.
          </li>
          <li>
            제공자는 기술적 사양의 변경, 운영상의 사유, 또는 인공지능 모델의
            업데이트에 따라 서비스의 내용을 변경하거나 중단할 수 있습니다.
          </li>
          <li>
            본 서비스는 Windows 운영체제에서만 지원되며, 한글과컴퓨터의
            한/글(HWP)이 설치된 환경에서 정상 동작합니다.
          </li>
        </ol>
      </section>

      {/* 제4조 — 강조 */}
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6">
        <h2 className="text-lg font-semibold text-amber-400 mb-3 flex items-center gap-2">
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          제4조 (이용자의 의무 및 저작권 준수)
        </h2>
        <ol className="list-decimal pl-5 space-y-3">
          <li>
            이용자는 본 프로그램을 이용함에 있어 저작권법 등 관련 법령을
            준수해야 합니다.
          </li>
          <li className="font-medium text-amber-200">
            이용자가 업로드하는 콘텐츠(수학 문제 등)에 대한 저작권 및 그에 따른
            책임은 전적으로 이용자에게 있습니다. 제공자는 이용자가 업로드한
            콘텐츠의 저작권 적법성을 검증하지 않으며, 이에 대한 어떠한 책임도
            지지 않습니다.
          </li>
          <li>
            이용자는 저작권자의 허락 없이 저작권이 있는 저작물을 무단으로 복제,
            변환, 배포하기 위한 목적으로 본 프로그램을 사용해서는 안 됩니다.
            만약 이를 위반하여 발생하는 모든 법적 분쟁의 책임은 이용자에게
            있으며, 제공자는 어떠한 책임도 지지 않습니다.
          </li>
        </ol>
      </section>

      {/* 제5조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제5조 (지식재산권의 귀속)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            본 프로그램에 대한 소스코드, 디자인, 상표권 등 프로그램 자체에 관한
            지식재산권은 제공자에게 귀속됩니다.
          </li>
          <li>
            이용자가 본 서비스를 통해 생성한 변환 결과물(HWP 파일 등)에 대한
            권리는 이용자에게 귀속되나, 이는 원본 콘텐츠의 저작권을 침해하지
            않는 범위 내로 한정됩니다.
          </li>
        </ol>
      </section>

      {/* 제6조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제6조 (크레딧 및 결제)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            회원가입 시 무료 체험 크레딧 5회가 제공되며, 이후 추가 이용을
            위해서는 크레딧을 충전해야 합니다.
          </li>
          <li>
            크레딧은 변환 요청 시 사전 차감되며, 변환 실패 시 자동으로
            환불됩니다.
          </li>
          <li>
            충전된 크레딧에는 유효기간이 있을 수 있으며, 유효기간 경과 시
            잔여 크레딧은 소멸됩니다.
          </li>
          <li>
            제공자의 귀책 사유가 아닌 이용자의 단순 변심에 의한 크레딧 환불은
            제한될 수 있습니다.
          </li>
        </ol>
      </section>

      {/* 제7조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제7조 (개인정보 및 데이터 보호)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            제공자는 이용자가 업로드한 파일을 변환 목적으로만 사용하며,
            변환 완료 후 해당 데이터를 서버에 보관하지 않습니다. 파일 처리는
            이용자의 로컬 환경에서 이루어집니다.
          </li>
          <li>
            이용자의 계정 정보(이메일, 이용 내역)는 서비스 제공 및 운영을
            위해 수집되며, 관련 법령에 따라 안전하게 관리됩니다.
          </li>
        </ol>
      </section>

      {/* 제8조 — 강조 */}
      <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-3 flex items-center gap-2">
          <svg
            className="w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9.303 3.376c-.866 1.5-2.032 1.5-2.898 0L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374Z M12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
          제8조 (책임의 제한 및 면책)
        </h2>
        <ol className="list-decimal pl-5 space-y-3">
          <li className="font-medium text-red-200">
            <strong>OCR 인식 오류 면책:</strong> 제공자는 OCR 변환 결과의 정확성,
            완전성, 특정 목적에의 적합성에 대하여 어떠한 보증도 하지 않습니다.
            수식, 기호, 도표 등의 오인식으로 인해 발생하는 모든 손해에 대하여
            제공자는 책임을 지지 않습니다. 이용자는 결과물을 사용하기 전
            반드시 원본과 대조하여 검토해야 합니다.
          </li>
          <li>
            <strong className="text-zinc-100">서비스 중단:</strong> 천재지변,
            서버 점검, 통신 장애 등 불가항력적인 사유로 서비스가 중단되어 발생한
            손해에 대하여 제공자는 책임을 면제받습니다.
          </li>
          <li>
            <strong className="text-zinc-100">제3자 서비스:</strong> 본 프로그램이
            연동하여 사용하는 제3자 서비스(Mathpix, Anthropic Claude 등)의
            장애로 인한 서비스 불능에 대해서는 책임을 지지 않습니다.
          </li>
        </ol>
      </section>

      {/* 제9조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제9조 (금지행위)
        </h2>
        <p className="mb-2">
          이용자는 다음 각 호의 행위를 하여서는 안 됩니다.
        </p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            본 프로그램의 리버스 엔지니어링, 소스코드 추출 시도.
          </li>
          <li>
            자동화된 수단(봇, 스크립트 등)을 이용하여 서비스에 과부하를 주는
            행위.
          </li>
          <li>
            타인의 지식재산권을 침해하는 결과물을 대량으로 양산하는 행위.
          </li>
          <li>
            타인의 계정을 도용하거나 부정한 방법으로 크레딧을 취득하는 행위.
          </li>
        </ol>
      </section>

      {/* 제10조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제10조 (약관의 변경)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            제공자는 관련 법령에 위배되지 않는 범위 내에서 본 약관을 변경할 수
            있으며, 변경 시 서비스 내 공지를 통해 고지합니다.
          </li>
          <li>
            변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고
            탈퇴할 수 있습니다.
          </li>
        </ol>
      </section>

      {/* 제11조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">
          제11조 (준거법 및 재판관할)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            본 약관의 해석 및 이용자와 제공자 간의 분쟁에 대해서는 대한민국
            법령을 적용합니다.
          </li>
          <li>
            서비스 이용과 관련하여 발생한 분쟁에 대해 소송이 제기될 경우,
            제공자의 소재지를 관할하는 법원을 합의 관할 법원으로 합니다.
          </li>
        </ol>
      </section>
    </div>
  );
}
