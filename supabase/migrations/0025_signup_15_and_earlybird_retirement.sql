-- 0025: 얼리버드 종료 + 상시 가입/재체험 15크레딧 전환 (2026-08-14)
--
-- 사용자 결정:
--   · 신규 가입자는 프로모션 코드 없이 기본 15크레딧(7일)을 받는다.
--   · 얼리버드 신규 적용은 종료한다.
--   · 만료 후 계정당 1회 제공하는 재체험 크레딧도 30 → 15로 맞춘다.
--
-- 기존 얼리버드 지급 대기자는 광고 당시 약속을 보호한다. 앱 서버가 가입 생성
-- 시각(2026-08-14 00:00 KST 이전)을 확인한 뒤에만 기존 earlybird 코드를 상환한다.
-- 따라서 코드는 당분간 활성 상태를 유지하되, 이미 지급된 계정 + 지급 대기 계정 수로
-- max_uses를 잠가 새 자리가 늘어나지 않게 한다. 공개 검증·신규 가입 경로는 앱에서
-- 항상 마감으로 처리한다.

-- 1. 신규 가입 기본 지급: 5 → 15 (기존 사용자 잔액은 변경하지 않음)
alter table public.profiles
  alter column credits set default 15;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, credits, expires_at)
  values (new.id, new.email, 15, now() + interval '7 days');
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 2. 기존 얼리버드 풀을 '이미 지급 + 종료 전 지급 대기' 수로 고정한다.
with earlybird_eligible_users as (
  select pr.user_id
  from public.promo_redemptions pr
  join public.promo_codes pc on pc.id = pr.promo_code_id
  where pc.code = 'earlybird'

  union

  select u.id
  from auth.users u
  where lower(coalesce(u.raw_user_meta_data ->> 'pending_promo_code', '')) = 'earlybird'
    and u.created_at < timestamptz '2026-08-14 00:00:00+09'
),
earlybird_cap as (
  select count(*)::integer as cap
  from earlybird_eligible_users
)
update public.promo_codes pc
set max_uses = earlybird_cap.cap
from earlybird_cap
where pc.code = 'earlybird';

-- 3. 만료 후 재체험 지급: 30 → 15 (기존 지급분·이력은 소급 변경하지 않음)
update public.promo_codes
set credits = 15
where code = 're_earlybird';
