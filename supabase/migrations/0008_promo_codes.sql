-- 0008: 프로모션 코드 DB 관리 + 사용(상환) 이력
--
-- 배경: 기존 프로모션 코드는 서버 환경변수 PROMO_CODES 에 목록으로 저장되어
-- (1) 코드별 크레딧 지정 불가(100 고정), (2) 사용 이력 추적 불가, (3) 관리자가
-- 배포 없이 코드를 만들 수 없었다. 이 마이그레이션으로 DB 관리 방식을 도입한다.
-- 환경변수 코드는 레거시 폴백으로 계속 동작한다(회원가입 경로).
--
-- 사용처:
--  - 마이페이지: POST /api/promo/redeem (로그인 사용자, 계정당 코드 1회)
--  - 회원가입:   POST /api/auth/signup (DB 코드 우선, 환경변수 폴백)
--  - 관리자:     /api/admin/promo-codes (생성/목록/활성 전환/삭제)

-- ============================================
-- 1. promo_codes 테이블 (관리자가 명시적으로 생성)
-- ============================================
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  -- 코드는 소문자·공백제거 정규화 상태로만 저장 (조회도 정규화 후 일치 비교)
  code text not null unique
    check (code = lower(btrim(code)) and char_length(code) between 2 and 50),
  credits integer not null check (credits between 1 and 100000),
  -- null = 사용 횟수 무제한, n = 선착순 n명까지
  max_uses integer check (max_uses is null or max_uses >= 1),
  is_active boolean not null default true,
  memo text,                                  -- 관리용 메모 (예: "OO학원 배포용")
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================
-- 2. promo_redemptions 테이블 (사용 이력, append-only)
-- ============================================
-- promo_code_id 는 의도적으로 cascade 삭제하지 않는다(이력 보존).
-- 사용 이력이 있는 코드는 삭제 대신 비활성화를 쓰고, 삭제 시도는 FK 위반으로 막힌다.
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id),
  user_id uuid references public.profiles(id) on delete set null,
  email text,                                 -- 탈퇴 후에도 식별 가능한 스냅샷
  credits_granted integer not null,
  source text not null default 'mypage' check (source in ('mypage', 'signup')),
  created_at timestamptz not null default now(),
  -- 같은 코드는 계정당 1회만 (user_id 가 null 이 된 탈퇴 이력은 제약 대상 아님)
  unique (promo_code_id, user_id)
);

create index if not exists idx_promo_redemptions_code_id on public.promo_redemptions(promo_code_id);
create index if not exists idx_promo_redemptions_user_id on public.promo_redemptions(user_id);

-- ============================================
-- 3. RLS: 클라이언트 직접 접근 없음 (전부 서버 service_role 경유)
-- ============================================
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- ============================================
-- 4. 상환 함수 (원자적: 검증 → 이력 기록 → 크레딧 지급 → payments 기록)
-- ============================================
-- promo_codes 행 잠금(for update)으로 동시 상환을 직렬화하여 max_uses 초과를 방지.
-- 계정당 1회는 unique 제약이 최종 방어선(경합 시 unique_violation 으로 잡음).
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
begin
  if p_source not in ('mypage', 'signup') then
    return jsonb_build_object('success', false, 'error', 'invalid_source');
  end if;

  select id, credits, max_uses, is_active into v_promo
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

  update public.profiles
  set credits = credits + v_promo.credits
  where id = p_user_id
  returning credits into v_new_credits;

  -- 크레딧 증감 이력 일원화를 위해 payments 에도 기록 (관리자 수동 부여와 동일 패턴)
  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (p_user_id, 0, v_promo.credits, 'promo_' || v_promo.id::text || '_' || p_user_id::text, 'completed');

  return jsonb_build_object(
    'success', true,
    'credits_granted', v_promo.credits,
    'new_credits', v_new_credits
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ============================================
-- 5. 함수 실행 권한 (서버 service_role 전용)
-- ============================================
revoke execute on function public.redeem_promo_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text) to service_role;
