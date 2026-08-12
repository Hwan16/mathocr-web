-- 0024: 만료 임박 안내 메일 발송 기록
--
-- 배경 (2026-08-11 감사 B-1):
--   expiry-reminder cron 은 "만료 6~7일 전"이라는 **하루짜리 창**으로만 대상을 뽑고
--   발송 여부를 어디에도 남기지 않았다. 그래서
--     · 그날 cron 이 실패하거나 (Resend 장애·RESEND_API_KEY 누락·함수 타임아웃)
--     · 개별 발송이 실패하거나 (failed 배열에만 담기고 끝)
--     · 대상이 MAX_PER_RUN 을 넘어 잘리면 (정렬도 없어 매번 같은 사람이 밀릴 수 있음)
--   그 사용자는 다음 날 창이 이미 지나가 **영원히 안내를 못 받는다**.
--
--   약관 제6조가 이 사전 안내를 전제하므로 유료 고객에게 누락되면 곤란하다.
--   (효력 자체는 같은 조항이 "수신·확인하지 못한 경우에도 소멸의 효력에는 영향이
--    없습니다"로 방어하고 있으나, 안내를 약속한 이상 실제로 보내는 게 맞다.)
--
-- 조치: 재지급 cron(0022)이 이미 검증한 "마커 컬럼" 방식을 그대로 가져온다.
--   컬럼이 생기면 cron 의 조회 조건이 "만료 7일 이내 & 아직 안 보냄"으로 바뀌어,
--   중간에 실패해도 다음 실행에서 자동으로 복구된다.
--
--   값에는 **그때 안내한 만료일**을 함께 담지 않고 발송 시각만 남긴다.
--   충전으로 만료일이 미래로 옮겨지면 새 만료가 다가올 때 다시 안내해야 하므로,
--   cron 쪽에서 "sent_at 이 현재 expires_at 보다 이전이면 재발송 대상"으로 판정한다.

alter table public.profiles
  add column if not exists expiry_reminder_sent_at timestamptz;

comment on column public.profiles.expiry_reminder_sent_at is
  '만료 임박 안내 메일을 마지막으로 보낸 시각. null = 아직 안 보냄. '
  '재충전으로 expires_at 이 뒤로 밀리면 이 값보다 나중이 되어 다시 대상이 된다.';

-- 조회 패턴: expires_at 범위 + sent_at null/과거. 부분 인덱스로 충분하다
-- (크레딧 보유자만 대상이고 전체 행 수가 작다).
create index if not exists idx_profiles_expiry_reminder
  on public.profiles (expires_at)
  where credits > 0;

-- ── 백필 (중요) ──
--
-- 이 마이그레이션 이후 cron 의 조회 창이 "만료 6~7일 전"(하루)에서
-- "지금 ~ 만료 7일 전"(7일)으로 넓어진다. 마커가 전부 null 인 채로 넓히면
-- **이미 안내를 받은 사람들에게 중복 발송**된다 — 예를 들어 만료 3일 전인 사람은
-- 나흘 전에 이미 받았는데 넓어진 창에 다시 걸린다.
--
-- 그래서 "옛 창(만료 6일 전)을 이미 지나간" 사람은 발송 완료로 표시해 둔다.
-- 만료 6~7일 전 구간(=오늘의 정상 대상)은 건드리지 않아 오늘 발송은 그대로 나간다.
--
-- ⚠️ 기준선은 now() 가 아니라 **마지막 cron 실행 시각**이어야 한다.
--
--   cron 은 매일 00:00 UTC(09:00 KST)에 돌고(vercel.json "0 0 * * *"),
--   그날 대상은 expires_at ∈ [실행시각+6일, 실행시각+7일) 이다.
--   기준선을 now()+6일로 잡으면, 마이그레이션을 오후에 적용할 때
--   expires_at ∈ [오늘00:00+6일, now()+6일) 인 사람들이 표시에서 빠진다.
--   그들은 오늘 아침 이미 메일을 받았는데 내일 넓어진 창에 다시 걸려
--   **같은 안내를 하루 만에 두 번** 받게 된다(마케팅 동의자는 (광고) 메일 중복).
--
--   그래서 "오늘 00:00 UTC + 7일" 을 기준으로 잡는다 — 적용 시각과 무관하게
--   '이미 자기 창을 지나간 사람' 전원이 정확히 표시되고, 오늘 창에 걸린 사람은
--   빠짐없이 남는다(중복 0 · 누락 0).
--
--   값은 expires_at 기준으로 넣는다 — cron 의 재발송 판정이
--   "sent_at >= expires_at - 7일" 이라, 재충전으로 만료일이 밀리면 자연히 다시 대상이 된다.
--   (interval 은 서머타임 영향을 받지 않도록 '168 hours' 로 쓴다)
update public.profiles
   set expiry_reminder_sent_at = expires_at - interval '168 hours'
 where credits > 0
   and expires_at is not null
   and expires_at < (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
                    + interval '168 hours'
   and expiry_reminder_sent_at is null;
