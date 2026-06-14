-- ============================================================
-- 0003_report_accept_invariant.sql
-- '채택(accepted)' 상태는 보상 지급(rewarded=true)된 신고에만 허용한다.
--
-- 채택은 reward_report()를 통해서만 일어나야 한다(상태+보상을 한 UPDATE로 동시 설정).
-- 일반 상태 변경 경로(PATCH status)로 status='accepted'를 만들면 보상 없이 채택된
-- 불일치 신고가 생길 수 있으므로, DB 레벨에서 이를 차단한다.
--
-- 0002 적용 후 실행하는 후속 마이그레이션. Supabase SQL Editor에서 1회 실행.
-- ============================================================

alter table public.conversion_reports
  drop constraint if exists conversion_reports_accepted_requires_reward;

alter table public.conversion_reports
  add constraint conversion_reports_accepted_requires_reward
  check (status <> 'accepted' or rewarded = true);
