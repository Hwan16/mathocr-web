-- ============================================================
-- 0002_conversion_reports.sql
-- 변환 실패/오변환(수식이 잘못 변환됨 등) 사용자 신고 기능.
-- Supabase SQL Editor에서 1회 실행하면 된다.
--
-- 보안 원칙(0001과 동일): 클라이언트는 본인 행 SELECT만, 모든 쓰기/이미지
-- 업로드/관리자 조회는 서버(service_role)를 거친다. 보상 지급은 SECURITY
-- DEFINER 함수로 원자적으로 처리하고 service_role에게만 실행을 허용한다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. conversion_reports 테이블
--    original_image_path / converted_image_path 는 Storage 'reports'
--    버킷 내부 경로(예: <user_id>/<report_id>/original.png)를 저장한다.
--    이미지 자체는 비공개 버킷에 있고, 관리자만 서명 URL로 열람한다.
-- ------------------------------------------------------------
create table if not exists public.conversion_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  comment text not null,
  original_image_path text,
  converted_image_path text,
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'accepted', 'rejected')),
  rewarded boolean not null default false,   -- 50크레딧 보상 지급 여부(중복 지급 방지)
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_conversion_reports_user_id on public.conversion_reports(user_id);
create index if not exists idx_conversion_reports_created_at on public.conversion_reports(created_at);
create index if not exists idx_conversion_reports_status on public.conversion_reports(status);

-- ------------------------------------------------------------
-- 2. RLS: 본인 신고 "조회"만 허용. 생성/상태변경/보상은 서버(service_role)에서만.
--    클라이언트 직접 INSERT/UPDATE 정책을 두지 않아 위변조 경로를 없앤다.
-- ------------------------------------------------------------
alter table public.conversion_reports enable row level security;

drop policy if exists "본인 신고 조회" on public.conversion_reports;
create policy "본인 신고 조회"
  on public.conversion_reports for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. Storage 버킷 'reports' (비공개)
--    public=false → 외부에서 직접 URL 접근 불가. 업로드는 서버(service_role),
--    관리자 열람은 createSignedUrl로 만료형 서명 URL을 발급한다.
--    service_role 은 Storage RLS를 우회하므로 별도 storage 정책이 필요 없다.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 4. 신고 채택 보상 함수 (원자적 50크레딧 지급 + 중복 지급 방지)
--    rewarded=false 인 신고만 조건부로 통과시켜 한 번만 지급한다.
--    동시 2건이 들어와도 1건만 row를 잡으므로 이중 지급이 불가능하다.
-- ------------------------------------------------------------
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
  set rewarded = true,
      rewarded_at = now(),
      status = 'accepted'
  where id = p_report_id
    and rewarded = false
  returning user_id into v_user_id;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    -- 이미 지급됐거나 존재하지 않음
    return jsonb_build_object('success', false, 'error', 'already_rewarded_or_not_found');
  end if;

  update public.profiles
  set credits = credits + p_credits
  where id = v_user_id
  returning credits into v_new_credits;

  -- 보상 지급 이력 (payments 재사용 — 관리자 0원 지급과 동일 패턴)
  insert into public.payments (user_id, amount, credits_added, pg_transaction_id, status)
  values (v_user_id, 0, p_credits, 'report_reward_' || p_report_id::text, 'completed');

  return jsonb_build_object('success', true, 'user_id', v_user_id, 'new_credits', v_new_credits);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.reward_report(uuid, integer) from public, anon, authenticated;
grant execute on function public.reward_report(uuid, integer) to service_role;
