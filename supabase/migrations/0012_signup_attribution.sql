-- 0012: 가입 출처(UTM) 추적 — 마케팅 M4 (docs/MARKETING_2026-07-10.md)
--
-- 배경: 광고 채널별 예산 배분 판단에는 "어느 채널에서 온 가입자인지"가 필요하다.
--       GA4는 세션 단위 집계만 제공하고 가입자 개인과 연결되지 않으므로,
--       방문 시 URL의 UTM 파라미터를 first-touch(30일)로 보관했다가
--       가입 시 프로필에 기록한다.
--
-- 이 마이그레이션이 하는 것:
--   profiles에 utm_source / utm_medium / utm_campaign (nullable text) 3컬럼 추가.
--   값은 가입 API(service_role)가 가입 직후 1회 기록하며, null = 직접 유입(direct).
--   같은 값이 auth.users.raw_user_meta_data에도 남으므로 이 기록이 실패해도 백필 가능.
--
-- 표기 규약(광고 URL 등록 시 — 소문자):
--   utm_source: naver | google | meta | youtube | community | referral
--   utm_medium: cpc | social | video | post
--   utm_campaign: 자유 (예: typing, category, retarget)
alter table public.profiles
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;
