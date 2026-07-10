import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

// 관리자: 얼리버드 신청 현황 (0015 신청제) — 신청자 명단 + 요약
// 사용처: 관리자 대시보드 '얼리버드' 탭. 발송은 POST /api/admin/earlybird/send.

const APPLY_CAP = 200; // /api/earlybird/apply 와 동일하게 유지

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

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const adminClient = createAdminClient();

  const { data: applicants, error } = await adminClient
    .from("earlybird_signups")
    .select("email, created_at, utm_source, mail_sent_at, unsubscribed_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error || !applicants) {
    return NextResponse.json(
      { error: "명단 조회 실패 — 0015 마이그레이션 적용 여부를 확인하세요." },
      { status: 500 }
    );
  }

  const mailSent = applicants.filter((a) => a.mail_sent_at).length;
  const unsubscribed = applicants.filter((a) => a.unsubscribed_at).length;

  // 얼리버드 코드 상태 (오픈까지 비활성 보관 → 오픈 날 활성화 후 발송)
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
      applied: applicants.length,
      apply_cap: APPLY_CAP,
      mail_sent: mailSent,
      unsubscribed,
      mail_pending: applicants.length - mailSent - unsubscribed,
      earlybird_redeemed: redeemed,
      earlybird_cap: cap,
      earlybird_code_active: code?.is_active ?? null,
    },
    applicants,
  });
}
