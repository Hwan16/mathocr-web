import { getAuthUser } from "@/lib/supabase/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// 오류 로그 전송 (데스크톱 앱에서 호출)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();

  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const { conversion_id, error_type, error_message, stack_trace, metadata } =
    await request.json();

  if (!error_type || !error_message) {
    return NextResponse.json(
      { error: "error_type과 error_message는 필수입니다." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("error_logs")
    .insert({
      user_id: user.id,
      conversion_id: conversion_id ?? null,
      error_type,
      error_message,
      stack_trace: stack_trace ?? null,
      metadata: metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log_id: data.id });
}
