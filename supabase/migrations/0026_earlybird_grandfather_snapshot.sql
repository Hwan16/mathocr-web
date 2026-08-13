-- 0026: 얼리버드 종료 대상 고정 + DB 이중 가드 (2026-08-14)
--
-- 0025는 종료 전 지급 대기자 수만 max_uses에 더해 두었다. 그러나 지급 대기
-- 꼬리표가 auth.users.raw_user_meta_data에 있어, 종료 전 기존 사용자가 본인
-- metadata를 바꾸면 진짜 대기자의 자리를 차지할 수 있었다.
--
-- 이 마이그레이션은 실행 시점의 진짜 미상환 대기자를 서버 전용 테이블에
-- 스냅샷하고, redeem_promo_code가 earlybird를 지급할 때 그 명단을 직접 검사한다.
-- 웹의 사전 검사와 별개인 DB 최종 방어선이다.

-- ============================================
-- 1. 종료 시점 고정 명단
-- ============================================
create table if not exists public.earlybird_grandfathered_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  snapshotted_at timestamptz not null default now(),
  redeemed_at timestamptz
);

alter table public.earlybird_grandfathered_users enable row level security;
revoke all on table public.earlybird_grandfathered_users from public, anon, authenticated;
grant select, insert, update, delete on table public.earlybird_grandfathered_users to service_role;

insert into public.earlybird_grandfathered_users (user_id)
select u.id
from auth.users u
where lower(coalesce(u.raw_user_meta_data ->> 'pending_promo_code', '')) = 'earlybird'
  and u.created_at < timestamptz '2026-08-14 00:00:00+09'
  and not exists (
    select 1
    from public.promo_redemptions pr
    join public.promo_codes pc on pc.id = pr.promo_code_id
    where pc.code = 'earlybird'
      and pr.user_id = u.id
  )
on conflict (user_id) do nothing;

-- 탈퇴 사용자까지 실제 지급 '행 수'로 세고, 아직 받을 고정 명단 수를 더한다.
-- 0025의 UNION user_id 집계가 null 탈퇴자를 하나로 합칠 수 있던 이론상 오차도 제거한다.
update public.promo_codes pc
set max_uses = (
      select count(*)::integer
      from public.promo_redemptions pr
      where pr.promo_code_id = pc.id
    ) + (
      select count(*)::integer
      from public.earlybird_grandfathered_users eg
      where eg.redeemed_at is null
    ),
    memo = '2026-08-14 얼리버드 종료. 서버 고정 명단만 인증 후 자동 지급. 명단 처리 완료 뒤 비활성화.'
where pc.code = 'earlybird';

-- ============================================
-- 2. 상환 함수: earlybird는 signup + 고정 명단만 허용
-- ============================================
create or replace function public.redeem_promo_code(
  p_user_id uuid,
  p_code text,
  p_source text default 'mypage',
  p_normalized_email text default null,
  p_ip text default null
)
returns jsonb as $$
declare
  v_promo record;
  v_email text;
  v_use_count integer;
  v_ip_count integer;
  v_new_credits integer;
  v_new_expires timestamptz;
  v_earlybird_eligible boolean;
begin
  if p_source not in ('mypage', 'signup', 'system') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  select id, code, credits, max_uses, is_active, validity_days into v_promo
  from public.promo_codes
  where code = lower(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if not v_promo.is_active and p_source <> 'system' then
    return jsonb_build_object('success', false, 'error', 'inactive_code');
  end if;

  -- 종료된 얼리버드는 일반 코드처럼 쓸 수 없다. 가입 경로이면서 종료 때
  -- 서버가 고정한 명단에 남아 있는 계정만 허용한다.
  if v_promo.code = 'earlybird' then
    select exists (
      select 1
      from public.earlybird_grandfathered_users eg
      where eg.user_id = p_user_id
        and eg.redeemed_at is null
    ) into v_earlybird_eligible;

    if p_source <> 'signup' or not v_earlybird_eligible then
      return jsonb_build_object('success', false, 'error', 'not_eligible');
    end if;
  end if;

  select email into v_email
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if exists (
    select 1 from public.promo_redemptions
    where promo_code_id = v_promo.id and user_id = p_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end if;

  if p_normalized_email is not null and exists (
    select 1 from public.promo_redemptions
    where promo_code_id = v_promo.id and normalized_email = p_normalized_email
  ) then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end if;

  if p_ip is not null then
    select count(*) into v_ip_count
    from public.promo_redemptions
    where promo_code_id = v_promo.id
      and ip = p_ip
      and created_at > now() - interval '24 hours';

    if v_ip_count >= 2 then
      return jsonb_build_object('success', false, 'error', 'ip_limit');
    end if;
  end if;

  if v_promo.max_uses is not null then
    select count(*) into v_use_count
    from public.promo_redemptions
    where promo_code_id = v_promo.id;

    if v_use_count >= v_promo.max_uses then
      return jsonb_build_object('success', false, 'error', 'exhausted');
    end if;
  end if;

  begin
    insert into public.promo_redemptions
      (promo_code_id, user_id, email, credits_granted, source, normalized_email, ip)
    values
      (v_promo.id, p_user_id, v_email, v_promo.credits, p_source, p_normalized_email, p_ip);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end;

  if v_promo.validity_days is not null then
    update public.profiles
    set credits = case
          when expires_at is not null and expires_at < now() then v_promo.credits
          else credits + v_promo.credits
        end,
        expires_at = greatest(
          coalesce(expires_at, now()),
          now() + make_interval(days => v_promo.validity_days)
        )
    where id = p_user_id
    returning credits, expires_at into v_new_credits, v_new_expires;
  else
    update public.profiles
    set credits = credits + v_promo.credits
    where id = p_user_id
    returning credits, expires_at into v_new_credits, v_new_expires;
  end if;

  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (p_user_id, 0, v_promo.credits, 'promo_' || v_promo.id::text || '_' || p_user_id::text, 'completed');

  if v_promo.code = 'earlybird' then
    update public.earlybird_grandfathered_users
    set redeemed_at = now()
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'credits_granted', v_promo.credits,
    'new_credits', v_new_credits,
    'expires_at', v_new_expires
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.redeem_promo_code(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text, text, text) to service_role;
