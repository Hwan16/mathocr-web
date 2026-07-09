-- 0011: 프로모션 코드별 유효기간(validity_days)
--
-- 배경: redeem_promo_code 가 크레딧만 더하고 expires_at 을 건드리지 않아,
-- 가입 시 프로모션 코드로 받은 크레딧이 무료 5크레딧의 7일 유효기간에 묶여
-- 함께 소멸했다. 코드 생성 시 유효기간(일)을 지정할 수 있게 하고, 지정된
-- 코드를 상환하면 플랜 충전(grant_plan_credits, 0009)과 동일한 연장 모델을
-- 적용한다.
--
--  · validity_days null = 기존 동작 유지 (계정 만료일 따름, 연장 없음)
--  · validity_days n    = expires_at = greatest(기존 만료일, now() + n일)
--                         → 절대 줄어들지 않음, 잔여 크레딧도 함께 연장
--                         만료된 계정이면 만료 잔여분 소멸 후 신규 지급 (플랜과 동일)

-- ============================================
-- 1. promo_codes.validity_days 컬럼
-- ============================================
alter table public.promo_codes
  add column if not exists validity_days integer
  check (validity_days is null or (validity_days >= 1 and validity_days <= 3650));

-- ============================================
-- 2. 상환 함수 갱신 (validity_days 반영)
-- ============================================
create or replace function public.redeem_promo_code(
  p_user_id uuid,
  p_code text,
  p_source text default 'mypage'
)
returns jsonb as $$
declare
  v_promo record;
  v_email text;
  v_use_count integer;
  v_new_credits integer;
  v_new_expires timestamptz;
begin
  if p_source not in ('mypage', 'signup') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  select id, credits, max_uses, is_active, validity_days into v_promo
  from public.promo_codes
  where code = lower(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if not v_promo.is_active then
    return jsonb_build_object('success', false, 'error', 'inactive_code');
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

  if v_promo.max_uses is not null then
    select count(*) into v_use_count
    from public.promo_redemptions
    where promo_code_id = v_promo.id;

    if v_use_count >= v_promo.max_uses then
      return jsonb_build_object('success', false, 'error', 'exhausted');
    end if;
  end if;

  begin
    insert into public.promo_redemptions (promo_code_id, user_id, email, credits_granted, source)
    values (v_promo.id, p_user_id, v_email, v_promo.credits, p_source);
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end;

  if v_promo.validity_days is not null then
    -- 유효기간 지정 코드: 플랜 충전과 동일한 연장 모델
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
    -- 유효기간 미지정 코드: 기존 동작 (크레딧만 지급, 만료일 그대로)
    update public.profiles
    set credits = credits + v_promo.credits
    where id = p_user_id
    returning credits, expires_at into v_new_credits, v_new_expires;
  end if;

  -- 크레딧 증감 이력 일원화를 위해 payments 에도 기록 (관리자 수동 부여와 동일 패턴)
  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (p_user_id, 0, v_promo.credits, 'promo_' || v_promo.id::text || '_' || p_user_id::text, 'completed');

  return jsonb_build_object(
    'success', true,
    'credits_granted', v_promo.credits,
    'new_credits', v_new_credits,
    'expires_at', v_new_expires
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- create or replace 는 기존 권한을 유지하지만, 명시적으로 재선언해 둔다.
revoke execute on function public.redeem_promo_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text) to service_role;
