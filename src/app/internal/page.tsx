import type { Metadata } from "next";
import InternalVisitorStatus from "@/components/InternalVisitorStatus";

// 운영자 기기 통계 제외 페이지 (lib/internal-visitor.ts 참고). 어디에도 링크하지
// 않고 검색에도 내보내지 않는다. 남이 열어도 그 사람이 통계에서 빠질 뿐이다.
export const metadata: Metadata = {
  title: "통계 제외",
  robots: { index: false, follow: false },
};

export default function InternalPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="card rounded-2xl p-7 shadow-sm max-w-md w-full text-center">
        <InternalVisitorStatus />
      </div>
    </main>
  );
}
