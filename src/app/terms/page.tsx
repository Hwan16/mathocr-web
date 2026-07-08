"use client";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-20 bg-zinc-50">
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="text-center mb-10">
          <a href="/" className="inline-flex flex-col items-center gap-3">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={48} height={48} />
            <span className="text-2xl font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <h1 className="text-2xl font-bold mt-4">서비스 이용약관</h1>
          <p className="text-zinc-500 text-sm mt-2">
            최종 수정일: 2026년 7월 8일
          </p>
        </div>

        {/* Terms Content */}
        <div className="card rounded-xl p-8 md:p-10 shadow-sm">
          <TermsContent />
        </div>

        <div className="mt-6 text-center">
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

export function TermsContent() {
  return (
    <div className="space-y-8 text-sm text-zinc-600 leading-relaxed">
      {/* 제1조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제1조 (목적)
        </h2>
        <p>
          본 약관은 AI MathOCR(이하 &ldquo;본 프로그램&rdquo;)을 제공함에 있어,
          환희에듀테크랩(대표: 김기환, 이하 &ldquo;제공자&rdquo;)과 서비스를
          이용하는 이용자(이하 &ldquo;이용자&rdquo;) 간의 권리, 의무 및 책임
          사항, 서비스 이용 조건 및 절차 등 기본적인 사항을 규정함을 목적으로
          합니다.
        </p>
      </section>

      {/* 제2조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제2조 (용어의 정의)
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-zinc-900">서비스:</strong> 이용자가 업로드한
            PDF 또는 이미지 파일 내의 수학 문제를 OCR(광학 문자 인식) 기술을
            통해 추출하고, 이를 HWP(아래아한글) 형식으로 변환하여 제공하는
            소프트웨어 및 관련 부가 서비스를 의미합니다.
          </li>
          <li>
            <strong className="text-zinc-900">콘텐츠:</strong> 이용자가 서비스
            이용을 위해 업로드하는 PDF, 이미지 파일 및 이를 통해 생성된 결과물을
            의미합니다.
          </li>
          <li>
            <strong className="text-zinc-900">크레딧:</strong> 서비스 이용을 위해
            사전에 충전하는 유료 이용권으로, 문제 1건 변환 시 1크레딧이
            차감됩니다.
          </li>
        </ul>
      </section>

      {/* 제3조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
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

      {/* 제4조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제4조 (이용자의 의무 및 저작권 준수)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            이용자는 본 프로그램을 이용함에 있어 저작권법 등 관련 법령을
            준수해야 합니다.
          </li>
          <li>
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
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
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
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
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
            (청약철회·환불) 유료로 충전한 크레딧에 대하여, 이용자는
            「전자상거래 등에서의 소비자보호에 관한 법률」 등 관련 법령에 따라
            결제일로부터 7일 이내에 청약을 철회하고 환불을 요청할 수 있습니다.
            크레딧을 전혀 사용하지 않은 경우 결제 금액 전액이 환불되며, 일부를
            사용한 경우 결제 금액에서 사용분(사용한 크레딧 수 × 해당 플랜의
            크레딧당 단가)을 차감한 금액이 환불됩니다.
          </li>
          <li>
            환불 요청은 서비스에 안내된 연락처(이메일:
            aimathocr.official@gmail.com)로 할 수 있으며, 제공자는 관련 법령에
            따라 지체 없이 환급 절차를 진행합니다. 회원가입·프로모션·보상
            등으로 무상 지급된 크레딧은 환불 대상에서 제외됩니다.
          </li>
          <li>
            (유효기간) 충전 크레딧에는 플랜별 유효기간이 부여되며, 제공자는
            이를 결제 화면 등에 명확히 표시합니다. 유효기간이 남아 있는
            상태에서 크레딧을 추가로 충전하는 경우, 보유 중인 잔여 크레딧의
            유효기간은 기존 유효기간과 새로 충전한 크레딧의 유효기간 중 더 긴
            쪽으로 연장되며, 충전으로 인해 유효기간이 단축되지 않습니다.
          </li>
          <li>
            유효기간이 경과한 크레딧은 서비스 이용에 사용할 수 없으며,
            유효기간 경과 후의 환불 등은 관련 법령이 정하는 범위 내에서
            처리됩니다.
          </li>
        </ol>
      </section>

      {/* 제7조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제7조 (개인정보 및 데이터 보호)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            서비스 제공을 위하여 이용자가 업로드한 이미지는 제공자의 서버를
            거쳐, OCR·AI 변환을 수행하는 제3자 처리시설(예: Mathpix, Anthropic
            등 국외에 소재한 클라우드 서비스)로 전송되어 처리됩니다.
          </li>
          <li>
            변환에 사용된 이미지 파일은 변환 완료 후 제공자의 서버에 저장하지
            않습니다. 다만 이용자가 오변환 신고 기능을 이용하는 경우, 해당
            이미지(원본 및 변환 결과)는 서비스 품질 개선 및 검수 목적으로
            관련 법령이 허용하는 기간 동안 제공자의 저장소에 보관될 수 있습니다.
          </li>
          <li>
            이용자의 계정 정보(이메일), 결제 내역, 변환 이력(파일명 등)의
            수집·이용·보관·파기, 처리위탁 및 국외 이전에 관한 구체적인 사항은
            제공자가 별도로 게시하는{" "}
            <a href="/privacy" className="text-[var(--accent)] hover:underline">
              개인정보처리방침
            </a>
            에 따릅니다.
          </li>
        </ol>
      </section>

      {/* 제8조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제8조 (책임의 제한 및 면책)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong className="text-zinc-900">OCR 인식 오류 면책:</strong> 제공자는 OCR 변환 결과의 정확성,
            완전성, 특정 목적에의 적합성에 대하여 어떠한 보증도 하지 않습니다.
            수식, 기호, 도표 등의 오인식으로 인해 발생하는 모든 손해에 대하여
            제공자는 책임을 지지 않습니다. 이용자는 결과물을 사용하기 전
            반드시 원본과 대조하여 검토해야 합니다.
          </li>
          <li>
            <strong className="text-zinc-900">서비스 중단:</strong> 천재지변,
            서버 점검, 통신 장애 등 불가항력적인 사유로 서비스가 중단되어 발생한
            손해에 대하여 제공자는 책임을 면제받습니다.
          </li>
          <li>
            <strong className="text-zinc-900">제3자 서비스:</strong> 본 프로그램이
            연동하여 사용하는 제3자 서비스(OCR·AI 분석용 클라우드 서비스 등)의
            장애로 인한 서비스 불능에 대해서는 책임을 지지 않습니다.
          </li>
          <li>
            <strong className="text-zinc-900">면책의 한계:</strong> 본 조의 책임
            제한 및 면책은 제공자의 고의 또는 중대한 과실로 인하여 발생한
            손해에 대해서는 적용되지 아니합니다.
          </li>
        </ol>
      </section>

      {/* 제9조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
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
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
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
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제11조 (준거법 및 재판관할)
        </h2>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            본 약관의 해석 및 이용자와 제공자 간의 분쟁에 대해서는 대한민국
            법령을 적용합니다.
          </li>
          <li>
            서비스 이용과 관련하여 제공자와 이용자 사이에 발생한 분쟁에 관한
            소송의 관할법원은 「민사소송법」 등 관련 법령이 정하는 바에 따릅니다.
          </li>
        </ol>
      </section>
    </div>
  );
}
