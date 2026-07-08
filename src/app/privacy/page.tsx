import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "AI MathOCR 개인정보처리방침입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          <h1 className="text-2xl font-bold mt-4">개인정보처리방침</h1>
          <p className="text-zinc-500 text-sm mt-2">시행일: 2026년 7월 8일</p>
        </div>

        {/* Content */}
        <div className="card rounded-xl p-8 md:p-10 shadow-sm">
          <PrivacyContent />
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

function PrivacyContent() {
  return (
    <div className="space-y-8 text-sm text-zinc-600 leading-relaxed">
      <p>
        AI MathOCR(이하 &ldquo;서비스&rdquo;)은 「개인정보 보호법」 등 관련 법령을
        준수하며, 이용자의 개인정보를 보호하기 위하여 다음과 같이
        개인정보처리방침을 수립·공개합니다.
      </p>

      {/* 제1조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제1조 (수집하는 개인정보의 항목 및 수집 방법)
        </h2>
        <p className="mb-2">
          서비스는 회원가입 및 서비스 제공을 위해 다음의 개인정보를 수집합니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-zinc-900">회원가입(필수):</strong> 이메일
            주소, 비밀번호(암호화하여 저장), (선택) 프로모션 코드
          </li>
          <li>
            <strong className="text-zinc-900">서비스 이용 시 자동 생성·수집:</strong>{" "}
            변환 이력(업로드 파일명, 문제·해설 수, 변환 상태 및 일시), 오류 로그(오류
            유형·메시지·기술 정보), 접속 및 이용 기록, IP 주소, 쿠키
          </li>
          <li>
            <strong className="text-zinc-900">유료 결제 시:</strong> 결제 금액,
            충전 크레딧, 결제대행사(PG) 거래 식별자, 결제 상태 (신용카드 번호 등
            결제수단 정보는 결제대행사가 처리하며 서비스는 저장하지 않습니다)
          </li>
          <li>
            <strong className="text-zinc-900">오변환 신고 시:</strong> 신고 내용,
            신고 대상 이미지(원본 및 변환 결과)
          </li>
          <li>
            <strong className="text-zinc-900">약관·개인정보 동의 시:</strong> 동의
            여부, 동의한 문서 버전, 동의 일시, 접속 IP 및 브라우저 정보(User-Agent)
          </li>
        </ul>
        <p className="mt-2">
          이용자가 업로드하는 이미지에는 개인정보(예: 시험지에 포함된 성명 등)가
          포함될 수 있으므로, 이용자는 개인정보가 불필요하게 포함되지 않도록
          유의하여야 합니다.
        </p>
      </section>

      {/* 제2조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제2조 (개인정보의 처리 목적)
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>회원 가입 의사 확인, 본인 식별·인증, 회원 자격 유지·관리</li>
          <li>OCR·AI 변환 서비스의 제공 및 크레딧의 관리</li>
          <li>유료 서비스의 결제, 환불 및 정산 처리</li>
          <li>오류 대응, 서비스 품질 개선, 부정 이용 방지 및 이용 제한</li>
          <li>공지사항 전달, 문의 응대 및 분쟁 처리</li>
          <li>서비스 이용 통계 분석 및 서비스 개선</li>
        </ul>
      </section>

      {/* 제3조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제3조 (개인정보의 보유 및 이용 기간)
        </h2>
        <p className="mb-2">
          서비스는 원칙적으로 개인정보의 처리 목적이 달성되면 지체 없이
          해당 정보를 파기합니다. 다만 다음의 정보는 명시한 기간 동안
          보유합니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>회원 정보(이메일 등): 회원 탈퇴 시까지 (탈퇴 시 지체 없이 파기)</li>
          <li>변환 이력 및 오류 로그: 수집일로부터 1년</li>
          <li>
            오변환 신고 이미지: 신고 검수 및 보상 처리가 완료되면 지체 없이 파기
          </li>
          <li>
            약관·개인정보 동의 이력: 회원 탈퇴 후에도 「전자상거래법」상 계약에 관한
            기록으로서 5년간 보존
          </li>
          <li>
            관계 법령에 따른 보존
            <ul className="list-[circle] pl-5 mt-1 space-y-1">
              <li>계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래법)</li>
              <li>대금결제 및 재화 등의 공급에 관한 기록: 5년 (전자상거래법)</li>
              <li>소비자의 불만 또는 분쟁처리에 관한 기록: 3년 (전자상거래법)</li>
              <li>표시·광고에 관한 기록: 6개월 (전자상거래법)</li>
              <li>접속(로그인) 기록: 3개월 (통신비밀보호법)</li>
            </ul>
          </li>
        </ul>
      </section>

      {/* 제4조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제4조 (개인정보의 제3자 제공)
        </h2>
        <p>
          서비스는 이용자의 개인정보를 제2조의 목적 범위 내에서만 처리하며,
          이용자의 별도 동의가 있거나 법령에 특별한 규정이 있는 경우를 제외하고는
          개인정보를 제3자에게 제공하지 않습니다.
        </p>
      </section>

      {/* 제5조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제5조 (개인정보 처리의 위탁)
        </h2>
        <p className="mb-3">
          서비스는 원활한 서비스 제공을 위하여 아래와 같이 개인정보 처리 업무를
          위탁하고 있으며, 관련 법령에 따라 위탁계약 시 개인정보의 안전한 관리를
          위한 사항을 규정하고 있습니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs md:text-sm">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-900">
                <th className="py-2 pr-3 font-semibold">수탁자</th>
                <th className="py-2 pr-3 font-semibold">위탁 업무</th>
                <th className="py-2 font-semibold">이전 국가</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["Supabase, Inc.", "회원 인증, 데이터베이스 및 파일 저장", "미국 등"],
                ["Vercel, Inc.", "웹사이트 및 서버(API) 호스팅", "미국"],
                ["Mathpix, Inc.", "수식 광학 문자 인식(OCR) 처리", "미국"],
                ["Anthropic, PBC", "인공지능 이미지 분석(Claude)", "미국"],
                ["Resend, Inc.", "이메일(인증·안내 메일) 발송", "미국"],
                ["Google LLC", "서비스 이용 통계 분석(Google Analytics)", "미국"],
                ["토스페이먼츠(주)", "신용카드 등 결제 처리", "대한민국"],
              ].map(([name, work, country]) => (
                <tr key={name} className="border-b border-zinc-100">
                  <td className="py-2 pr-3 text-zinc-900">{name}</td>
                  <td className="py-2 pr-3">{work}</td>
                  <td className="py-2">{country}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 제6조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제6조 (개인정보의 국외 이전)
        </h2>
        <p className="mb-2">
          서비스는 위 제5조의 수탁자 중 국외에 소재한 자(Supabase, Vercel,
          Mathpix, Anthropic, Resend, Google 등)에게 개인정보 처리를 위탁함에
          따라, 서비스 제공에 필요한 범위에서 개인정보가 국외로 이전됩니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-zinc-900">이전되는 개인정보 항목:</strong>{" "}
            이메일, 업로드 이미지 및 변환 결과, 이용·접속 기록 등 서비스 제공에
            필요한 정보
          </li>
          <li>
            <strong className="text-zinc-900">이전 국가:</strong> 미국 등 (각
            수탁자의 서버 소재지)
          </li>
          <li>
            <strong className="text-zinc-900">이전 일시 및 방법:</strong> 서비스
            이용 시점에 정보통신망을 통하여 전송
          </li>
          <li>
            <strong className="text-zinc-900">이용 목적 및 보유 기간:</strong>{" "}
            제2조의 목적 범위 내에서 처리하며, 처리 완료 즉시 또는 각 수탁자의
            보관 정책에 따라 파기
          </li>
          <li>
            <strong className="text-zinc-900">이전의 법적 근거:</strong> 서비스
            제공에 관한 계약의 이행 및 이용자에게 편의를 제공하기 위한 처리위탁·보관에
            해당하며, 「개인정보 보호법」 제28조의8에 근거합니다.
          </li>
          <li>
            <strong className="text-zinc-900">수탁자 연락처:</strong> 각 수탁자의
            연락처 등 세부 정보는 아래 개인정보 보호책임자에게 요청하시면 제공합니다.
          </li>
        </ul>
        <p className="mt-2">
          이용자는 서비스 이용을 중단(회원 탈퇴)함으로써 개인정보의 국외 이전을
          거부할 수 있으나, 이 경우 서비스의 전부 또는 일부를 이용할 수 없습니다.
        </p>
      </section>

      {/* 제7조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제7조 (쿠키 등 자동 수집 장치의 설치·운영 및 거부)
        </h2>
        <p>
          서비스는 이용 통계 분석(Google Analytics)을 위하여 쿠키를 사용할 수
          있습니다. 이용자는 웹 브라우저의 설정을 통해 쿠키 저장을 거부하거나
          삭제할 수 있으며, 이 경우 서비스 이용에 일부 제한이 있을 수 있습니다.
        </p>
      </section>

      {/* 제8조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제8조 (정보주체의 권리·의무 및 행사 방법)
        </h2>
        <p className="mb-2">
          이용자는 언제든지 자신의 개인정보에 대하여 다음의 권리를 행사할 수
          있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>개인정보 열람·정정·삭제 요구</li>
          <li>개인정보 처리 정지 요구</li>
          <li>회원 탈퇴를 통한 개인정보 수집·이용 동의 철회</li>
        </ul>
        <p className="mt-2">
          권리 행사는 서비스 내 기능 또는 아래 개인정보 보호책임자의 연락처를
          통하여 요청할 수 있으며, 서비스는 지체 없이 조치합니다.
        </p>
      </section>

      {/* 제9조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제9조 (개인정보의 파기)
        </h2>
        <p>
          서비스는 보유 기간의 경과 또는 처리 목적의 달성 등 개인정보가 불필요하게
          되었을 때 지체 없이 해당 개인정보를 파기합니다. 전자적 파일 형태의
          정보는 복구·재생이 불가능한 방법으로 영구 삭제하며, 그 밖의 기록물은
          분쇄하거나 소각합니다.
        </p>
      </section>

      {/* 제10조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제10조 (개인정보의 안전성 확보 조치)
        </h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>비밀번호의 암호화 저장 및 전송 구간 암호화(HTTPS)</li>
          <li>접근 권한의 최소화 및 권한 관리, 접근 통제</li>
          <li>개인정보 처리 시스템에 대한 접근 기록의 보관</li>
        </ul>
      </section>

      {/* 제11조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제11조 (개인정보 보호책임자)
        </h2>
        <p className="mb-2">
          서비스는 개인정보 처리에 관한 업무를 총괄하여 책임지고, 개인정보 처리와
          관련한 이용자의 문의·불만·피해 구제 등을 처리하기 위하여 아래와 같이
          개인정보 보호책임자를 지정하고 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>개인정보 보호책임자: 김기환 (대표)</li>
          <li>
            연락처(이메일):{" "}
            <a
              href="mailto:aimathocr.official@gmail.com"
              className="text-[var(--accent)] hover:underline"
            >
              aimathocr.official@gmail.com
            </a>
          </li>
        </ul>
      </section>

      {/* 제12조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제12조 (권익침해 구제 방법)
        </h2>
        <p className="mb-2">
          이용자는 개인정보 침해로 인한 구제를 받기 위하여 아래 기관에 분쟁 해결이나
          상담 등을 신청할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>개인정보분쟁조정위원회: (국번없이) 1833-6972 / www.kopico.go.kr</li>
          <li>개인정보침해신고센터: (국번없이) 118 / privacy.kisa.or.kr</li>
          <li>대검찰청 사이버수사과: (국번없이) 1301 / www.spo.go.kr</li>
          <li>경찰청 사이버수사국: (국번없이) 182 / ecrm.police.go.kr</li>
        </ul>
      </section>

      {/* 제13조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제13조 (개인정보처리방침의 변경)
        </h2>
        <p>
          이 개인정보처리방침은 시행일로부터 적용되며, 법령·정책 또는 서비스의
          변경에 따라 내용의 추가·삭제 및 수정이 있는 경우에는 변경 사항을 서비스
          내 공지를 통하여 고지합니다.
        </p>
      </section>

      <p className="text-xs text-zinc-400 pt-2">
        사업자 정보: 환희에듀테크랩 · 대표 김기환 · 사업자등록번호 880-61-00784
        · 통신판매업신고 2026-인천연수구-1787 · 인천광역시 연수구
        송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994 · 이메일
        aimathocr.official@gmail.com
      </p>
    </div>
  );
}
