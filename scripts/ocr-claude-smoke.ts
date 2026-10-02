// 프록시 정책(ocr-claude.ts)을 실제 Anthropic API에 붙여 보는 스모크 테스트 (인증·상한 계층 제외).
// 데스크톱 앱이 보내는 요청 본문(JSON 파일)을 받아 라우트와 같은 함수(runClaudeCall →
// responsePayload)로 처리하고, 앱이 받게 될 최종 응답을 저장한다.
// 실행: node --experimental-strip-types scripts/ocr-claude-smoke.ts <요청.json> [...]
// ⚠️ 실제 API 비용이 나간다(건당 약 15원). 키는 .env.local 의 ANTHROPIC_API_KEY.
import { readFileSync, writeFileSync } from "node:fs";

import {
  type ClaudeAttempt,
  type ClaudeCallPlan,
  DEFAULT_MODEL,
  classifySystemPrompt,
  responsePayload,
  runClaudeCall,
} from "../src/lib/ocr-claude.ts";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const apiKey = /^ANTHROPIC_API_KEY=(.+)$/m.exec(env)?.[1].trim().replace(/^["']|["']$/g, "");
if (!apiKey) throw new Error("ANTHROPIC_API_KEY 없음");

async function call(plan: ClaudeCallPlan): Promise<ClaudeAttempt> {
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(plan.body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data, durationMs: Date.now() - startedAt };
}

const blockTypes = (data: Record<string, unknown>) =>
  Array.isArray(data.content) ? (data.content as { type: string }[]).map((b) => b.type) : [];

for (const file of process.argv.slice(2)) {
  const request = JSON.parse(readFileSync(file, "utf8"));
  const prompt = classifySystemPrompt(request.system);
  if (!prompt) throw new Error(`${file}: 허용되지 않은 프롬프트`);
  const run = await runClaudeCall(
    {
      configuredModel: DEFAULT_MODEL,
      prompt,
      system: request.system,
      messages: request.messages,
      maxTokens: request.max_tokens,
    },
    call
  );
  const out = responsePayload(run);
  writeFileSync(file.replace(".request.json", ".response.json"), JSON.stringify(out));
  console.log(
    JSON.stringify({
      file: file.split(/[\\/]/).pop(),
      kind: prompt.kind,
      model: run.plan.model,
      status: run.attempt.status,
      seconds: run.attempt.durationMs / 1000,
      upstream_blocks: blockTypes(run.attempt.data),
      returned_blocks: blockTypes(out),
      stop_reason: out.stop_reason,
      max_tokens: run.plan.body.max_tokens,
      fallback: run.failed?.reason ?? null,
      usage: out.usage,
    })
  );
}
