-- 0023: 자동 영역 인식(gemini-layout) 사용 기록
--
-- 목적: 관리자 유저 상세에서 "이 사용자가 자동 인식을 썼는지 → 변환까지
-- 이어졌는지"를 변환 이력과 나란히 확인한다 (기능 사용률·전환 관찰용).
-- 기존 기록처는 전부 휘발성이라 쓸 수 없다: Vercel 콘솔 로그(logOcrUsage)는
-- 보존 기간이 짧고, Upstash 일일 카운터는 TTL 2일 + 사용자별 구분 집계 불가.
--
-- 호출 1건 = 페이지 1장 분석 (앱이 페이지마다 프록시를 부른다, 실행당 최대 20건).
-- 이 마이그레이션 미적용 환경에서도 자동 인식은 동작한다: 서버는 기록 실패를
-- 로그만 남기고 무시한다 (fail-open).

create table if not exists public.auto_detect_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  problem_count integer not null default 0,  -- 이 페이지에서 인식된 문제 수
  figure_count integer not null default 0,   -- 이 페이지에서 인식된 그림 수
  created_at timestamptz not null default now()
);

-- 유저 상세 조회(user_id + 최신순)와 일자별 전체 집계 둘 다 커버
create index if not exists idx_auto_detect_usage_user_created
  on public.auto_detect_usage (user_id, created_at desc);
create index if not exists idx_auto_detect_usage_created_at
  on public.auto_detect_usage (created_at);

-- RLS: 정책 없음 = anon/authenticated 접근 불가, service_role(서버)만 사용
alter table public.auto_detect_usage enable row level security;
