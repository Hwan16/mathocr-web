-- 0027: 가입 무료 크레딧을 "이메일 인증 후 첫 로그인" 시점에 지급 (2026-08-19)
--
-- 배경 (감사 A-1, 2026-08-11 → 얼리버드 종료로 보류 해제):
--   가입 방어 5종(일회용 메일·별칭·지메일 점·데이터센터 IP·IP 제한)은 전부
--   홈페이지 가입 라우트에만 있다. Supabase GoTrue 가입 API를 직접 두드리면
--   방어를 하나도 거치지 않고 계정이 생기는데, handle_new_user 트리거가
--   계정 생성만으로 무조건 15크레딧을 지급해 우회 가입의 수익이 됐다.
--   지급을 인증 이후로 옮기면 우회 계정은 잔액 0으로 남아 수익이 사라진다.
--   (크레딧 사용은 원래도 인증 후에만 가능 — 이 변경은 "지급 자체"를 옮긴다)
--
-- ⚠️ 배포 순서 (한쪽만 적용돼도 안전하도록 설계):
--   1. 웹 코드 먼저 배포 — grant_signup_credits RPC가 아직 없으면 호출이
--      조용히 실패하고(claimSignupCredits가 경고만 남김), 기존 트리거가
--      가입 시점에 지급하므로 동작 변화 없음.
--   2. 이 마이그레이션 적용 — 이후 신규 가입은 0크레딧으로 생성되고,
--      인증 후 첫 로그인(토큰 발급/claim-pending/login) 때 15크레딧 지급.
--   순서를 바꾸면(마이그레이션 먼저) 코드 배포 전까지 신규 가입자가
--   크레딧을 못 받으므로 반드시 코드 먼저.

-- ============================================
-- 1. 지급 이력 컬럼 + 기존 사용자 백필
-- ============================================
-- 기존 사용자는 전원 가입 시점에 이미 지급받았으므로 '지급 완료'로 표시한다.
-- (이 백필이 없으면 다음 로그인 때 15크레딧이 중복 지급된다)
--
-- ⚠️ 백필은 "컬럼을 처음 만드는 실행"에서만 돈다. 이 파일을 실수로 두 번
-- 실행하면, 첫 실행 이후 가입해 아직 로그인하지 않은(=지급 대기, null)
-- 계정까지 '지급 완료'로 찍혀 15크레딧을 영영 못 받게 되기 때문이다.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'signup_credits_granted_at'
  ) then
    alter table public.profiles
      add column signup_credits_granted_at timestamptz;

    update public.profiles
    set signup_credits_granted_at = created_at
    where signup_credits_granted_at is null;
  end if;
end $$;

-- ============================================
-- 2. 가입 트리거: 크레딧 0으로 생성 (지급은 인증 후로 이동)
-- ============================================
alter table public.profiles
  alter column credits set default 0;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- 무료 크레딧은 여기서 지급하지 않는다 (0027) — 이메일 인증 후 첫 로그인
  -- 시점에 grant_signup_credits가 지급한다. 가입 방어를 우회한 직접 가입
  -- 계정이 잔액을 들고 시작하지 못하게 하기 위함.
  insert into public.profiles (id, email, credits, expires_at)
  values (new.id, new.email, 0, null);
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ============================================
-- 3. 인증 후 지급 RPC (멱등 — 계정당 평생 1회)
-- ============================================
-- 15크레딧·유효 7일은 web/src/lib/plans.ts 의 SIGNUP_FREE_CREDITS /
-- SIGNUP_FREE_VALIDITY_DAYS 와 반드시 일치시킬 것.
--
-- 멱등성: signup_credits_granted_at is null 조건부 UPDATE 한 번으로 판정과
-- 지급을 원자 처리한다. 동시 로그인(웹+앱)이 겹쳐도 행 잠금으로 한쪽만
-- UPDATE에 성공하고, 다른 쪽은 not found → already_granted 로 끝난다.
create or replace function public.grant_signup_credits(p_user_id uuid)
returns jsonb as $$
declare
  v_credits integer;
  v_expires timestamptz;
begin
  update public.profiles
  set credits = case
        -- 방어적 처리: 만료된 잔액 위에 지급하는 경우 만료분을 버리고 15로
        -- 재설정 (redeem_promo_code 와 동일한 규칙). 정상 흐름에서는 지급
        -- 전 잔액이 0·만료일 null 이라 이 분기를 타지 않는다.
        when expires_at is not null and expires_at < now() then 15
        else credits + 15
      end,
      expires_at = greatest(
        coalesce(expires_at, now()),
        now() + interval '7 days'
      ),
      signup_credits_granted_at = now()
  where id = p_user_id
    and signup_credits_granted_at is null
  returning credits, expires_at into v_credits, v_expires;

  if not found then
    if exists (select 1 from public.profiles where id = p_user_id) then
      return jsonb_build_object('success', false, 'error', 'already_granted');
    end if;
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'credits_granted', 15,
    'new_credits', v_credits,
    'expires_at', v_expires
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.grant_signup_credits(uuid) from public, anon, authenticated;
grant execute on function public.grant_signup_credits(uuid) to service_role;

-- ============================================
-- 4. 가입 차단 기록 (경보 사유 구분 · 오탐 측정용)
-- ============================================
-- 감사 지적: 08-08 차단 4종(일회용 메일·별칭·지메일 점·데이터센터 IP)의
-- 차단 건수가 console.warn 로만 남아 사유별 오탐률을 측정할 수 없었다.
-- 서버 전용 append 테이블로 사유·도메인·IP·시각을 남긴다.
-- reason 값:
--   disposable_email·plus_alias·dotted_gmail·datacenter_ip = 가입 라우트 차단
--   grant_refused = 우회 가입 계정의 인증 후 크레딧 지급을 이메일 검사로 거부
create table if not exists public.blocked_signups (
  id bigint generated always as identity primary key,
  reason text not null check (
    reason in (
      'disposable_email', 'plus_alias', 'dotted_gmail', 'datacenter_ip',
      'grant_refused'
    )
  ),
  email_domain text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_blocked_signups_created_at
  on public.blocked_signups (created_at desc);

alter table public.blocked_signups enable row level security;
revoke all on table public.blocked_signups from public, anon, authenticated;
grant select, insert on table public.blocked_signups to service_role;
