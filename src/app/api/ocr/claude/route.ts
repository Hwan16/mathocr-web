import { getAuthUser } from "@/lib/supabase/auth-helper";
import { NextRequest, NextResponse } from "next/server";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// Claude Vision 프록시
// 데스크톱 앱 → 우리 서버 → Claude API (API 키는 서버에만)
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "인증되지 않았습니다." }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  try {
    const body = await request.json();
    // body: { model, max_tokens, system, messages }

    const response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? `Claude API 오류 (HTTP ${response.status})` },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: `프록시 오류: ${error instanceof Error ? error.message : "알 수 없는 오류"}` },
      { status: 500 }
    );
  }
}
