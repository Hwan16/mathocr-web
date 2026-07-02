-- 0007_user_consents_retention.sql
-- 동의 이력을 "회원 탈퇴 후에도" 감사·분쟁 대비로 보존하기 위한 변경.
-- (전자상거래법상 계약에 관한 기록 5년 보존 근거 → 개인정보처리방침에 명시)
--
-- 배경: 0006 에서는 user_id 가 profiles(id) 를 ON DELETE CASCADE 로 참조하여,
-- 회원(프로필) 삭제 시 동의 증적까지 함께 지워졌다. append-only 감사 로그
-- 목적과 충돌하므로 아래와 같이 변경한다.
--   1) user_id 를 nullable + ON DELETE SET NULL → 프로필 삭제 시 행은 남고 링크만 해제
--   2) email 스냅샷 보존 → user_id 가 null 이 된 뒤에도 '누가 동의했는지' 식별
--   3) user_agent 저장 → 감사 보강(선택 정보)

-- 1) 기존 FK(cascade) 제거
alter table public.user_consents
  drop constraint if exists user_consents_user_id_fkey;

-- 2) user_id nullable 로 완화(SET NULL 을 쓰려면 필요)
alter table public.user_consents
  alter column user_id drop not null;

-- 3) FK 를 ON DELETE SET NULL 로 재생성
alter table public.user_consents
  add constraint user_consents_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- 4) 탈퇴 후 식별용 email 스냅샷 + 감사 보강용 user_agent
alter table public.user_consents
  add column if not exists email text;

alter table public.user_consents
  add column if not exists user_agent text;
