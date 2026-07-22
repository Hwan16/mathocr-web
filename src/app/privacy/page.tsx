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
          <p className="text-zinc-500 text-sm mt-2">
            시행일: 2026년 7월 22일 (최초 시행 2026년 7월 8일 · 7월 11일 개정:
            제7조의2 온라인 맞춤형 광고 고지 신설 · 7월 12일 개정: 수탁자 표에
            나이스페이먼츠·Upstash 추가 · 7월 21일 개정: 제7조의2에 네이버
            프리미엄 로그분석 추가 · 7월 22일 개정: 메타 픽셀 국외 이전 고지 및
            행태정보 항목 보완, 이전받는 자의 연락처·이전의 법적 근거 명시 및
            보유 기간 구체화)
          </p>
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
          <li>
            이벤트·혜택 등 마케팅 정보 전달 (수신에 동의한 회원에 한하며,
            수신 거부는 언제든 가능)
          </li>
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
          개인정보를 제3자에게 제공하지 않습니다. 다만 온라인 맞춤형 광고를 위한
          행태정보의 처리 및 그에 따른 국외 이전은 제6조 및 제7조의2에서 정하는
          바에 따릅니다.
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
                ["Upstash, Inc.", "API 요청 횟수 제한(비정상 접근 방지) 처리", "미국"],
                ["나이스페이먼츠(주)", "신용카드 등 결제 처리", "대한민국"],
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
          Mathpix, Anthropic, Resend, Google, Upstash 등)에게 개인정보 처리를
          위탁함에 따라, 서비스 제공에 필요한 범위에서 개인정보가 국외로
          이전됩니다.
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
        {/* 아래 메타 픽셀 국외 이전 블록 — 위 위탁 이전과 달리 서비스 기능과
            무관하므로, 거부 효과 문장(회원 탈퇴)이 이 블록에 걸리지 않도록
            반드시 이 위치보다 앞에 둘 것.
            2026-07-22 2차 개정: 이전받는 자의 명칭·주소·문의 경로를 본문에 직접
            기재(법 제28조의8 제2항 제3호가 요구하는 '명칭과 연락처'), 이벤트
            데이터 보유 기간(최대 2년 — 메타 비즈니스 도구 약관)을 명시,
            거부 경로를 이 블록 안에 직접 노출.
            ⚠️ '이전의 법적 근거'로 제28조의8 제1항 제3호(계약 이행에 필요한
            처리위탁·보관)를 인용하지 말 것 — 맞춤형 광고는 계약 이행에 필요한
            처리가 아니고, 바로 아래 '거부해도 서비스 이용에 제한 없음'과
            정면으로 모순된다. 동의 기반(제1항 제1호)으로 전환하려면 쿠키 동의
            배너로 이전 전에 동의를 받아야 하는데, 2026-07-22 사용자 결정으로
            배너는 도입하지 않았다(트래픽 확대 시 재검토 — CHECKLIST Phase 81).
            그때까지는 조항을 단정하지 않고 제2항 각 호 공개 사실만 서술한다. */}
        <p className="mt-4 mb-2">
          또한 서비스는 온라인 맞춤형 광고 및 광고 성과 측정을 위하여 광고 사업자가
          제공하는 도구(메타 픽셀)를 이용하고 있으며, 이에 따라 아래와 같이
          개인정보가 국외로 이전됩니다. 행태정보의 수집·이용에 관한 자세한 내용은
          제7조의2에서 정합니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong className="text-zinc-900">이전받는 자(명칭 및 연락처):</strong>{" "}
            Meta Platforms, Inc. · 주소: 1 Meta Way, Menlo Park, California
            94025, USA · 대표 전화: +1-650-543-4800 · 개인정보 관련 문의 및 권리
            행사:{" "}
            <a
              href="https://help.meta.com/support/privacy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline break-all"
            >
              help.meta.com/support/privacy
            </a>{" "}
            (메타의 개인정보처리방침은{" "}
            <a
              href="https://www.facebook.com/privacy/policy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline break-all"
            >
              facebook.com/privacy/policy
            </a>
            에서 확인할 수 있습니다)
          </li>
          <li>
            <strong className="text-zinc-900">이전되는 국가:</strong> 미국
          </li>
          <li>
            <strong className="text-zinc-900">이전 일시 및 방법:</strong> 이용자가
            서비스를 이용하는 시점에 이용자의 브라우저에서 정보통신망을 통하여 전송
          </li>
          <li>
            <strong className="text-zinc-900">이전되는 개인정보 항목:</strong>{" "}
            웹사이트 방문·페이지 조회 정보, 쿠키·기기·브라우저 식별 정보,
            회원가입·결제 완료 등 전환 이벤트의 발생 사실 및 결제 금액 (성명·이메일
            등 개인을 직접 식별하는 정보는 이전하지 않습니다)
          </li>
          <li>
            <strong className="text-zinc-900">이용 목적 및 보유 기간:</strong>{" "}
            맞춤형 광고 제공 및 광고 성과 측정을 위하여 이용합니다. 메타는 자사
            비즈니스 도구 약관에 따라 이벤트 데이터를 최대 2년간 보유할 수
            있으며, 이 중 픽셀 기반 맞춤 타겟의 구성원 유지 기간은 최대
            180일입니다.
          </li>
          <li>
            <strong className="text-zinc-900">이전에 관한 고지:</strong>{" "}
            서비스는 이 이전에 관하여 이전받는 자, 이전되는 국가, 이전 일시 및
            방법, 이전되는 개인정보 항목, 이용 목적 및 보유 기간, 거부 방법·절차
            및 거부의 효과를 이 개인정보처리방침에 공개하고 있습니다. 이용자는
            아래 &lsquo;거부 방법 및 절차&rsquo;에 따라 언제든지 이 이전을 거부할
            수 있습니다.
          </li>
          <li>
            <strong className="text-zinc-900">거부 방법 및 절차:</strong> 이용자는
            다음의 방법으로 이 국외 이전을 거부할 수 있습니다.
            <ul className="list-[circle] pl-5 mt-1 space-y-1">
              <li>
                웹 브라우저의 설정에서 쿠키를 차단하거나 삭제 (브라우저별 설정 &gt;
                개인정보·보안 메뉴)
              </li>
              <li>
                메타 광고 설정(
                <a
                  href="https://www.facebook.com/adpreferences"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] hover:underline break-all"
                >
                  facebook.com/adpreferences
                </a>
                )에서 맞춤형 광고 표시 해제
              </li>
              <li>
                광고 추적을 차단하는 브라우저 확장 프로그램 사용
              </li>
            </ul>
            <span className="block mt-1">
              메타 픽셀 관련 쿠키를 차단하거나 메타 광고 설정에서 맞춤형 광고를
              해제하더라도 서비스 이용에는 제한이 없으며, 맞춤형 광고 제공과 광고
              성과 측정만 이루어지지 않습니다. 다만 브라우저에서 모든 쿠키를
              차단하는 경우에는 제7조에 따라 로그인 유지 등 서비스 이용에 제한이
              있을 수 있습니다.
            </span>
          </li>
        </ul>
      </section>

      {/* 제7조 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제7조 (쿠키 등 자동 수집 장치의 설치·운영 및 거부)
        </h2>
        <p>
          서비스는 이용 통계 분석(Google Analytics)과 온라인 맞춤형 광고 및 광고
          성과 측정을 위한 광고 사업자의 도구(메타 픽셀 등 — 자세한 내용은
          제7조의2 참조)를 위하여 쿠키를 사용할 수 있습니다. 이용자는 웹 브라우저의
          설정을 통해 쿠키 저장을 거부하거나 삭제할 수 있으며, 이 경우 서비스
          이용에 일부 제한이 있을 수 있습니다.
        </p>
      </section>

      {/* 제7조의2 — 2026-07-11 신설: 메타 픽셀 등 맞춤형 광고 도구 도입 대비 고지.
          2026-07-21 개정: 네이버 프리미엄 로그분석(검색광고 전환 추적) 병기.
          2026-07-22 개정: 전환 이벤트(가입·결제 완료)와 결제 금액을 수집 항목에
          명시, 광고 사업자 소재 국가 병기, 네이버 보유기간·거부 방법 추가.
          2026-07-22 2차 개정: 메타 이벤트 데이터 보유 기간(최대 2년)을 제6조와
          동일 기준으로 명시, 네이버는 공개된 수치가 없어 확인 경로 안내로 변경
          (⚠️ 전환추적기간 15~20일은 광고 성과 집계 창이지 보유기간이 아님 —
          보유기간으로 옮겨 적지 말 것).
          메타 픽셀의 국외 이전 고지는 제6조 참조.
          ⚠️ 추적 도구 활성화(NEXT_PUBLIC_META_PIXEL_ID·NEXT_PUBLIC_NAVER_WCS_ID
          설정)는 이 조항 배포 이후에만 할 것 */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">
          제7조의2 (온라인 맞춤형 광고를 위한 행태정보의 수집·이용)
        </h2>
        <p className="mb-2">
          ① 서비스는 이용자에게 관련성 높은 광고를 제공하기 위하여 다음과 같이
          행태정보를 수집·이용할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            수집하는 행태정보의 항목: 웹사이트 방문 이력, 페이지 조회·클릭 등
            서비스 내 활동 정보, 회원가입·결제 완료 등 전환 이벤트의 발생 사실 및
            결제 금액 (거래를 구분하기 위한 임의의 문자열이 함께 전송될 수 있으며,
            성명·이메일 등 개인을 직접 식별하는 정보는 포함하지 않습니다)
          </li>
          <li>
            수집 방법: 이용자가 웹사이트 방문 시 광고 사업자가 제공하는 도구(메타
            픽셀 — Meta Platforms, Inc. / 미국, 네이버 프리미엄 로그분석 — 네이버
            주식회사 / 대한민국)를 통한 자동 수집. 각 도구의 실제 사용 여부는 광고
            집행 상황에 따라 달라질 수 있습니다.
          </li>
          <li>
            수집 목적: 관심 기반 맞춤형 광고 제공(리타게팅) 및 광고 성과 측정
          </li>
          <li>
            보유·이용 기간: 각 광고 사업자의 정책에 따릅니다. 메타의 경우 자사
            비즈니스 도구 약관에 따라 이벤트 데이터를 최대 2년간 보유할 수
            있으며, 이 중 픽셀 기반 맞춤 타겟의 구성원 유지 기간은 최대
            180일입니다. 네이버의 경우 네이버가 별도로 정한 기간에 따르며,
            구체적인 기간은 네이버에 문의하여 확인하실 수 있습니다.
          </li>
        </ul>
        <p className="mt-2 mb-2">
          ② 이용자는 다음 방법으로 맞춤형 광고를 차단하거나 거부할 수 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>웹 브라우저의 쿠키 차단 설정 또는 차단 확장 프로그램 사용</li>
          <li>
            메타 광고 설정(facebook.com/adpreferences)에서 맞춤형 광고 표시 해제
          </li>
          <li>
            네이버 계정의 광고 설정에서 맞춤형 광고 표시 해제
          </li>
        </ul>
        <p className="mt-2">
          ③ 행태정보 수집·이용에 관한 문의는 제11조의 개인정보 보호책임자에게 할
          수 있습니다.
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
