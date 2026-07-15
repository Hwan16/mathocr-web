-- 0018: 온보딩 메일 2통 (마케팅 백로그 §6-2, docs/MARKETING_CONSULTING_2026-07-12.md)
--
-- 환영 메일(크레딧 지급 후 1회) + D+4 미사용자 리마인드(1회)의 발송 기록.
-- 발송 대상은 마케팅 수신 동의자(profiles.marketing_opt_in=true, LA-09)로 한정하고,
-- 이 컬럼들이 "정확히 1회 발송"을 보장한다 (null = 미발송).
--
-- 실행: Supabase SQL Editor에서 이 파일 전체 실행 (약 1초, 잠금 없음)
-- 배포 순서: 이 마이그레이션 실행 → 코드 배포 (코드는 컬럼 부재 시 발송을
-- 건너뛰는 fail-closed 폴백이 있어 역순이어도 사고는 없지만, 그동안 발송이 멈춘다)

alter table public.profiles
  add column if not exists onboarding_welcome_sent_at timestamptz,
  add column if not exists onboarding_reminder_sent_at timestamptz;

comment on column public.profiles.onboarding_welcome_sent_at is
  '온보딩 환영 메일(크레딧 지급 안내) 발송 시각 — null = 미발송 (0018)';
comment on column public.profiles.onboarding_reminder_sent_at is
  '온보딩 D+4 미사용 리마인드 발송 시각 — null = 미발송 (0018)';
