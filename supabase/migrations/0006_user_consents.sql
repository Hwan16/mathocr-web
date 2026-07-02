-- 0006_user_consents.sql
-- 회원의 약관/개인정보 동의 이력을 append-only 로 기록(감사·분쟁 대비).
-- 회원가입 시 서버(service_role)가 'terms'/'privacy' 각 1건을 적재한다.

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  doc_type text not null check (doc_type in ('terms', 'privacy')),
  version text not null,                 -- 동의한 문서 버전(시행일 문자열 등)
  agreed boolean not null default true,
  ip text,                               -- 동의 시점 클라이언트 IP(가능한 경우)
  created_at timestamptz not null default now()
);

create index if not exists idx_user_consents_user_id on public.user_consents(user_id);
create index if not exists idx_user_consents_created_at on public.user_consents(created_at);

-- RLS: 본인 동의 이력 "조회"만 허용. 기록(insert)/수정은 서버(service_role)에서만.
-- (service_role 은 RLS 를 우회하므로 insert 정책을 별도로 두지 않는다.)
alter table public.user_consents enable row level security;

create policy "본인 동의 이력 조회"
  on public.user_consents for select
  using (auth.uid() = user_id);
