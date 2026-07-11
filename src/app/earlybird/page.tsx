import { redirect } from "next/navigation";

// ── 얼리버드 — 가입 직결 개편 (2026-07-11 사용자 결정) ──
// 신청제(0015: 이메일 수집 → 오픈 날 코드 메일)는 신청자 0명 상태에서 종료.
// 이제 얼리버드 혜택은 "가입 즉시 30크레딧"이며, 가입 페이지가 ?promo=earlybird 로
// 코드를 자동 적용한다. 기존에 공유된 /earlybird 링크가 죽지 않도록 리다이렉트만 남긴다.
// (UTM 등 기존 쿼리 파라미터는 그대로 넘겨 유입 추적을 보존한다)
export default async function EarlybirdPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (typeof value === "string") qs.set(key, value);
  }
  qs.set("promo", "earlybird");
  redirect(`/auth/signup?${qs.toString()}`);
}
