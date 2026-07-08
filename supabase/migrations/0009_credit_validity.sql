-- 0009: 크레딧 유효기간 모델 — 결제 오픈 선행 작업 (T2)
--
-- 배경: 가격표는 유효기간 30/60일 플랜을 팔고 있으나, 기존 충전 함수(add_credits)는
--       expires_at을 건드리지 않아 "기간 무제한 크레딧"이 지급되는 상태였다.
--
-- 이 마이그레이션이 하는 것:
--   1) payments.pg_transaction_id 부분 unique 인덱스
--      — 결제 웹훅 재시도 시 같은 거래로 크레딧이 두 번 지급되는 것을 DB 차원에서 차단
--   2) grant_plan_credits() — 플랜 충전 공통 진입점 (토스 웹훅·관리자 수동 충전 공용)
--      — 유효기간 = greatest(기존 만료일, now() + 플랜 유효기간): 절대 줄어들지 않음
--      — 만료 "전" 재충전 시 잔여 크레딧까지 새 유효기간으로 함께 연장
--      — 만료 "후" 충전 시 만료된 잔여분은 소멸하고 새 크레딧만 지급
--   3) 신규 가입 무료 5크레딧 = 유효기간 7일 (기존 가입자에는 영향 없음)
--
-- 근거 문서: docs/PLAN_PRICING_CREDITS.md 확정 결정 1·3, docs/CONSULTING_2026-07-08.md T2
-- 주의: 설계 문서의 "프로모 코드 폐지"(결정 4)는 Phase 28(0008)에서 뒤집혔으므로 여기서 다루지 않는다.

-- ============================================
-- 1. 거래 ID 중복 방지 (웹훅 이중 지급의 1차 방어선)
-- ============================================
-- 기존 행의 pg_transaction_id에 null이 있어 부분 unique 인덱스를 쓴다.
-- 기존 non-null 값은 'report_reward_<id>' / 'promo_<id>_<user>' 형태로 유일하다.
-- 만약 생성이 실패하면(중복 존재) 아래 쿼리로 먼저 확인·정리할 것:
--   select pg_transaction_id, count(*) from public.payments
--   where pg_transaction_id is not null group by 1 having count(*) > 1;
create unique index if not exists uq_payments_pg_transaction_id
  on public.payments (pg_transaction_id)
  where pg_transaction_id is not null;

-- ============================================
-- 2. grant_plan_credits — 플랜 충전 공통 진입점
-- ============================================
-- 호출자: 토스 결제 웹훅(추후), 관리자 수동 충전. service_role 전용.
-- 반환: {success, new_credits, expires_at} 또는 {success:false, error}
--   · error='duplicate_transaction' → 이미 처리된 거래(웹훅 재시도). 크레딧 미지급.
create or replace function public.grant_plan_credits(
  p_user_id uuid,
  p_credits integer,
  p_validity_days integer,
  p_amount integer default 0,
  p_transaction_id text default null
)
returns jsonb as $$
declare
  v_txn_id text;
  v_new_credits integer;
  v_new_expires timestamptz;
begin
  if p_credits is null or p_credits <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_credits');
  end if;
  if p_validity_days is null or p_validity_days <= 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_validity_days');
  end if;

  -- 외부(토스) 거래 ID가 없으면 내부 grant용 유일 ID를 만든다 (unique 인덱스와 충돌 방지)
  v_txn_id := coalesce(p_transaction_id, 'grant_' || p_user_id::text || '_' || gen_random_uuid()::text);

  -- 결제 기록을 먼저 삽입 — 같은 거래 ID의 재처리를 unique 인덱스가 차단한다(멱등).
  -- 이후 단계가 실패하면 함수 전체가 롤백되므로 기록만 남고 크레딧이 빠지는 일은 없다.
  begin
    insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
    values (p_user_id, coalesce(p_amount, 0), p_credits, v_txn_id, 'completed');
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'duplicate_transaction');
  end;

  -- 크레딧 합산 + 유효기간 연장.
  --  · 만료 전: 잔여 크레딧 유지 + 전체가 더 긴 만료일로 연장 (절대 안 줄어듦)
  --  · 만료 후: 만료된 잔여분은 소멸(신규 크레딧만), 만료일은 새 플랜 기준
  --  · expires_at null(무제한 — 과거 지급분)은 now() 기준으로 취급 → 플랜 만료일 부여
  update public.profiles
  set credits = case
        when expires_at is not null and expires_at < now() then p_credits
        else credits + p_credits
      end,
      expires_at = greatest(
        coalesce(expires_at, now()),
        now() + make_interval(days => p_validity_days)
      )
  where id = p_user_id
  returning credits, expires_at into v_new_credits, v_new_expires;

  if not found then
    raise exception 'grant_plan_credits: profile not found (%)', p_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'new_credits', v_new_credits,
    'expires_at', v_new_expires
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.grant_plan_credits(uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.grant_plan_credits(uuid, integer, integer, integer, text) to service_role;

-- ============================================
-- 3. 신규 가입 무료 5크레딧 = 7일 만료
-- ============================================
-- credits default 5는 profiles 테이블 정의가 담당. 여기서는 만료일만 추가한다.
-- 기존 사용자 행은 건드리지 않는다(신규 가입부터 적용).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, expires_at)
  values (new.id, new.email, now() + interval '7 days');
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;
