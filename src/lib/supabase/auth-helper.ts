import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * 인증된 사용자 가져오기
 * 1) Bearer 토큰 (데스크톱 앱)
 * 2) 쿠키 기반 세션 (웹 브라우저)
 * 둘 다 지원
 */
export async function getAuthUser(): Promise<User | null> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  // Bearer 토큰이 있으면 토큰 기반 인증
  if (authorization?.startsWith("Bearer ")) {
    const token = authorization.slice(7);
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }

  // 쿠키 기반 인증 (웹)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
