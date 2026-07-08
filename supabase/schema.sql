-- MathOCR Database Schema
-- Supabase SQL Editor에서 실행하세요.

-- ============================================
-- 1. profiles 테이블 (auth.users 확장)
-- ============================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  credits integer not null default 5,  -- 가입 시 무료 5회 제공
  expires_at timestamptz,              -- null이면 만료 없음
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 새 사용자 가입 시 profiles 자동 생성 (무료 5크레딧 = 유효기간 7일, 0009)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, expires_at)
  values (new.id, new.email, now() + interval '7 days');
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 자동 갱신
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- ============================================
-- 2. payments 테이블 (결제 이력)
-- ============================================
-- 탈퇴(프로필 삭제) 후에도 대금결제 기록(5년, 전자상거래법)으로 보존하기 위해
-- user_id 는 nullable + ON DELETE SET NULL 이며, email 스냅샷으로 식별한다.
-- 스냅샷은 탈퇴 API가 계정 삭제 직전에 기록한다. (0010)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,                           -- 탈퇴 후 식별용 이메일 스냅샷 (0010)
  amount integer not null,              -- 결제 금액 (원)
  credits_added integer not null,       -- 추가된 크레딧
  pg_transaction_id text,               -- 토스페이먼츠 거래 ID
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index idx_payments_user_id on public.payments(user_id);
create index idx_payments_status on public.payments(status);

-- 같은 PG 거래로 크레딧이 두 번 지급되는 것을 차단 (웹훅 재시도 대비, 0009)
create unique index uq_payments_pg_transaction_id
  on public.payments (pg_transaction_id)
  where pg_transaction_id is not null;

-- ============================================
-- 3. conversions 테이블 (변환 이력)
-- ============================================
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pdf_name text,
  problem_count integer not null default 0,
  solution_count integer not null default 0,  -- 해설 수(표시용). credits_used = problem_count + solution_count
  credits_used integer not null default 0,
  refunded_credits integer not null default 0,  -- 이 변환에서 환불된 크레딧(부분/전액 공통)
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index idx_conversions_user_id on public.conversions(user_id);
create index idx_conversions_created_at on public.conversions(created_at);

-- ============================================
-- 4. error_logs 테이블 (오류 로그)
-- ============================================
create table public.error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversion_id uuid references public.conversions(id) on delete set null,
  error_type text not null,
  error_message text not null,
  stack_trace text,
  metadata jsonb,                       -- 추가 정보 (PDF명, 문제 번호 등)
  created_at timestamptz not null default now()
);

create index idx_error_logs_user_id on public.error_logs(user_id);
create index idx_error_logs_created_at on public.error_logs(created_at);
create index idx_error_logs_error_type on public.error_logs(error_type);

-- ============================================
-- 5. RLS (Row Level Security) 정책
-- ============================================

-- profiles
alter table public.profiles enable row level security;

-- profiles: 본인 행 "조회"만 허용. 쓰기(role/credits 변경 포함)는 전부
-- 서버(service_role) 라우트를 거친다. 클라이언트 UPDATE를 허용하면 본인을
-- admin 으로 승격하거나 크레딧을 자가 지급할 수 있으므로 UPDATE 정책은 두지 않는다.
create policy "본인 프로필 조회"
  on public.profiles for select
  using (auth.uid() = id);

-- payments
alter table public.payments enable row level security;

create policy "본인 결제 이력 조회"
  on public.payments for select
  using (auth.uid() = user_id);

-- conversions: 본인 행 "조회"만 허용. 생성/상태변경은 서버(service_role)에서만.
alter table public.conversions enable row level security;

create policy "본인 변환 이력 조회"
  on public.conversions for select
  using (auth.uid() = user_id);

-- error_logs: 클라이언트 직접 접근 없음. 적재는 /api/logs(service_role)에서만,
-- 조회는 관리자 API(/api/admin/logs)에서만. 따라서 클라이언트 정책을 두지 않는다.
alter table public.error_logs enable row level security;

-- ============================================
-- 6. 크레딧 차감 함수 (원자적 트랜잭션)
-- ============================================
-- p_amount = 총 차감분(문제+해설). p_solution_count = 해설 수(표시용, default 0).
-- credits_used 는 총액(변경 없음), problem_count 는 문제만(= 총액 - 해설).
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

-- ============================================
-- 7. 크레딧 추가 함수 (레거시 — 유효기간 미설정)
-- ============================================
-- ⚠ 유효기간(expires_at)을 건드리지 않으므로 플랜 충전에는 쓰지 말 것.
--    신규 충전 경로는 7-b의 grant_plan_credits를 사용한다.
create or replace function public.add_credits(
  p_user_id uuid,
  p_credits integer,
  p_amount integer,
  p_transaction_id text
)
returns jsonb as $$
declare
  v_payment_id uuid;
  v_new_credits integer;
begin
  -- 결제 기록 생성
  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (p_user_id, p_amount, p_credits, p_transaction_id, 'completed')
  returning id into v_payment_id;

  -- 크레딧 추가
  update public.profiles
  set credits = credits + p_credits
  where id = p_user_id
  returning credits into v_new_credits;

  return jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'new_credits', v_new_credits
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ============================================
-- 8. 크레딧 직접 추가 함수 (관리자/환불용)
-- ============================================
create or replace function public.add_credits_raw(
  p_user_id uuid,
  p_credits integer
)
returns void as $$
begin
  update public.profiles
  set credits = credits + p_credits
  where id = p_user_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ============================================
-- 7-b. 플랜 충전 함수 (유효기간 연장 모델, 0009)
-- ============================================
-- 토스 결제 웹훅·관리자 수동 충전의 공통 진입점. service_role 전용.
--  · 유효기간 = greatest(기존 만료일, now() + 플랜 유효기간) — 절대 안 줄어듦
--  · 만료 전 재충전: 잔여 크레딧까지 새 유효기간으로 함께 연장
--  · 만료 후 충전: 만료된 잔여분 소멸, 신규 크레딧만 지급
--  · 같은 거래 ID 재처리는 uq_payments_pg_transaction_id가 차단 → 'duplicate_transaction'
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

  v_txn_id := coalesce(p_transaction_id, 'grant_' || p_user_id::text || '_' || gen_random_uuid()::text);

  begin
    insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
    values (p_user_id, coalesce(p_amount, 0), p_credits, v_txn_id, 'completed');
  exception when unique_violation then
    return jsonb_build_object('success', false, 'error', 'duplicate_transaction');
  end;

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
-- 9. 변환 종료(완료/실패) 원자적 처리 + 실패 1회 환불
-- ============================================
-- started → completed/failed 전환을 조건부 UPDATE로 처리하여 동시 요청 중
-- 1건만 통과시킨다. 실패 전환에 성공한 호출만 환불 → 이중 환불 불가.
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

-- 완료 + 부분 환불: 변환 완료 시 실패 개수만큼(credits_used 이하) 환불. 0004 동기화.
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

-- ============================================
-- 10. 함수 실행 권한 (서버 service_role 전용)
-- ============================================
-- PostgREST는 public 함수를 RPC로 노출하므로, 크레딧/환불 함수는 반드시
-- PUBLIC 권한을 회수하고 service_role 에게만 부여한다.
revoke execute on function public.deduct_credits(uuid, integer, text, integer) from public, anon, authenticated;
revoke execute on function public.add_credits(uuid, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.add_credits_raw(uuid, integer) from public, anon, authenticated;
revoke execute on function public.finalize_conversion(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.deduct_credits(uuid, integer, text, integer) to service_role;
grant execute on function public.add_credits(uuid, integer, integer, text) to service_role;
grant execute on function public.add_credits_raw(uuid, integer) to service_role;
grant execute on function public.finalize_conversion(uuid, uuid, text) to service_role;

revoke execute on function public.complete_conversion_with_refund(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.complete_conversion_with_refund(uuid, uuid, integer) to service_role;

-- ============================================
-- 11. conversion_reports 테이블 (변환 실패/오변환 사용자 신고)
-- ============================================
-- 상세는 migrations/0002_conversion_reports.sql 참고. 이미지는 Storage
-- 'reports'(비공개) 버킷에 저장하고 경로만 여기에 기록한다.
create table if not exists public.conversion_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  original_image_path text,
  converted_image_path text,
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'accepted', 'rejected')),
  rewarded boolean not null default false,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  -- '채택'은 보상 지급된 신고에만 허용(채택은 reward_report() 경로로만). 0003 동기화.
  constraint conversion_reports_accepted_requires_reward
    check (status <> 'accepted' or rewarded = true)
);

create index if not exists idx_conversion_reports_user_id on public.conversion_reports(user_id);
create index if not exists idx_conversion_reports_created_at on public.conversion_reports(created_at);
create index if not exists idx_conversion_reports_status on public.conversion_reports(status);

-- RLS: 본인 신고 조회만. 생성/상태변경/보상은 서버(service_role)에서만.
alter table public.conversion_reports enable row level security;

create policy "본인 신고 조회"
  on public.conversion_reports for select
  using (auth.uid() = user_id);

-- Storage 버킷 'reports' (비공개)
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- 신고 채택 보상 함수 (원자적 50크레딧 지급 + 중복 방지)
create or replace function public.reward_report(
  p_report_id uuid,
  p_credits integer
)
returns jsonb as $$
declare
  v_user_id uuid;
  v_updated integer;
  v_new_credits integer;
begin
  update public.conversion_reports
  set rewarded = true, rewarded_at = now(), status = 'accepted'
  where id = p_report_id and rewarded = false
  returning user_id into v_user_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('success', false, 'error', 'already_rewarded_or_not_found');
  end if;

  update public.profiles
  set credits = credits + p_credits
  where id = v_user_id
  returning credits into v_new_credits;

  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (v_user_id, 0, p_credits, 'report_reward_' || p_report_id::text, 'completed');

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'new_credits', v_new_credits);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.reward_report(uuid, integer) from public, anon, authenticated;
grant execute on function public.reward_report(uuid, integer) to service_role;

-- ============================================
-- 12. user_consents 테이블 (약관/개인정보 동의 이력)
-- ============================================
-- 상세는 migrations/0006_user_consents.sql, 0007_user_consents_retention.sql 참고.
-- 회원가입 시 서버(service_role)가 'terms'/'privacy' 각 1건을 append-only 로
-- 적재한다(감사·분쟁 대비). 탈퇴(프로필 삭제) 후에도 계약기록(5년)으로 보존하기
-- 위해 user_id 는 nullable + ON DELETE SET NULL 이며, email 스냅샷으로 식별한다.
create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  email text,                            -- 탈퇴 후 식별용 이메일 스냅샷
  doc_type text not null check (doc_type in ('terms', 'privacy')),
  version text not null,
  agreed boolean not null default true,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_id on public.user_consents(user_id);
create index if not exists idx_user_consents_created_at on public.user_consents(created_at);

alter table public.user_consents enable row level security;

create policy "본인 동의 이력 조회"
  on public.user_consents for select
  using (auth.uid() = user_id);

-- ============================================
-- 13. 프로모션 코드 (DB 관리) + 사용 이력
-- ============================================
-- 상세는 migrations/0008_promo_codes.sql 참고. 관리자가 코드·크레딧·최대 사용
-- 횟수를 직접 지정해 생성하고, 사용자는 마이페이지/회원가입에서 상환한다.
-- 같은 코드는 계정당 1회. 클라이언트 직접 접근 없음(서버 service_role 전용).
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code = lower(btrim(code)) and char_length(code) between 2 and 50),
  credits integer not null check (credits between 1 and 100000),
  max_uses integer check (max_uses is null or max_uses >= 1),
  is_active boolean not null default true,
  memo text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes(id),
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  credits_granted integer not null,
  source text not null default 'mypage' check (source in ('mypage', 'signup')),
  created_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

create index if not exists idx_promo_redemptions_code_id on public.promo_redemptions(promo_code_id);
create index if not exists idx_promo_redemptions_user_id on public.promo_redemptions(user_id);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

-- 상환 함수 (원자적). 본문은 migrations/0008_promo_codes.sql 과 동일하게 유지.
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

  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (p_user_id, 0, v_promo.credits, 'promo_' || v_promo.id::text || '_' || p_user_id::text, 'completed');

  return jsonb_build_object(
    'success', true,
    'credits_granted', v_promo.credits,
    'new_credits', v_new_credits
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.redeem_promo_code(uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_promo_code(uuid, text, text) to service_role;
