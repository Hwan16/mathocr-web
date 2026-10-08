-- ============================================================
-- 0029_ai_usage_log.sql (2026-10-09, AI 해설 원가 기록 — CHECKLIST Phase 120.6)
--
-- 왜: AI 해설 생성(/api/ocr/explain)의 요청별 비용은 지금까지 Vercel 로그(console)와
--     Upstash 일일 합계(클로드 전체)에만 남아, "해설 1건당 원가"를 나중에 볼 수 없었다.
--     마케팅 대시보드(tools/marketing_dashboard)가 일자별 생성 문제 수·API 원가·문제당 원가를
--     보여 주려면 요청별 기록이 DB에 있어야 한다.
-- 무엇: 호출 1건 = 1행. 서버(service role)만 쓰고 읽는다(RLS 켬, 정책 없음).
--     kind 는 'explain'부터 쓰고, 나중에 변환 OCR('ocr')도 같은 표에 넣을 수 있게 열을 일반화했다.
--
-- Supabase SQL Editor에서 1회 실행. 적용 전에도 서버는 동작한다(기록 실패는 조용히 무시).
-- ============================================================

create table if not exists public.ai_usage_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid null,
  provider      text not null,                 -- 'claude' | 'mathpix' | 'gemini'
  kind          text not null,                 -- 'explain' (AI 해설) | 'ocr' (예정)
  ok            boolean not null,
  status        integer not null default 0,
  model         text null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  est_cost_usd  numeric(12, 6) not null default 0,  -- 서버 단가표로 요청 직후 계산한 추정 비용
  duration_ms   integer not null default 0,
  blocked_reason text null,                    -- 실패 사유(재시도 번호 포함) — 성공이면 null
  app_version   text null
);

create index if not exists ai_usage_log_created_at_idx on public.ai_usage_log (created_at desc);
create index if not exists ai_usage_log_kind_created_idx on public.ai_usage_log (kind, created_at desc);

alter table public.ai_usage_log enable row level security;
-- 정책을 만들지 않는다 → anon/authenticated 는 접근 불가, service role 만 읽고 쓴다.

comment on table public.ai_usage_log is 'AI 호출 1건당 사용량·추정 비용 (대시보드용). kind=explain 은 AI 해설 생성.';
