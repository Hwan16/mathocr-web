-- ============================================================
-- 0030_file_box.sql (2026-11-05, 내 파일함 — D-054)
--
-- 왜: 앱이 만든 결과 한글 파일을 서버에도 30일 보관해, 웹 '내 파일함'(/files)에서
--     변환 시각·만료일을 보고 다시 받거나(여러 개는 zip) 카카오톡으로 받기 링크를 보낸다.
-- 무엇:
--   1) stored_files — 보관 파일 1개 = 1행. 앱이 서버 API로 행을 만들고(서명 업로드 URL 발급),
--      파일을 올린 뒤 완료를 알리면 uploaded_at 이 찍혀 목록에 보인다.
--      미리보기는 변환 때 이미 인식한 '첫 문제'만(preview jsonb + 그림이 있으면 작은 PNG).
--   2) profiles.file_box_enabled — 자동 보관 켜기/끄기(기본 켜짐, 웹 파일함에서 바꿈).
--   3) Storage 버킷 'file-box'(비공개) — 경로 <user_id>/<file_id>/file.hwp, preview.png.
-- 만료: expires_at = 변환일(한국 날짜) + 30일째 23:59:59(KST). 서버 API가 계산해 넣는다.
--   만료되면 cron(/api/cron/file-box-cleanup)이 파일·미리보기 그림을 지우고 file_deleted_at,
--   만료 30일 뒤에는 행도 지운다(목록에서 사라짐).
-- 쓰기는 모두 서버(service role). 회원은 RLS로 자기 행만 읽는다.
--
-- Supabase SQL Editor에서 1회 실행. 적용 전 배포되면 파일함 API만 실패하고 변환은 그대로다.
-- ============================================================

create table if not exists public.stored_files (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  conversion_id    uuid null references public.conversions(id) on delete set null,
  file_name        text not null,                     -- 받을 때 쓰는 이름(예: '…_변환.hwp')
  size_bytes       bigint not null default 0,
  problem_count    integer not null default 0,
  solution_count   integer not null default 0,
  figure_count     integer not null default 0,
  preview          jsonb null,                        -- 첫 문제 미리보기(앱이 만든 블록 목록)
  has_preview_image boolean not null default false,  -- preview.png 있음
  created_at       timestamptz not null default now(),
  uploaded_at      timestamptz null,                  -- null = 업로드 미완료(목록에 안 보임)
  expires_at       timestamptz not null,
  file_deleted_at  timestamptz null,                  -- 만료·삭제로 파일을 지운 시각
  deleted_at       timestamptz null,                  -- 회원이 지운 시각(업로드 URL 유효 3시간 안이면
                                                      --   행을 바로 지우지 않고 남겨, cron 이 저장소를 한 번 더 지운 뒤 행 삭제)
  share_token      text null unique,                  -- 카톡 '받기 링크'(처음 공유할 때 만듦)
  app_version      text null
);

create index if not exists stored_files_user_created_idx
  on public.stored_files (user_id, created_at desc);
create index if not exists stored_files_expiry_idx
  on public.stored_files (expires_at)
  where file_deleted_at is null;
create index if not exists stored_files_deleted_idx
  on public.stored_files (deleted_at)
  where deleted_at is not null;
create index if not exists stored_files_pending_idx
  on public.stored_files (created_at)
  where uploaded_at is null;

alter table public.stored_files enable row level security;

drop policy if exists "본인 보관 파일 조회" on public.stored_files;
create policy "본인 보관 파일 조회"
  on public.stored_files for select
  using (auth.uid() = user_id and uploaded_at is not null and deleted_at is null);
-- insert/update/delete 정책 없음 → 서버(service role)만 쓴다.

comment on table public.stored_files is '내 파일함 — 변환 결과 한글 파일 30일 보관(D-054). 쓰기는 서버만.';

alter table public.profiles
  add column if not exists file_box_enabled boolean not null default true;

-- 보관 여부를 정한 시각. 기존 회원은 비워 둬(null) 업데이트 후 첫 변환 때 앱이 한 번 묻는다.
-- 새 방침이 들어간 가입 코드(api/auth/signup)가 가입 때 이 값을 찍는다 — DB 기본값으로 두지 않는 이유:
-- DB 적용과 웹 배포 사이에 옛 방침으로 가입한 회원까지 '정함'이 되면 안 되기 때문(Codex 재검토 ③).
alter table public.profiles
  add column if not exists file_box_choice_at timestamptz null;

-- 탈퇴 후 다시 지울 폴더 — 탈퇴 직전에 발급된 서명 업로드 URL(2시간 유효)로 파일이 다시 생길 수
-- 있어, 탈퇴 3시간 뒤 cron 이 그 회원 폴더를 한 번 더 비운다(Codex 재검토 ②). 외래키 없음(계정이 지워진 뒤 쓰므로).
create table if not exists public.file_box_purges (
  user_id      uuid primary key,
  purge_after  timestamptz not null
);
alter table public.file_box_purges enable row level security;
-- 정책 없음 → 서버(service role)만 쓴다.

-- Storage 버킷 'file-box' (비공개, 파일 1개 50MB 상한)
--   service_role 은 Storage RLS를 우회하므로 storage 정책은 만들지 않는다
--   (업로드는 서버가 발급한 서명 업로드 URL, 받기는 서버가 발급한 만료형 서명 URL).
insert into storage.buckets (id, name, public, file_size_limit)
values ('file-box', 'file-box', false, 52428800)
on conflict (id) do nothing;
