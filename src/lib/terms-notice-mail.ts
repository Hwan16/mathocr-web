// 약관 개정 개별 고지 메일 본문 (2026-08-21 시행분)
//
// ⚠️ 이 파일은 발송 증거의 일부다. 발송 후에는 문구를 바꾸지 마라 —
//    수신자가 실제로 받은 내용과 저장소 기록이 달라진다.
//    다음 개정 때는 이 파일을 교체하지 말고 새 파일을 만들 것.
//
// 성격: 계약 이행 관련 통지(비광고). 광고성 문구·수신거부 링크를 넣지 않는다.
//       넣는 순간 정보통신망법 제50조상 광고성 정보가 되어 미동의자 발송이 위법이 된다.
// 근거: 약관 제10조 ③항(2026-08-21 시행) · 콘텐츠이용자보호지침 제6조

export const TERMS_NOTICE_SUBJECT =
  "[AI MathOCR] 서비스 이용약관 개정 안내 (2026년 8월 21일 시행)";

/** 발송 배치 식별자 — Idempotency-Key 접두사로도 쓴다. 재발송 시에도 바꾸지 말 것. */
export const TERMS_NOTICE_BATCH = "terms-notice-2026-08-21";

export const TERMS_NOTICE_HTML = `<!doctype html><html lang="ko"><body style="margin:0;background:#ffffff;">
<div style="font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Malgun Gothic",sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#27272a;line-height:1.7;font-size:15px;">
  <p style="margin:0 0 8px;">안녕하세요, AI MathOCR입니다.</p>
  <p style="margin:0 0 8px;">서비스 이용약관이 <strong>2026년 8월 21일</strong>부터 아래와 같이 개정됩니다.</p>
  <p style="margin:0 0 8px;">이용자에게 불리할 수 있는 변경이 포함되어 있어 시행일 30일 전부터 서비스 화면에 공지하고 있으며, 기존 회원께는 이 메일로 개별 안내드립니다.</p>

  <h2 style="font-size:16px;font-weight:700;color:#18181b;margin:32px 0 12px;">1) 무엇이 바뀌나요</h2>

  <h3 style="font-size:15px;font-weight:700;color:#18181b;margin:24px 0 8px;">① 제6조 제9항 (크레딧 만료 예정 안내 방법)</h3>
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">[현행]</p>
  <div style="margin:8px 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid #d4d4d8;border-radius:0 6px 6px 0;font-size:14px;color:#3f3f46;">유효기간이 경과한 크레딧은 자동으로 소멸하며, 서비스 이용 및 환불의 대상이 되지 않습니다. 제공자는 유효기간 만료 전 이용자가 등록한 이메일로 만료 예정 사실과 유효기간 연장 방법을 안내하도록 하며, 이용자의 수신 환경 등으로 안내를 수신·확인하지 못한 경우에도 소멸의 효력에는 영향이 없습니다.</div>
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">[개정안]</p>
  <div style="margin:8px 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid #d4d4d8;border-radius:0 6px 6px 0;font-size:14px;color:#3f3f46;">유효기간이 경과한 크레딧은 자동으로 소멸하며, 서비스 이용 및 환불의 대상이 되지 않습니다. 제공자는 유효기간 만료 예정 사실을 마이페이지 등 서비스 화면을 통해 안내하며, 유료 결제 이력이 있는 계정에 대해서는 만료 예정을 이용자가 등록·인증한 이메일로도 안내합니다. 유료 결제 이력이 없는 계정의 만료 예정 이메일 안내는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」에 따른 광고성 정보 수신에 동의한 이용자에게 제공됩니다. 이용자의 수신 환경 등으로 안내를 수신·확인하지 못한 경우에도 소멸의 효력에는 영향이 없습니다.</div>
  <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0 16px;">
    <tr><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">구분</th><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">현행</th><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">개정안</th></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">안내의 기본 수단</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">이메일</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">마이페이지 등 서비스 화면</td></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">유료 결제 이력이 있는 계정</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">이메일 안내</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">화면 안내 + 이메일 안내(유지)</td></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">유료 결제 이력이 없는 계정</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">이메일 안내</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">화면 안내. 이메일 안내는 광고성 정보 수신에 동의하신 경우에만</td></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">안내 내용</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">만료 예정 사실 + 유효기간 연장 방법</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">만료 예정 사실</td></tr>
  </table>
  <p style="font-size:13.5px;color:#71717a;margin:8px 0 0;">이용자에 따라 이메일 안내를 받지 못하게 될 수 있어, 불리한 변경으로 보고 30일 전에 안내드립니다.</p>

  <h3 style="font-size:15px;font-weight:700;color:#18181b;margin:24px 0 8px;">② 제10조 (약관의 변경)</h3>
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">[현행]</p>
  <div style="margin:8px 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid #d4d4d8;border-radius:0 6px 6px 0;font-size:14px;color:#3f3f46;">
    ① 제공자는 관련 법령에 위배되지 않는 범위 내에서 본 약관을 변경할 수 있으며, 변경 시 서비스 내 공지를 통해 고지합니다.<br />
    ② 변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고 탈퇴할 수 있습니다.
  </div>
  <p style="margin:0 0 4px;font-size:14px;color:#71717a;">[개정안]</p>
  <div style="margin:8px 0 16px;padding:12px 16px;background:#fafafa;border-left:3px solid #d4d4d8;border-radius:0 6px 6px 0;font-size:14px;color:#3f3f46;">
    ① 제공자는 관련 법령에 위배되지 않는 범위 내에서 본 약관을 변경할 수 있으며, 변경 시 시행일 7일 전부터 서비스 화면에 공지합니다. 다만 이용자에게 불리하거나 중대한 변경의 경우에는 시행일 30일 전부터 공지합니다.<br /><br />
    ② 변경된 약관에 동의하지 않는 이용자는 시행일 전까지 서비스 이용을 중단하고 탈퇴할 수 있으며, 공지된 시행일 이후에도 서비스를 계속 이용하는 경우 변경된 약관에 동의한 것으로 봅니다.<br /><br />
    ③ 제1항 단서에 해당하는 변경의 경우 제공자는 기존 이용자에게 변경될 약관, 적용일자 및 변경사유를 이용자가 등록·인증한 이메일 등으로 개별 고지합니다.
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin:8px 0 16px;">
    <tr><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">구분</th><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">현행</th><th style="text-align:left;padding:8px 10px;border-bottom:2px solid #e4e4e7;color:#18181b;font-weight:600;">개정안</th></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">사전 공지 기간</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">정함 없음</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">일반 변경 7일 전 / 불리·중대한 변경 30일 전</td></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">동의 간주</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">규정 없음</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">시행일 이후 계속 이용 시 동의한 것으로 간주</td></tr>
    <tr><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">개별 고지</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">규정 없음</td><td style="padding:8px 10px;border-bottom:1px solid #f4f4f5;vertical-align:top;">불리·중대한 변경 시 등록·인증한 이메일 등으로 개별 고지(③항 신설)</td></tr>
  </table>
  <p style="font-size:13.5px;color:#71717a;margin:8px 0 0;">③항은 제공자가 지는 고지 의무를 새로 추가하는 조항입니다. 시행 후에는 이와 같은 변경이 있을 때마다 등록·인증된 이메일로 개별 안내드리게 되며, 이번 안내도 같은 방식으로 보내드립니다.</p>

  <h2 style="font-size:16px;font-weight:700;color:#18181b;margin:32px 0 12px;">2) 적용일자</h2>
  <p style="margin:0;"><strong>2026년 8월 21일</strong>부터 적용됩니다. 그 전까지는 현행 약관이 그대로 적용됩니다.</p>

  <h2 style="font-size:16px;font-weight:700;color:#18181b;margin:32px 0 12px;">3) 변경 사유</h2>
  <ul style="margin:0;padding-left:20px;">
    <li style="margin-bottom:10px;"><strong>제6조 제9항</strong> — 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」상 광고성 정보 수신에 동의하지 않으신 분께는 충전 안내가 담긴 만료 안내 메일을 보내드릴 수 없어, 모든 이용자에게 이메일로 안내하겠다고 정한 현행 조문이 실제로 지킬 수 없는 약속이 되었습니다. 실제로 보내드릴 수 있는 범위에 맞게 조문을 정정합니다.</li>
    <li><strong>제10조</strong> — 현행 조문에 사전 공지 기간이 정해져 있지 않아, 콘텐츠이용자보호지침이 요구하는 공지 기간(일반 7일, 불리·중대한 변경 30일)을 약관에 명문화합니다. 아울러 불리하거나 중대한 변경일 때는 화면 공지에 더해 등록·인증하신 이메일로 개별 고지해 드리도록 ③항을 신설합니다.</li>
  </ul>

  <h2 style="font-size:16px;font-weight:700;color:#18181b;margin:32px 0 12px;">4) 동의하지 않으실 경우</h2>
  <p style="margin:0 0 8px;">개정 내용에 동의하지 않으시면 <strong>시행일(2026년 8월 21일) 전까지</strong> 서비스 이용을 중단하고 탈퇴하실 수 있습니다.</p>
  <p style="margin:0 0 8px;">탈퇴는 마이페이지 &gt; 계정 설정 &gt; 회원 탈퇴에서 하실 수 있습니다. 탈퇴 시 계정과 이용 데이터가 삭제되며 잔여 크레딧은 복구되지 않으니, 환불 대상 크레딧이 있으시면 탈퇴 전에 아래 문의처로 알려주시기 바랍니다. 다만 결제 내역과 약관·개인정보 동의 이력은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 5년간 보존 후 파기됩니다(개인정보처리방침 제3조).</p>
  <p style="margin:0;">별도의 의사표시 없이 시행일 이후에도 서비스를 계속 이용하시는 경우, 개정 약관에 동의하신 것으로 봅니다.</p>

  <div style="margin-top:36px;padding-top:20px;border-top:1px solid #e4e4e7;font-size:12.5px;color:#71717a;line-height:1.7;">
    <p style="margin:0 0 10px;">개정안 전문과 현행 약관 전문은 <a href="https://mathocr.ai.kr/terms" style="color:#7c3aed;">이용약관 페이지</a>에서 확인하실 수 있습니다.</p>
    <p style="margin:0 0 10px;">본 메일은 회원님과 체결된 서비스 이용약관의 개정 사실을 알려드리는 계약 관련 통지이며, 광고성 정보가 아닙니다. 따라서 광고성 정보 수신 동의 여부 및 수신거부 설정과 관계없이 모든 회원님께 발송됩니다.</p>
    <p style="margin:0;">문의: <a href="mailto:aimathocr.official@gmail.com" style="color:#7c3aed;">aimathocr.official@gmail.com</a><br />환희에듀테크랩 · 대표 김기환 · 인천광역시 연수구 송도문화로84번길 24, 206동 201호 · 전화 010-4552-5994 · 통신판매업 신고 2026-인천연수구-1787</p>
  </div>
</div>
</body></html>`;
