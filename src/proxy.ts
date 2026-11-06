// Next 16 의 요청 가로채기 — 이전 이름 middleware.ts(export middleware). Next 16 에서 proxy.ts(export proxy) 로
// 이름이 바뀌었고 기본 실행 환경이 Edge → Node.js 로 바뀌었다(2026-11-06, Next 16.4.5 보안 패치와 함께 전환, 동작은 동일).
// 하는 일: ① Supabase 세션 쿠키 갱신 ② 보호 경로(/dashboard·/admin·/files) 비로그인 → /auth/login?redirect=…
// ③ 로그인 상태로 /auth/login·/auth/signup 에 오면 가려던 안전한 내부 경로(없으면 /dashboard)로.
// CSP 등 보안 헤더는 여기가 아니라 next.config.ts headers() 에 있다.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 세션 갱신 (중요: getUser()를 호출해야 토큰이 갱신됨)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 보호된 페이지: 로그인 안 되어 있으면 로그인 페이지로
  const protectedPaths = ["/dashboard", "/admin", "/files"];
  // 경로 단위로 비교 — '/files' 는 막고 '/files-…' 같은 다른 페이지는 막지 않는다
  const path = request.nextUrl.pathname;
  const isProtected = protectedPaths.some((p) => path === p || path.startsWith(p + "/"));

  if (isProtected && !user) {
    // 쿼리까지 보존 — 앱의 [내 파일함에서 보기]는 /files?f=<id> 로 연다
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.search = "";
    url.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // 로그인/회원가입 페이지: 이미 로그인되어 있으면 가려던 곳(안전한 내부 경로) 또는 대시보드로
  const authPaths = ["/auth/login", "/auth/signup"];
  const isAuthPage = authPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (isAuthPage && user) {
    const target = safeInternalTarget(request.nextUrl.searchParams.get("redirect"));
    const url = request.nextUrl.clone();
    url.pathname = target.pathname;
    url.search = target.search;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// login/page.tsx 의 safeInternalPath 와 같은 규칙 — 같은 사이트 안 경로만, 아니면 대시보드
function safeInternalTarget(raw: string | null): { pathname: string; search: string } {
  const fallback = { pathname: "/dashboard", search: "" };
  if (!raw) return fallback;
  try {
    const base = "https://internal.invalid";
    const u = new URL(raw, base);
    if (u.origin === base && u.pathname.startsWith("/") && !u.pathname.startsWith("/auth/")) {
      return { pathname: u.pathname, search: u.search };
    }
  } catch {
    // 파싱 불가 → 안전 기본값
  }
  return fallback;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
