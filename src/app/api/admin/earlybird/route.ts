import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// 관리자: 얼리버드 현황 — 메일 수신 동의자 명단 + 요약 (0013/0014)
// 사용처: 관리자 대시보드 '얼리버드' 탭. 발송은 POST /api/admin/earlybird/send.

async function requireAdmin() {
  const user = await getAuthUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return null;
  return user;
}

type SubscriberRow = {
  email: string | null;
  created_at: string;
  credits: number;
  expires_at: string | null;
  utm_source: string | null;
  earlybird_mail_sent_at?: string | null;
};

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const adminClient = createAdminClient();

  // 동의자 명단 (0014 미적용 환경에서도 죽지 않도록 발송 컬럼 없이 폴백 재조회)
  const first = await adminClient
    .from("profiles")
    .select("email, created_at, credits, expires_at, utm_source, earlybird_mail_sent_at")
    .eq("marketing_opt_in", true)
    .order("created_at", { ascending: false })
    .limit(1000);
  let subscribers = first.data as SubscriberRow[] | null;
  let error = first.error;

  if (error) {
    const fallback = await adminClient
      .from("profiles")
      .select("email, created_at, credits, expires_at, utm_source")
      .eq("marketing_opt_in", true)
      .order("created_at", { ascending: false })
      .limit(1000);
    subscribers = fallback.data as SubscriberRow[] | null;
    error = fallback.error;
  }

  if (error || !subscribers) {
    return NextResponse.json({ error: "명단 조회 실패" }, { status: 500 });
  }

  const rows = subscribers as SubscriberRow[];
  const mailSent = rows.filter((s) => s.earlybird_mail_sent_at).length;

  // 얼리버드 코드 소진 현황 (선착순 잔여 확인용)
  let redeemed: number | null = null;
  let cap: number | null = null;
  const { data: code } = await adminClient
    .from("promo_codes")
    .select("id, max_uses, is_active")
    .eq("code", "earlybird")
    .maybeSingle();
  if (code) {
    cap = code.max_uses;
    const { count } = await adminClient
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", code.id);
    redeemed = count ?? 0;
  }

  return NextResponse.json({
    summary: {
      opted_in: rows.length,
      mail_sent: mailSent,
      mail_pending: rows.length - mailSent,
      earlybird_redeemed: redeemed,
      earlybird_cap: cap,
      earlybird_code_active: code?.is_active ?? null,
    },
    subscribers: rows.map((s) => ({
      email: s.email,
      created_at: s.created_at,
      credits: s.credits,
      expires_at: s.expires_at,
      utm_source: s.utm_source,
      mail_sent_at: s.earlybird_mail_sent_at ?? null,
    })),
  });
}
