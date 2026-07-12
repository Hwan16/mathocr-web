-- ============================================================
-- 0017_deduct_replay_binding.sql (2026-07-12, Codex 리뷰 후속)
-- 0016 멱등 재생(replay)의 방어를 두 가지 보강한다.
--
-- 1) replay 요청 내용 결속: 같은 (user_id, request_id)라도 요청의 차감량·해설
--    수가 원 기록과 다르면 기존 결과를 돌려주지 않고 'request_mismatch' 오류를
--    반환한다. (정상 앱은 같은 키를 같은 내용으로만 재사용하지만, 변조·버그로
--    키가 재사용될 때 다른 작업이 조용히 "성공"으로 넘어가는 것을 막는다)
--
-- 2) unique_violation 정밀화: 예외 처리에서 (user_id, request_id) 재조회가
--    실패하면 — 즉 request_id 충돌이 아닌 다른 unique 제약 위반이면 —
--    conversion_id=null 인 가짜 성공 대신 예외를 그대로 다시 던진다.
--
-- 하위호환: 시그니처 동일(5인수) — create or replace 로 교체, 함수 drop 없음.
--   구버전 앱(request_id 미전송)·현행 v2.0.4 앱 모두 동작 변화 없음
--   (정상 재시도는 항상 같은 내용이므로 mismatch 가 발생하지 않는다).
--
-- Supabase SQL Editor에서 1회 실행.
-- ============================================================

create or replace function public.deduct_credits(
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
  v_replay_amount integer;
  v_replay_solution integer;
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
  -- 단, 요청 내용(차감량·해설 수)이 원 기록과 같을 때만 — 다르면 키 오용이므로
  -- 거절한다 (0017). remaining_credits 는 현재 잔액(원 차감이 이미 반영된 값).
  if p_request_id is not null then
    select id, credits_used, solution_count
      into v_conversion_id, v_replay_amount, v_replay_solution
    from public.conversions
    where user_id = p_user_id and request_id = p_request_id;

    if found then
      if v_replay_amount is distinct from p_amount
         or v_replay_solution is distinct from v_solution then
        return jsonb_build_object('success', false, 'error', 'request_mismatch');
      end if;

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
    -- request_id 충돌이면 기존 행을 재생 반환. 그 외 unique 제약 위반이면
    -- 가짜 성공을 만들지 않고 예외를 그대로 전파한다 (0017).
    select id into v_conversion_id
    from public.conversions
    where user_id = p_user_id and request_id = p_request_id;

    if not found then
      raise;
    end if;

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

-- 권한은 0016과 동일 유지 (create or replace 는 기존 grant 를 보존하지만 명시 재확인)
revoke execute on function public.deduct_credits(uuid, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, integer, text) to service_role;
