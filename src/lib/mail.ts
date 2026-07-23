// 발송 메일 공통 주소 상수 — 고객에게 나가는 메일의 단일 출처.
//
// 배경(2026-07-23): 모든 발신이 noreply@mathocr.ai.kr 인데 이 도메인에는 메일
// 수신 설정(MX)이 없다. 본문 하단에 문의 주소를 적어두긴 했지만, 사람들은
// 그걸 읽고 새 메일을 쓰는 대신 **답장 버튼을 누른다** → 반송된다.
// 고객 입장에서는 "문의했는데 무시당했다"가 되므로, 발신 주소는 그대로 두고
// 답장만 실제 수신 가능한 주소로 돌린다(Resend REST API의 reply_to 필드).
//
// 관리자 경보(admin-alert.ts·ocr-guard.ts)는 수신자가 운영자 본인이라 불필요.

/** 고객 문의 접수 주소 — 실제 수신 가능(지메일). 메일 본문 하단 표기와 동일. */
export const SUPPORT_EMAIL = "aimathocr.official@gmail.com";

/** 고객향 메일의 답장 주소. Resend REST API 필드명은 snake_case(reply_to). */
export const REPLY_TO = SUPPORT_EMAIL;
