-- ============================================================
-- 0010_account_deletion.sql
-- 회원 탈퇴 기능(B8) — 결제 기록의 법정 보존 대비.
-- Supabase SQL Editor에서 1회 실행하면 된다.
--
-- 배경: payments.user_id 가 profiles(id) 를 ON DELETE CASCADE 로 참조하여,
-- 탈퇴(auth 계정 삭제 → 프로필 cascade 삭제) 시 결제 기록까지 함께 삭제된다.
-- 그러나 개인정보처리방침 제3조와 전자상거래법은 "대금결제 및 재화 등의
-- 공급에 관한 기록"을 5년간 보존하도록 요구한다.
--
-- user_consents 보존(0007)과 동일한 방식으로 전환한다:
--   1) user_id 를 nullable + ON DELETE SET NULL → 탈퇴 시 행은 남고 링크만 해제
--   2) email 스냅샷 칼럼 추가 → user_id 가 null 이 된 뒤에도 '누구의 결제인지' 식별
--      (스냅샷은 탈퇴 API가 계정 삭제 직전에 본인 행에 기록한다.
--       이 마이그레이션이 적용되기 전에는 탈퇴 API가 스냅샷 단계에서 실패하고
--       계정 삭제까지 진행하지 않으므로, 적용 순서가 늦어도 기록이 유실되지 않는다)
--
-- 나머지 테이블은 기존 정책 유지:
--   conversions / error_logs / conversion_reports → cascade 삭제 (탈퇴 시 파기)
--   user_consents / promo_redemptions → SET NULL + email 스냅샷 (이미 적용됨)
-- ============================================================

-- 1) 기존 FK 제거
alter table public.payments
  drop constraint if exists payments_user_id_fkey;

-- 2) user_id nullable 로 완화(SET NULL 을 쓰려면 필요)
alter table public.payments
  alter column user_id drop not null;

-- 3) FK 를 ON DELETE SET NULL 로 재생성
alter table public.payments
  add constraint payments_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- 4) 탈퇴 후 식별용 이메일 스냅샷
alter table public.payments
  add column if not exists email text;

comment on column public.payments.email is
  '탈퇴 후 결제 기록 식별용 이메일 스냅샷 (탈퇴 API가 계정 삭제 직전 기록, 전자상거래법 5년 보존)';
