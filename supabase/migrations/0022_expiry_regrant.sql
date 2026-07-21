-- 0022: 만료 크레딧 재지급(RE_EARLYBIRD) — 서버 전용 'system' 상환 경로
--
-- 배경: 유효기간 만료로 10크레딧 이상을 못 쓰고 날린 사용자에게 re_earlybird
--       코드(30크레딧·유효 7일)를 자동 재지급하는 cron(/api/cron/expiry-regrant)을
--       추가한다. 이 코드는 공개 상환 경로(마이페이지 입력·가입 시 입력)로는
--       절대 쓸 수 없어야 하므로 비활성(is_active=false)으로 유지하고,
--       서버 전용 'system' 소스만 비활성 코드를 상환할 수 있게 한다.
--
--  · redeem_promo_code p_source 에 'system' 추가 — RPC 는 service_role 전용이고
--    공개 라우트(redeem/signup)는 'mypage'/'signup'만 넘기므로 클라이언트가
--    'system'에 도달할 수 없다.
--  · 'system'은 is_active 검사만 건너뛴다. 계정당 1회(promo_redemptions
--    user_id 검사)·max_uses·유효기간 연장 모델(0011)은 그대로 적용된다.
--    → 재지급은 계정당 평생 1회: 한 번 받은 사용자가 다시 만료로 날려도
--      already_redeemed 로 걸러진다.
--  · re_earlybird 코드 row upsert: max_uses 해제(cron 이 계속 쓰도록)·비활성 고정.
--    (2026-07-22 수동 재지급 2건 때 max_uses=2 로 생성된 row 를 재사용)
--
-- 배포 순서: 이 마이그레이션 먼저 → 웹 코드 배포. 미적용 상태에서 cron 이 돌면
--            'system'이 invalid_source 로 거부되어 아무것도 지급되지 않는다(fail-closed).

-- ============================================
-- 1. promo_redemptions.source 에 'system' 허용
-- ============================================
alter table public.promo_redemptions
  drop constraint if exists promo_redemptions_source_check;
alter table public.promo_redemptions
  add constraint promo_redemptions_source_check
  check (source in ('mypage', 'signup', 'system'));

-- ============================================
-- 2. redeem_promo_code 갱신 ('system' 소스 — 0013 본문 기준, 변경점 2곳 주석)
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
begin
  -- [0022 변경 1/2] 'system' 소스 허용
  if p_source not in ('mypage', 'signup', 'system') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  select id, credits, max_uses, is_active, validity_days into v_promo
  from public.promo_codes
  where code = lower(btrim(coalesce(p_code, '')))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  -- [0022 변경 2/2] 'system'만 비활성 코드 상환 가능 (공개 경로는 기존과 동일하게 차단)
  if not v_promo.is_active and p_source <> 'system' then
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

  -- 가드 A: 같은 사람의 이메일 알리아스 변형(a+1@, a.b@ 등) 재수령 차단.
  -- 탈퇴한 이력(user_id null)도 normalized_email 이 남아 있어 함께 걸린다.
  if p_normalized_email is not null and exists (
    select 1 from public.promo_redemptions
    where promo_code_id = v_promo.id and normalized_email = p_normalized_email
  ) then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end if;

  -- 가드 B: 같은 IP 에서 같은 코드 24시간 내 2회까지 (학원 공용망 고려)
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
    -- 유효기간 지정 코드: 플랜 충전과 동일한 연장 모델 (0011)
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
    -- 유효기간 미지정 코드: 크레딧만 지급, 만료일 그대로
    update public.profiles
    set credits = credits + v_promo.credits
    where id = p_user_id
    returning credits, expires_at into v_new_credits, v_new_expires;
  end if;

  -- 크레딧 증감 이력 일원화를 위해 payments 에도 기록
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
revoke execute on function public.redeem_promo_code(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text, text, text) to service_role;

-- ============================================
-- 3. profiles.regrant_mail_due — 재지급 광고 메일 미발송 표시 (재시도용)
-- ============================================
-- 재지급은 계정당 평생 1회라서 지급 후 메일 발송이 실패하면 다시 알릴 기회가 없다.
-- cron 이 지급 직후 메일 재료({lost, lost_at, new_expires})를 여기에 기록하고
-- 발송 성공 시 null 로 지운다. 남아 있으면 다음 실행이 재발송을 시도한다.
-- (그 사이 수신거부한 계정은 발송 없이 표시만 지운다 — 정보통신망법 준수)
alter table public.profiles
  add column if not exists regrant_mail_due jsonb;

-- ============================================
-- 4. re_earlybird 코드 정비 — max_uses 해제 · 비활성 고정
-- ============================================
insert into public.promo_codes (code, credits, max_uses, validity_days, is_active, memo)
values ('re_earlybird', 30, null, 7, false,
        '만료 크레딧 자동 재지급(계정당 1회) — cron 전용(system 소스). 공개 상환 차단을 위해 항상 비활성 유지. 재지급 중단 시 이 row 삭제가 아니라 cron 제거로 처리할 것 (2026-07-22)')
on conflict (code) do update
  set credits = excluded.credits,       -- 30·7일을 명시적으로 고정 (기존 row 값이 다르면 교정)
      validity_days = excluded.validity_days,
      max_uses = null,
      is_active = false,
      memo = excluded.memo;
