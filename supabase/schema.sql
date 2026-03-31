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

-- 새 사용자 가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

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
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,              -- 결제 금액 (원)
  credits_added integer not null,       -- 추가된 크레딧
  pg_transaction_id text,               -- 토스페이먼츠 거래 ID
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

create index idx_payments_user_id on public.payments(user_id);
create index idx_payments_status on public.payments(status);

-- ============================================
-- 3. conversions 테이블 (변환 이력)
-- ============================================
create table public.conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pdf_name text,
  problem_count integer not null default 0,
  credits_used integer not null default 0,
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

create policy "본인 프로필 조회"
  on public.profiles for select
  using (auth.uid() = id);

create policy "본인 프로필 수정"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- payments
alter table public.payments enable row level security;

create policy "본인 결제 이력 조회"
  on public.payments for select
  using (auth.uid() = user_id);

-- conversions
alter table public.conversions enable row level security;

create policy "본인 변환 이력 조회"
  on public.conversions for select
  using (auth.uid() = user_id);

create policy "본인 변환 생성"
  on public.conversions for insert
  with check (auth.uid() = user_id);

create policy "본인 변환 상태 수정"
  on public.conversions for update
  using (auth.uid() = user_id);

-- error_logs
alter table public.error_logs enable row level security;

create policy "본인 에러 로그 생성"
  on public.error_logs for insert
  with check (auth.uid() = user_id);

-- ============================================
-- 6. 크레딧 차감 함수 (원자적 트랜잭션)
-- ============================================
create or replace function public.deduct_credits(
  p_user_id uuid,
  p_amount integer,
  p_pdf_name text default null
)
returns jsonb as $$
declare
  v_credits integer;
  v_expires_at timestamptz;
  v_conversion_id uuid;
begin
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

  -- 크레딧 차감
  update public.profiles
  set credits = credits - p_amount
  where id = p_user_id;

  -- 변환 기록 생성
  insert into public.conversions (user_id, pdf_name, problem_count, credits_used, status)
  values (p_user_id, p_pdf_name, p_amount, p_amount, 'started')
  returning id into v_conversion_id;

  return jsonb_build_object(
    'success', true,
    'conversion_id', v_conversion_id,
    'remaining_credits', v_credits - p_amount
  );
end;
$$ language plpgsql security definer;

-- ============================================
-- 7. 크레딧 추가 함수 (결제 완료 시)
-- ============================================
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
$$ language plpgsql security definer;

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
$$ language plpgsql security definer;
