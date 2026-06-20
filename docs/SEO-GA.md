# SEO / GA 작업 문서 — mathocr-web

> **목적:** 이 사이트의 SEO·분석(GA) 설정이 **무엇을 · 어디에 · 왜** 해뒀는지 기록한다.
> 사이트 구조나 내용이 바뀌면 아래 **[4. 유지보수 가이드](#4-유지보수-가이드-사이트-바뀌면-여기-먼저)** 만 보면 어디를 고칠지 바로 알 수 있다.
>
> **최종 업데이트:** 2026-06-20 · **작업 브랜치:** `geo-structured-data`

---

## 0. 한눈에 보기 (현재 상태)

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | **SEO 기반** (메타데이터·robots·sitemap) | ✅ 완료 (커밋 `39012be`) |
| 2 | **GA4 분석** | ✅ 완료 (측정 ID: `G-N5B03EJ16V`, production 전용) |
| 3 | **GEO** (AI 검색용 구조화 데이터 JSON-LD) | ✅ 완료 (`Organization`·`WebSite`·`SoftwareApplication`·`FAQPage`) |
| 4 | **검색엔진 등록** (구글 서치콘솔 · 네이버 웹마스터) | ⬜ 예정 |
| 5 | **마무리** (middleware→proxy 등) | ⬜ 예정 |

> ⚠️ 아직 `master`에 머지 전이라 **실서비스(mathocr.ai.kr)에는 미반영**. 머지 시 Vercel이 자동 배포한다.

---

## 1. 핵심 설계 원칙 (이것만 기억하면 됨)

- **메타데이터(SEO)는 `layout.tsx`에, 화면 내용은 `page.tsx`에** 분리돼 있다.
  → **디자인·배치·문구를 바꿔도 SEO는 안 깨진다.**
- 공개 페이지의 `page.tsx`가 대부분 `"use client"`라 메타데이터를 직접 못 내보낸다.
  → 그래서 **각 폴더의 `layout.tsx`(서버 컴포넌트)에서 메타데이터를 주입**한다. (`terms`, `report`가 그 예시)
- 사이트 주소·이름·설명 같은 값은 **각 파일 상단의 상수**(`SITE_URL` 등)로 모아둔다.

---

## 2. SEO 기반 — 무엇이 어디에 있나 (✅ 완료)

| 파일 | 역할 | 바뀔 때 건드리는 경우 |
|---|---|---|
| `src/app/layout.tsx` | 사이트 전역 + **홈** 메타데이터: 제목·설명·키워드·Open Graph(카톡/SNS 공유 카드)·Twitter·canonical·robots·아이콘·`metadataBase`. 상단에 `SITE_URL/SITE_NAME/SITE_TITLE/SITE_DESCRIPTION` 상수. | 서비스 이름/설명/도메인 변경 |
| `src/app/robots.ts` | `robots.txt` 자동 생성. 공개=허용, `/admin·/dashboard·/auth·/api`=차단, sitemap 링크. | 비공개 경로 추가/변경 |
| `src/app/sitemap.ts` | `sitemap.xml` 자동 생성. 공개 페이지 목록(`/`, `/report`, `/terms`). | 페이지 추가/삭제/주소변경 |
| `src/app/terms/layout.tsx` | `/terms` 페이지 메타(제목·설명·canonical). | 약관 페이지 주소 변경 |
| `src/app/report/layout.tsx` | `/report` 페이지 메타(제목·설명·canonical). | 신고 페이지 주소 변경 |

### 페이지 공개/비공개 분류 (중요)
- **공개 (검색 노출 O, sitemap 포함):** `/` (홈) · `/terms` (약관) · `/report` (변환 오류 신고)
- **비공개 (검색 제외, robots에서 차단):** `/admin` · `/dashboard` · `/auth/*` (로그인·회원가입 등) · `/api/*`

---

## 3. GA4 — 분석 (✅ 완료)

| 항목 | 값 / 위치 |
|---|---|
| 측정 ID | **`G-N5B03EJ16V`** |
| 비밀인가? | ❌ 아님. GA 측정 ID는 모든 페이지 HTML에 노출되는 **공개 값**이라 문서/코드에 둬도 안전. (API 키와 다름) |
| 삽입 위치 | `src/app/layout.tsx` — `</body>` 뒤에 `<GoogleAnalytics>` (전 페이지 공통 추적). ID는 상단 `GA_MEASUREMENT_ID` 상수. |
| 구현 방식 | `@next/third-parties`의 `GoogleAnalytics` 컴포넌트. **production에서만 로드** (`process.env.NODE_ENV === "production"`) → 로컬·개발·`npm run dev` 접속은 추적 안 함. |
| 확인법 | GA4 → 보고서 → **실시간(Realtime)**. 배포 후 사이트 접속 시 본인 방문이 뜨면 정상. (※ 로컬에선 안 뜨는 게 정상) |
| 사이트 변경 영향 | **없음.** 추적 스크립트라 페이지가 바뀌거나 늘어나도 자동 추적. |

### 커스텀 이벤트 (사용자 행동 추적)
`src/lib/analytics.ts` 의 `trackEvent(name, params)` 로 전송. **production에서만** 기록(로컬/개발은 자동 무시).

| 이벤트 | 언제 | 위치 |
|---|---|---|
| `sign_up` | 회원가입 성공 | `auth/signup` |
| `login` | 로그인 성공 | `auth/login` |
| `submit_report` | 신고(변환오류) 제출 성공 | `report` |
| `nav_click` `{label}` | 네비·다운로드 섹션·신고 링크 클릭 | 홈 |
| `cta_click` `{label, location}` | 회원가입/로그인 버튼 클릭 | 홈 |
| `app_download` `{version}` | 실제 프로그램(.exe) 다운로드 | 홈 |

> GA4 → 보고서 → 실시간(또는 참여도 → 이벤트)에서 이 이름들로 확인. 표준 보고서는 처리에 하루 정도 걸릴 수 있음.

---

## 3-2. GEO — 구조화 데이터 JSON-LD (✅ 완료)

> AI 검색·구글이 "이게 어떤 서비스/회사인지, 어떤 FAQ가 있는지"를 정확히 읽도록 페이지에 숨은 데이터(JSON-LD)를 넣는다. `<script type="application/ld+json">` 형태로 **HTML에 정적으로 박혀** 나오므로 검색봇이 JS 실행 없이 읽는다.

| 구조화 데이터 | 범위 | 위치 |
|---|---|---|
| `Organization` · `WebSite` · `SoftwareApplication`(가격·플랫폼·기능) | **전 페이지 공통** | `src/app/structured-data.tsx`의 `StructuredData` → `layout.tsx`에서 렌더 |
| `FAQPage`(홈 FAQ 5개) | **홈(`/`)에만** | `src/app/structured-data.tsx`의 `FaqStructuredData` → `page.tsx` FAQ 섹션에서 렌더 |

- **왜 FAQ만 홈 전용?** 구글 가이드상 FAQ 구조화 데이터는 **실제 FAQ가 화면에 보이는 페이지에만** 넣어야 한다(`/terms` 등에 넣으면 위반). 그래서 전역 `StructuredData`가 아닌 별도 `FaqStructuredData`로 분리해 홈에서만 렌더.
- **단일 출처:** FAQ 질문/답은 `src/lib/faqs.ts`의 `FAQS` 한 곳에서 화면(`page.tsx`)과 구조화 데이터가 **함께** 읽는다 → 둘이 어긋날 일이 없다(구글은 JSON-LD와 화면 내용 일치를 요구).
- ⚠️ **가격 주의:** `SoftwareApplication`의 `offers`는 현재 실사이트와 동일한 **종량제(문제당 25원)·5문제 무료** 기준. 추후 *요금제 3종*이 실제 적용되면 `structured-data.tsx`의 `offers`도 같이 갱신.
- **검증:** 배포 후 [구글 Rich Results Test](https://search.google.com/test/rich-results)에 `https://mathocr.ai.kr` 입력 → `FAQPage`·`SoftwareApplication` 인식 확인.

---

## 4. 유지보수 가이드 ⭐ (사이트 바뀌면 여기 먼저)

| 이런 변경을 하면… | 이걸 수정 | 규모 |
|---|---|---|
| 디자인·색·배치·스타일 변경 | **없음** | — |
| 홈 문구/카피 약간 수정 | **없음** (서비스 설명이 *크게* 바뀔 때만 `layout.tsx`의 `SITE_DESCRIPTION`) | 작음 |
| 섹션 추가/삭제/순서 변경 | **없음** | 작음 |
| **새 공개 페이지 추가** (예: `/pricing`) | ① 해당 폴더에 `layout.tsx` 만들어 메타데이터 추가 (`terms/layout.tsx` 복붙) ② `sitemap.ts`에 URL 한 줄 추가 | 작음 |
| **공개 페이지 삭제** | `sitemap.ts`에서 해당 줄 삭제 | 작음 |
| **페이지 주소 변경** | `sitemap.ts` URL + 해당 `layout.tsx`의 canonical + (비공개면)`robots.ts` 경로 | 작음 |
| **비공개(로그인) 페이지 추가** | `robots.ts`의 `disallow` 배열에 경로 추가 | 작음 |
| 서비스 이름/슬로건 변경 | `layout.tsx` 상단 `SITE_TITLE` / `SITE_DESCRIPTION` / `keywords` | 작음 |
| **도메인 변경** | `SITE_URL` 상수 (현재 `layout.tsx`·`robots.ts`·`sitemap.ts` **3곳**에 있음 → [6. TODO] 참고) | 작음 |
| FAQ 질문/답 변경 | `src/lib/faqs.ts`의 `FAQS` **한 곳만** 수정 → 화면·FAQ 구조화 데이터 자동 동기화 | 작음 |
| 추적할 새 버튼/행동 추가 | 해당 요소에 `onClick={() => trackEvent("이름", {...})}` 추가 (`src/lib/analytics.ts`) | 작음 |

> 핵심: ⚠️ 표시도 전부 **"다시 만들기"가 아니라 "한 줄 추가/수정"** 수준이다.

---

## 5. 확인(검증) 방법

| 무엇 | 어떻게 |
|---|---|
| robots.txt | 브라우저에서 `https://mathocr.ai.kr/robots.txt` (로컬: `localhost:3000/robots.txt`) |
| sitemap.xml | `https://mathocr.ai.kr/sitemap.xml` |
| 메타태그 | 페이지 우클릭 → **페이지 소스 보기**, 또는 카톡에 링크 붙여 카드 미리보기 확인 |
| GA 작동 | GA4 → 보고서 → **실시간** |

---

## 6. 남은 작업 (TODO)

- [x] **GA4 삽입** (2번) — `G-N5B03EJ16V` (production 전용, `@next/third-parties` 사용)
- [x] **GA 커스텀 이벤트** — 회원가입·로그인·네비·다운로드·신고 클릭 추적 (`src/lib/analytics.ts`)
- [x] **GEO** (3번) — JSON-LD 구조화 데이터: `Organization`·`WebSite`·`SoftwareApplication`(가격·플랫폼) 전역 + `FAQPage`(홈 FAQ 5개, 단일 출처 `src/lib/faqs.ts`). 상세는 [3-2. GEO](#3-2-geo--구조화-데이터-json-ld-완료).
- [ ] **검색엔진 등록** (4번) — 구글 서치콘솔 + 네이버 웹마스터도구에 사이트 등록·소유확인·사이트맵 제출. (소유확인 메타태그는 `layout.tsx`의 `verification` 필드에 추가)
- [ ] **OG 이미지 개선** — 현재 공유 카드 이미지는 정사각 아이콘(`/mathocr-icon.png`, 600×600). 전용 **1200×630** 이미지를 만들면 카톡/SNS 카드가 더 보기 좋음.
- [ ] **middleware→proxy** — Next.js 16 경고. `src/middleware.ts`를 `proxy` 규칙으로 정리 (기능엔 지장 없음).
- [ ] **SITE_URL 중복 제거** — 현재 3개 파일에 같은 상수. `src/lib/site.ts` 한 곳으로 모으면 도메인 변경 시 한 군데만 고치면 됨.
