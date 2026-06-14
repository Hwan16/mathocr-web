-- ============================================================
-- 0004_partial_refund.sql
-- 부분 환불: 변환은 완료됐지만 일부 문제/해설이 OCR에 실패해 이미지로 대체된 경우,
-- 실패한 개수만큼만 크레딧을 환불한다. (전액 차감 → 완료 시 실패분 환불)
--
-- - conversions.refunded_credits: 이 변환에서 환불된 크레딧 수(부분/전액 공통 기록)
-- - finalize_conversion: 전액 실패(크래시) 시 refunded_credits = credits_used 도 기록
-- - complete_conversion_with_refund: 완료 + 실패 개수만큼 부분 환불(원자적, 이중 방지)
--
-- 0003 적용 후 실행하는 후속 마이그레이션. Supabase SQL Editor에서 1회 실행.
-- ============================================================

-- 1. 환불액 기록 컬럼
alter table public.conversions
  add column if not exists refunded_credits integer not null default 0;

-- 2. finalize_conversion 갱신 — 전액 실패 시 환불액도 기록 (기존 동작 + refunded_credits)
create or replace function public.finalize_conversion(
  p_conversion_id uuid,
  p_user_id uuid,
  p_status text
)
returns jsonb as $$
declare
  v_credits_used integer;
  v_updated integer;
begin
  if p_status not in ('completed', 'failed') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  update public.conversions
  set status = p_status,
      refunded_credits = case when p_status = 'failed' then credits_used else refunded_credits end
  where id = p_conversion_id
    and user_id = p_user_id
    and status = 'started'
  returning credits_used into v_credits_used;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('success', false, 'error', 'not_pending');
  end if;

  if p_status = 'failed' and v_credits_used > 0 then
    update public.profiles
    set credits = credits + v_credits_used
    where id = p_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'status', p_status,
    'refunded', case when p_status = 'failed' then coalesce(v_credits_used, 0) else 0 end
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. 완료 + 부분 환불 함수
--    started → completed 로 전환하면서 실패 개수만큼(단, credits_used 이하로) 환불한다.
--    조건부 UPDATE라 동시 2요청에서도 1건만 통과 → 이중 환불 불가.
create or replace function public.complete_conversion_with_refund(
  p_conversion_id uuid,
  p_user_id uuid,
  p_failed_count integer
)
returns jsonb as $$
declare
  v_refund integer;
  v_updated integer;
  v_new_credits integer;
begin
  update public.conversions
  set status = 'completed',
      refunded_credits = least(greatest(coalesce(p_failed_count, 0), 0), credits_used)
  where id = p_conversion_id
    and user_id = p_user_id
    and status = 'started'
  returning refunded_credits into v_refund;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object('success', false, 'error', 'not_pending');
  end if;

  if v_refund > 0 then
    update public.profiles
    set credits = credits + v_refund
    where id = p_user_id
    returning credits into v_new_credits;
  end if;

  return jsonb_build_object('success', true, 'status', 'completed', 'refunded', coalesce(v_refund, 0), 'new_credits', v_new_credits);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4. 실행 권한 (서버 service_role 전용)
revoke execute on function public.complete_conversion_with_refund(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_conversion_with_refund(uuid, uuid, integer) to service_role;
