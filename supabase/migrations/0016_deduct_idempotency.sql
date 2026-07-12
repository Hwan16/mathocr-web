-- ============================================================
-- 0016_deduct_idempotency.sql (2026-07-12, 감사 LA-06)
-- 크레딧 차감에 멱등키(request_id)를 도입한다.
--
-- 문제: 데스크톱 앱이 차감 요청을 보내고 서버는 처리했지만 응답이 네트워크에서
--   유실되면, 사용자가 다시 변환을 눌렀을 때 같은 작업에 크레딧이 두 번
--   차감될 수 있다.
-- 해결: 앱이 변환 시도마다 고유한 request_id 를 생성해 보내고, 서버는 같은
--   (user_id, request_id) 재요청에 대해 새로 차감하지 않고 기존 결과를
--   그대로 돌려준다(replay).
--
-- 하위호환: p_request_id 는 default null — request_id 를 보내지 않는 기존
--   배포 앱(v2.0.3 이하)은 지금과 완전히 동일하게 동작한다.
--
-- 배포 순서: 이 마이그레이션 먼저 → 웹 코드 배포(요청에 request_id 가 있을 때만
--   p_request_id 를 전달하므로 순서가 바뀌어도 동작은 하지만, 마이그레이션 전에는
--   멱등 보호가 없다) → request_id 를 보내는 데스크톱 앱 릴리스.
--
-- Supabase SQL Editor에서 1회 실행.
-- ============================================================

-- 1. 멱등키 컬럼 (기존 행은 null 유지)
alter table public.conversions
  add column if not exists request_id text;

-- 같은 사용자의 같은 request_id 는 변환 1건 — DB 차원 최종 방어선
create unique index if not exists uq_conversions_user_request
  on public.conversions (user_id, request_id)
  where request_id is not null;

-- 2. deduct_credits: 인수 추가(5번째)로 기존 함수를 드롭 후 재생성.
--    (같은 이름의 4-인수/5-인수 함수가 공존하면 PostgREST RPC 호출이 모호해진다)
drop function if exists public.deduct_credits(uuid, integer, text, integer);

create function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_pdf_name text default null,
  p_solution_count integer default 0,
  p_request_id text default null
)
returns jsonb as $$
declare
  v_credits integer;
  v_expires_at timestamptz;
  v_conversion_id uuid;
  v_solution integer;
begin
  -- 해설 수는 0 이상, 총 차감분 이하로 제한(문제 수가 음수가 되지 않도록)
  v_solution := least(greatest(coalesce(p_solution_count, 0), 0), p_amount);

  -- 현재 크레딧/유효기간 조회 (행 잠금 — 같은 사용자의 동시 차감을 직렬화한다.
  -- 멱등 재생 검사도 이 잠금 아래에서 수행해 동시 중복 요청 경합을 없앤다)
  select credits, expires_at into v_credits, v_expires_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  -- 멱등 재생: 같은 (user_id, request_id) 요청이 이미 처리됐으면 기존 결과 반환.
  -- remaining_credits 는 현재 잔액(원 차감이 이미 반영된 값)을 돌려준다.
  if p_request_id is not null then
    select id into v_conversion_id
    from public.conversions
    where user_id = p_user_id and request_id = p_request_id;

    if found then
      return jsonb_build_object(
        'success', true,
        'conversion_id', v_conversion_id,
        'remaining_credits', v_credits,
        'replayed', true
      );
    end if;
  end if;

  -- 유효기간 체크
  if v_expires_at is not null and v_expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'expired', 'expires_at', v_expires_at);
  end if;

  -- 크레딧 부족 체크
  if v_credits < p_amount then
    return jsonb_build_object('success', false, 'error', 'insufficient_credits', 'credits', v_credits, 'required', p_amount);
  end if;

  -- 차감 + 변환 기록을 한 서브블록으로 묶는다: unique_violation(이론상 잠금이
  -- 막지만 안전망) 발생 시 차감까지 함께 롤백되어 이중 차감이 생기지 않는다.
  begin
    update public.profiles
    set credits = credits - p_amount
    where id = p_user_id;

    insert into public.conversions (user_id, pdf_name, problem_count, solution_count, credits_used, status, request_id)
    values (p_user_id, p_pdf_name, p_amount - v_solution, v_solution, p_amount, 'started', p_request_id)
    returning id into v_conversion_id;
  exception when unique_violation then
    -- 동시 중복 요청이 잠금을 우회한 극단 케이스 — 기존 행을 재생 반환
    select id into v_conversion_id
    from public.conversions
    where user_id = p_user_id and request_id = p_request_id;

    return jsonb_build_object(
      'success', true,
      'conversion_id', v_conversion_id,
      'remaining_credits', v_credits,
      'replayed', true
    );
  end;

  return jsonb_build_object(
    'success', true,
    'conversion_id', v_conversion_id,
    'remaining_credits', v_credits - p_amount
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. 실행 권한 (서버 service_role 전용) — 새 시그니처 기준 재설정
revoke execute on function public.deduct_credits(uuid, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, integer, text) to service_role;
