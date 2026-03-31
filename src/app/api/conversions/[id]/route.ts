import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 변환 상태 업데이트 (완료/실패)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  const { id } = await params;

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const { status } = await request.json();

  if (!["completed", "failed"].includes(status)) {
    return NextResponse.json(
      { error: "유효하지 않은 상태입니다. (completed 또는 failed)" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // 현재 변환 정보 조회
  const { data: conversion } = await adminClient
    .from("conversions")
    .select("credits_used, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!conversion) {
    return NextResponse.json(
      { error: "변환 기록을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (conversion.status !== "started") {
    return NextResponse.json(
      { error: "이미 처리된 변환입니다." },
      { status: 409 }
    );
  }

  // 상태 업데이트
  const { error } = await adminClient
    .from("conversions")
    .update({ status })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 실패 시 크레딧 환불
  if (status === "failed" && conversion.credits_used > 0) {
    await adminClient.rpc("add_credits_raw", {
      p_user_id: user.id,
      p_credits: conversion.credits_used,
    });
  }

  return NextResponse.json({ success: true, status });
}
