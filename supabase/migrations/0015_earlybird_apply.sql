-- 0015: 얼리버드 신청제 전환 (사용자 결정 2026-07-11)
--
-- 배경: "오픈 전에 30문제를 즉시 뿌리는 건 부담" → 즉시 지급(0013 방식)을 중단하고
--       이메일 사전 신청만 받는다. 오픈 날 신청자에게 프로모 코드(earlybird, 25크레딧)
--       메일을 발송해 그때 가입·상환하게 한다. earlybird 코드는 오픈까지 비활성 보관.
--
-- 이 마이그레이션이 하는 것: 신청자 테이블 신설 (회원 아님 — 이메일 리드).
--   · normalized_email unique: 지메일 알리아스 변형 중복 신청 차단 (0013과 같은 정규화)
--   · utm_*: 어느 채널에서 온 신청인지 (M4 규약)
--   · mail_sent_at: 오픈 메일 발송 기록 (중복 발송 방지·배치 이어 보내기)
--   · unsubscribed_at: 수신거부 (발송 대상 제외)
--   · 수신 동의 감사는 user_consents(user_id null, doc_type 'marketing')에 함께 기록
create table if not exists public.earlybird_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  ip text,
  user_agent text,
  mail_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_earlybird_signups_created_at
  on public.earlybird_signups (created_at);

-- 클라이언트 직접 접근 없음 (전부 서버 service_role 경유)
alter table public.earlybird_signups enable row level security;
