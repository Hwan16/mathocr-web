-- ============================================================
-- 0028_ai_solution.sql (2026-10-08, D-037 AI 해설 생성)
-- AI 해설 생성 기능의 차감·기록을 위해 변환 기록에 열 2개를 더하고
-- deduct_credits 에 AI 해설 수·크레딧 인수를 추가한다.
--
-- - ai_solution_count   : 이번 변환에서 AI 해설을 요청한 문제 수(표시·통계용)
-- - ai_solution_credits : 그중 크레딧 차감분(= 수 × 단가; 단가는 서버가 소유, 기념가 2 / 정가 3)
--   문제 수(problem_count)는 p_amount - 해설 수 - AI 해설 크레딧으로 계산한다.
-- - 멱등 재생(0016·0017)의 내용 결속에 AI 해설 수·크레딧도 포함한다.
-- - 부분 환불은 기존 complete_conversion_with_refund(p_failed_count = 환불 크레딧 수)를 그대로
--   쓴다. 서버 라우트가 실패한 AI 해설 수 × (ai_solution_credits / ai_solution_count)를 더해 보낸다.
--
-- 시그니처가 바뀌므로(7인수) 기존 5인수 함수를 지우고 새로 만든다. Supabase RPC 는 이름 붙인
-- 인수로 부르므로 기존 호출(5인수까지만 전달)도 기본값으로 그대로 동작한다. 두 판이 함께 있으면
-- 이름 인수 호출이 "function is not unique" 로 실패하므로 반드시 drop 한다.
--
-- Supabase SQL Editor에서 1회 실행 (앱 v2.4.0 배포 전에 서버 배포와 함께).
-- ============================================================

alter table public.conversions
  add column if not exists ai_solution_count integer not null default 0,
  add column if not exists ai_solution_credits integer not null default 0;

drop function if exists public.deduct_credits(uuid, integer, text, integer, text);

create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_pdf_name text default null,
  p_solution_count integer default 0,
  p_request_id text default null,
  p_ai_solution_count integer default 0,
  p_ai_solution_credits integer default 0
)
returns jsonb as $$
declare
  v_credits integer;
  v_expires_at timestamptz;
  v_conversion_id uuid;
  v_solution integer;
  v_ai_count integer;
  v_ai_credits integer;
  v_replay_amount integer;
  v_replay_solution integer;
  v_replay_ai_count integer;
  v_replay_ai_credits integer;
begin
  -- 해설 수·AI 해설 크레딧은 0 이상, 합이 총 차감분을 넘지 않게 제한(문제 수가 음수가 되지 않도록)
  v_ai_count := greatest(coalesce(p_ai_solution_count, 0), 0);
  v_ai_credits := least(greatest(coalesce(p_ai_solution_credits, 0), 0), p_amount);
  v_solution := least(greatest(coalesce(p_solution_count, 0), 0), p_amount - v_ai_credits);

  select credits, expires_at into v_credits, v_expires_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if p_request_id is not null then
    select id, credits_used, solution_count, ai_solution_count, ai_solution_credits
      into v_conversion_id, v_replay_amount, v_replay_solution, v_replay_ai_count, v_replay_ai_credits
    from public.conversions
    where user_id = p_user_id and request_id = p_request_id;

    if found then
      if v_replay_amount is distinct from p_amount
         or v_replay_solution is distinct from v_solution
         or v_replay_ai_count is distinct from v_ai_count
         or v_replay_ai_credits is distinct from v_ai_credits then
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

  if v_expires_at is not null and v_expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'expired', 'expires_at', v_expires_at);
  end if;

  if v_credits < p_amount then
    return jsonb_build_object('success', false, 'error', 'insufficient_credits', 'credits', v_credits, 'required', p_amount);
  end if;

  begin
    update public.profiles
    set credits = credits - p_amount
    where id = p_user_id;

    insert into public.conversions (
      user_id, pdf_name, problem_count, solution_count, credits_used, status, request_id,
      ai_solution_count, ai_solution_credits
    )
    values (
      p_user_id, p_pdf_name, p_amount - v_solution - v_ai_credits, v_solution, p_amount, 'started', p_request_id,
      v_ai_count, v_ai_credits
    )
    returning id into v_conversion_id;
  exception when unique_violation then
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

revoke execute on function public.deduct_credits(uuid, integer, text, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, integer, text, integer, integer) to service_role;
