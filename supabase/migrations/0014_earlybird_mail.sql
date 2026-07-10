-- 0014: 얼리버드 오픈 메일 발송 기록
--
-- 배경: 결제 오픈 날 관리자 대시보드 [오픈 메일 발송] 버튼 한 번으로 마케팅 수신
--       동의자(profiles.marketing_opt_in, 0013) 전원에게 안내 메일을 보낸다.
--       Resend 무료 티어(일 100통) 때문에 한 번에 90명씩 배치 발송하므로,
--       "누구에게 이미 보냈는지"를 기록해 중복 발송을 막고 이어서 보낼 수 있게 한다.
--
-- null = 미발송, timestamptz = 발송 완료 시각.
alter table public.profiles
  add column if not exists earlybird_mail_sent_at timestamptz;
