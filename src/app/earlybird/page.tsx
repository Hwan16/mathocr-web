import { permanentRedirect } from "next/navigation";

// 얼리버드 종료(2026-08-14). 기존에 공유된 링크는 죽이지 않고 일반 가입으로
// 연결하되, promo 파라미터는 제거해 종료된 코드가 다시 적용되지 않게 한다.
// UTM 등 유입 추적 파라미터는 그대로 보존한다.
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
  qs.delete("promo");
  const query = qs.toString();
  permanentRedirect(`/auth/signup${query ? `?${query}` : ""}`);
}
