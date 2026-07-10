-- 0013: 얼리버드 캠페인 — 어뷰징 가드 + 마케팅 수신 동의 + earlybird 코드 생성
--
-- 배경: 결제 오픈 전 얼리버드(가입 즉시 총 30문제 = 기본 5 + 코드 25, 선착순 200명)를
--       광고와 함께 돌린다. 무료 크레딧 파밍(이메일 알리아스로 다계정 가입)을 막기 위해
--       상환 함수에 두 가드를 추가하고, 혜택 조건인 "오픈 소식 메일 수신 동의"를 기록한다.
--
-- 이 마이그레이션이 하는 것:
--   1) user_consents.doc_type 에 'marketing' 허용 (수신 동의 감사 기록)
--   2) profiles.marketing_opt_in (오픈 시 얼리버드 메일 발송 대상 추출용)
--   3) promo_redemptions 에 normalized_email·ip 기록 + 코드별 정규화 이메일 unique
--      - normalized_email: gmail 계열 +알리아스/점 변형을 하나로 접은 값 (서버 계산)
--      - 탈퇴해도 행이 남으므로(user_id null) 탈퇴 후 재가입 파밍도 차단된다
--   4) redeem_promo_code 갱신: 알리아스 중복 → already_redeemed,
--      같은 IP 24시간 내 같은 코드 2회 초과 → ip_limit (학원 공용망 고려해 0이 아닌 2)
--   5) earlybird 코드 생성: 25크레딧, 선착순 200명, 유효기간 30일
--
-- 배포 순서: 이 마이그레이션 먼저 → 웹 코드 배포 (기존 배포 코드의 3-인자 호출은
--            새 함수의 기본값으로 계속 동작한다)

-- ============================================
-- 1. user_consents.doc_type 에 'marketing' 허용
-- ============================================
alter table public.user_consents
  drop constraint if exists user_consents_doc_type_check;
alter table public.user_consents
  add constraint user_consents_doc_type_check
  check (doc_type in ('terms', 'privacy', 'marketing'));

-- ============================================
-- 2. profiles.marketing_opt_in
-- ============================================
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false;

-- ============================================
-- 3. promo_redemptions: normalized_email · ip
-- ============================================
alter table public.promo_redemptions
  add column if not exists normalized_email text,
  add column if not exists ip text;

-- 같은 코드는 같은 사람(알리아스 접은 이메일)당 1회 — DB 차원 최종 방어선
create unique index if not exists uq_promo_redemptions_code_normemail
  on public.promo_redemptions (promo_code_id, normalized_email)
  where normalized_email is not null;

create index if not exists idx_promo_redemptions_code_ip
  on public.promo_redemptions (promo_code_id, ip)
  where ip is not null;

-- ============================================
-- 4. redeem_promo_code 갱신 (알리아스·IP 가드)
-- ============================================
-- 시그니처가 바뀌므로 기존 함수를 제거 후 재생성한다 (오버로드 중복 방지 —
-- 같은 이름의 3-인자/5-인자 함수가 공존하면 PostgREST RPC 호출이 모호해진다).
drop function if exists public.redeem_promo_code(uuid, text, text);

create function public.redeem_promo_code(
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

revoke execute on function public.redeem_promo_code(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text, text, text) to service_role;

-- ============================================
-- 5. earlybird 코드 생성 (선착순 200명 · 25크레딧 · 유효 7일)
-- ============================================
-- 2026-07-11: 최초 적용은 30일이었으나 같은 날 사용자 지시로 7일로 운영 변경
-- (프로덕션은 직접 update 완료). 재실행 대비 값도 7로 유지.
insert into public.promo_codes (code, credits, max_uses, validity_days, memo)
values ('earlybird', 25, 200, 7,
        '얼리버드 선착순 200명 — 가입 기본 5 + 보너스 25 = 총 30문제, 유효 7일. 결제 오픈 시 비활성화할 것 (2026-07-11)')
on conflict (code) do nothing;
