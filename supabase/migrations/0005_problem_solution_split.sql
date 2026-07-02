-- ============================================================
-- 0005_problem_solution_split.sql
-- 변환 이력에 해설 개수(solution_count)를 분리 저장한다.
-- 마이페이지 "문제(해설) 수"를 30(+3) 형태로 표시하기 위함.
--
-- ⚠️ 차감 금액(credits_used)과 차감 로직은 변경 없음 — 표시용 분리 저장만 추가.
--   - problem_count  = 문제 수 (= 총 차감분 - 해설 수)
--   - solution_count = 해설 수 (신규 컬럼)
--   - credits_used   = 총 차감분 (문제 + 해설, 기존과 동일)
--
-- 하위호환: 구버전 데스크톱 앱은 p_solution_count 를 보내지 않으므로 default 0
-- (기존과 동일하게 problem_count = 총 차감분, solution_count = 0 으로 기록되어 표시도 예전과 같음).
--
-- Supabase SQL Editor에서 1회 실행. 0004 적용 후 후속. 웹 배포보다 먼저(또는 무관하게) 실행 안전.
-- ============================================================

-- 1. 해설 개수 컬럼 (기존 행은 0)
alter table public.conversions
  add column if not exists solution_count integer not null default 0;

-- 2. deduct_credits: 인수 목록이 바뀌므로(4번째 인수 추가) 기존 함수를 드롭 후 재생성.
--    p_amount = 총 차감분(문제+해설). p_solution_count = 해설 수(표시용, default 0).
--    구버전 앱의 3-인수 호출은 p_solution_count 기본값(0)으로 그대로 동작한다.
drop function if exists public.deduct_credits(uuid, integer, text);

create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_pdf_name text default null,
  p_solution_count integer default 0
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

  -- 현재 크레딧/유효기간 조회 (행 잠금)
  select credits, expires_at into v_credits, v_expires_at
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  -- 유효기간 체크
  if v_expires_at is not null and v_expires_at < now() then
    return jsonb_build_object('success', false, 'error', 'expired', 'expires_at', v_expires_at);
  end if;

  -- 크레딧 부족 체크
  if v_credits < p_amount then
    return jsonb_build_object('success', false, 'error', 'insufficient_credits', 'credits', v_credits, 'required', p_amount);
  end if;

  -- 크레딧 차감 (총 차감분)
  update public.profiles
  set credits = credits - p_amount
  where id = p_user_id;

  -- 변환 기록 생성 (문제/해설 분리 저장, credits_used 는 총액)
  insert into public.conversions (user_id, pdf_name, problem_count, solution_count, credits_used, status)
  values (p_user_id, p_pdf_name, p_amount - v_solution, v_solution, p_amount, 'started')
  returning id into v_conversion_id;

  return jsonb_build_object(
    'success', true,
    'conversion_id', v_conversion_id,
    'remaining_credits', v_credits - p_amount
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. 실행 권한 (서버 service_role 전용) — 새 시그니처 기준 재설정
revoke execute on function public.deduct_credits(uuid, integer, text, integer) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, integer, text, integer) to service_role;
