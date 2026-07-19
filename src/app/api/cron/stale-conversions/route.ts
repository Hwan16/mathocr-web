import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 방치된 변환 자동 환불 — vercel.json cron이 매시간 호출한다.
//
// 배경(제3자 리뷰 2026-07-19, CHECKLIST Phase 74): 변환 중 앱 프로세스가 죽으면
// (한/글 COM 크래시·강제 종료·정전) 환불 경로가 전부 앱 생존을 전제하므로
// 차감된 크레딧이 영영 돌아오지 않았다. 앱의 변환 ID는 메모리에만 있어
// 재시작해도 복구 요청을 못 보낸다. 이 cron이 서버 측 최후 안전망.
//
// 판정: status='started'이고 시작 후 STALE_AFTER_HOURS 지난 변환.
//  - 정상 변환은 아무리 커도 1시간 내 종료(50문제 상한·OCR 호출당 60초 timeout,
//    credit-guard의 활성 창도 60분). 3시간이면 3배 여유 — 오탐으로 진행 중인
//    변환을 환불할 가능성은 사실상 없다.
//  - 환불은 기존 finalize_conversion RPC 재사용: started 행만 원자적으로
//    failed로 전환+전액 환불하므로, 극단적으로 앱이 3시간 뒤에 완료를 보고해도
//    이중 처리가 없다(먼저 닿은 쪽만 성공). 그 경우 사용자는 결과물+환불을
//    모두 갖게 되는데, 빈도상 무시 가능하고 사용자에게 유리한 방향이라 수용.
//
// 실행 결과는 응답 JSON과 Vercel 로그([stale-conversions])로 남는다.

export const dynamic = "force-dynamic";

const STALE_AFTER_HOURS = 3;
const MAX_PER_RUN = 100; // 안전 상한 — 밀린 분은 다음 시간 실행이 처리

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000
  ).toISOString();

  const admin = createAdminClient();
  const { data: stale, error: queryError } = await admin
    .from("conversions")
    .select("id, user_id, credits_used, created_at")
    .eq("status", "started")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (queryError) {
    console.error("[stale-conversions] 조회 실패:", queryError.message);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  let refundedConversions = 0;
  let refundedCredits = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of stale ?? []) {
    const { data, error } = await admin.rpc("finalize_conversion", {
      p_conversion_id: row.id,
      p_user_id: row.user_id,
      p_status: "failed",
    });
    if (error) {
      failed += 1;
      console.error(
        `[stale-conversions] 환불 실패: conversion=${row.id} — ${error.message}`
      );
      continue;
    }
    if (data?.success) {
      refundedConversions += 1;
      refundedCredits += data.refunded ?? 0;
      console.info(
        `[stale-conversions] 환불: conversion=${row.id} credits=${data.refunded} started_at=${row.created_at}`
      );
    } else {
      // not_pending: 조회와 처리 사이에 앱이 완료/실패를 보고한 경우 — 정상
      skipped += 1;
    }
  }

  if (refundedConversions > 0 || failed > 0) {
    console.info(
      `[stale-conversions] 요약: 대상 ${stale?.length ?? 0}건, 환불 ${refundedConversions}건(${refundedCredits}크레딧), 건너뜀 ${skipped}, 실패 ${failed}`
    );
  }

  return NextResponse.json({
    checked: stale?.length ?? 0,
    refunded_conversions: refundedConversions,
    refunded_credits: refundedCredits,
    skipped,
    failed,
  });
}
