import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FileBox from "@/components/file-box/FileBox";

// 내 파일함(D-054) — 로그인 필수(proxy 가 /files 를 막고 로그인 뒤 돌아오게 한다).
export const metadata: Metadata = {
  title: "내 파일함",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?redirect=/files");
  return (
    <Suspense fallback={null}>
      <FileBox email={user.email ?? ""} />
    </Suspense>
  );
}
