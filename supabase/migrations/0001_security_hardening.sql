-- ============================================================
-- 0001_security_hardening.sql
-- 기존 운영 DB에 적용하는 보안 강화 마이그레이션.
-- Supabase SQL Editor에서 1회 실행하면 된다.
--
-- 닫는 구멍:
--   C1. SECURITY DEFINER 크레딧 함수가 누구나 호출 가능 → 무한 크레딧/탈취
--   C2. profiles UPDATE 정책이 컬럼 제한 없음 → 본인을 admin 승격 + 크레딧 자가 지급
--   M4. 변환 상태 업데이트의 이중 환불(read-then-write 경쟁 상태)
-- ============================================================

-- ------------------------------------------------------------
-- 1. 크레딧 함수: PUBLIC/anon/authenticated의 직접 실행 권한 회수
--    이 함수들은 서버(service_role)만 호출해야 한다.
--    PostgREST는 public 스키마의 모든 함수를 RPC로 노출하므로, REVOKE 하지
--    않으면 로그인한 누구나 add_credits_raw 등을 직접 호출할 수 있다.
-- ------------------------------------------------------------
revoke execute on function public.deduct_credits(uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.add_credits(uuid, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.add_credits_raw(uuid, integer) from public, anon, authenticated;

-- service_role(서버 전용)만 실행 허용
grant execute on function public.deduct_credits(uuid, integer, text) to service_role;
grant execute on function public.add_credits(uuid, integer, integer, text) to service_role;
grant execute on function public.add_credits_raw(uuid, integer) to service_role;

-- ------------------------------------------------------------
-- 2. SECURITY DEFINER 함수에 search_path 고정 (search_path 하이재킹 방지)
--    함수 본문을 바꾸지 않고 옵션만 갱신한다.
-- ------------------------------------------------------------
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.deduct_credits(uuid, integer, text) set search_path = public, pg_temp;
alter function public.add_credits(uuid, integer, integer, text) set search_path = public, pg_temp;
alter function public.add_credits_raw(uuid, integer) set search_path = public, pg_temp;

-- ------------------------------------------------------------
-- 3. profiles 자가 수정 정책 제거 (C2)
--    클라이언트가 자기 profiles 행을 직접 UPDATE 할 수 있으면 role/credits를
--    임의로 바꿀 수 있다. 앱의 모든 profiles 쓰기는 서버(service_role)를 거치므로
--    클라이언트 UPDATE 권한은 불필요. SELECT(본인 조회)만 남긴다.
-- ------------------------------------------------------------
drop policy if exists "본인 프로필 수정" on public.profiles;

-- ------------------------------------------------------------
-- 4. conversions / error_logs 클라이언트 쓰기 정책 제거
--    변환 기록 생성·상태 변경·로그 적재는 전부 서버 라우트(service_role)에서
--    수행한다. 클라이언트 직접 쓰기를 막아 위변조 경로를 없앤다.
--    (SELECT 본인 조회 정책은 대시보드용으로 유지)
-- ------------------------------------------------------------
drop policy if exists "본인 변환 생성" on public.conversions;
drop policy if exists "본인 변환 상태 수정" on public.conversions;
drop policy if exists "본인 에러 로그 생성" on public.error_logs;

-- ------------------------------------------------------------
-- 5. 변환 종료(완료/실패) 원자적 처리 함수 (M4)
--    started → completed/failed 전환을 단일 UPDATE의 조건절로 처리하여
--    동시 요청 중 1건만 통과시킨다. 실패 전환에 성공한 호출만 환불하므로
--    이중 환불이 원천적으로 불가능하다.
-- ------------------------------------------------------------
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

  -- started 인 경우에만 조건부 전환. 동시 2건이면 1건만 row를 잡는다.
  update public.conversions
  set status = p_status
  where id = p_conversion_id
    and user_id = p_user_id
    and status = 'started'
  returning credits_used into v_credits_used;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- 이미 처리됐거나(중복 요청) 소유자가 아니거나 존재하지 않음
    return jsonb_build_object('success', false, 'error', 'not_pending');
  end if;

  -- 실패 시 차감했던 크레딧 환불 (전환 성공 1건만 도달 → 중복 불가)
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

revoke execute on function public.finalize_conversion(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_conversion(uuid, uuid, text) to service_role;
