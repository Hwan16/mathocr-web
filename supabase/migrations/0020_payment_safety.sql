-- ============================================
-- 0020: 결제 안전장치 — kill switch 플래그 + 취소 웹훅 이벤트 저장
-- ============================================
-- LA-06 잔여 (docs/AUDIT_FOLLOWUP_BACKLOG_2026-07-12.md §B):
--
-- 1) service_flags — 서버 동작 플래그. 'payments_disabled'가 true면 결제 승인
--    라우트(nice return / toss confirm)가 신규 승인을 즉시 거부한다.
--    관리자 화면 토글로 재배포 없이 즉시 켜고 끌 수 있다 (사고 시 비상 정지).
--    서버 env PAYMENTS_KILL_SWITCH=true는 이 플래그보다 우선하는 강제 차단
--    (관리자 UI·DB 불능 시 최후 수단, 변경엔 재배포 필요).
--
-- 2) payment_events — 나이스 취소·부분취소 웹훅 통보 저장 (현재까지는 의도적
--    무시였음). 자동 회수는 하지 않고(오회수 위험) 기록 + 관리자 메일 경보만.
--    크레딧 정리는 관리자가 수동으로 진행한다.
--
-- 이 마이그레이션 미적용 환경에서도 서비스는 동작한다: 플래그 조회 실패는
-- fail-open(결제 허용, env 강제 차단은 계속 유효), 이벤트 저장 실패는 로그만.

create table if not exists public.service_flags (
  key text primary key,
  value boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid  -- 마지막으로 바꾼 관리자 (감사 기록)
);

-- RLS: 정책 없음 = anon/authenticated 접근 불가, service_role(서버)만 사용
alter table public.service_flags enable row level security;

insert into public.service_flags (key, value)
values ('payments_disabled', false)
on conflict (key) do nothing;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  event_type text not null,          -- 웹훅 status (cancelled / partialCancelled 등)
  tid text,
  order_id text,
  amount text,
  signature_valid boolean not null default false,
  raw jsonb not null                 -- 원문 전체 (수동 정리·포렌식용)
);

create index if not exists idx_payment_events_received_at
  on public.payment_events(received_at);
create index if not exists idx_payment_events_tid
  on public.payment_events(tid);

alter table public.payment_events enable row level security;
