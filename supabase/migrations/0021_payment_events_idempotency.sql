-- ============================================
-- 0021: 취소 웹훅 멱등·취소 데이터 컬럼 (Codex 교차검토 P1-4/P1-5 반영)
-- ============================================
-- 0020의 payment_events 보강:
--  1) event_key + 유니크 인덱스 — 같은 취소 웹훅 재전송 시 행·경보 중복 방지
--     (멱등 upsert). event_key = cancelledTid ?? '{tid}:{status}'.
--     NULL은 서로 distinct라 기존 행(event_key 없음)과 충돌하지 않는다.
--  2) 취소 상세 컬럼 — 최상위 amount는 '원결제금액'이므로(NICE 명세), 실제
--     취소액·잔액·취소 거래키를 별도 컬럼으로 보존해 수동 정리 정확도를 높인다.
--
-- 미적용 환경 폴백: 웹훅 핸들러는 이 컬럼/인덱스가 없으면 기존 기본 컬럼만으로
-- 저장한다(서명 유효 이벤트만 저장하는 스팸 차단은 코드 레벨이라 무관하게 동작).

alter table public.payment_events
  add column if not exists event_key text,
  add column if not exists cancelled_amount text,
  add column if not exists cancelled_tid text,
  add column if not exists balance_amt text;

-- 전체 유니크 인덱스: NULL 다수 허용(기존 행 보존) + non-null event_key만 유일 강제
create unique index if not exists uq_payment_events_event_key
  on public.payment_events(event_key);
