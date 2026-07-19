"use client";

import { useCallback, useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

// 인증 메일 재발송 버튼 — 60초 쿨다운(새로고침에도 유지) + 서버 429 반영.
// 서버(/api/auth/resend-confirmation)가 IP·이메일 단위 제한으로 최종 방어하므로
// 여기 쿨다운은 UX용 1차 저지선이다. 쿨다운은 이메일별로 적용된다(주소를
// 바꿔 다시 보내는 정상 사용을 막지 않기 위해 — 남용은 서버 IP 제한이 잡는다).

const COOLDOWN_SECONDS = 60;
const STORAGE_KEY = "mathocr_resend_confirm";

type StoredCooldown = { email: string; until: number };

function readStoredCooldown(): StoredCooldown | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCooldown;
    if (typeof parsed?.email !== "string" || typeof parsed?.until !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// 가입 직후처럼 "방금 발송됨"을 아는 시점에 쿨다운을 미리 걸어둔다.
export function startResendCooldown(email: string, seconds = COOLDOWN_SECONDS) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        email: email.trim().toLowerCase(),
        until: Date.now() + seconds * 1000,
      } satisfies StoredCooldown)
    );
  } catch {
    // 저장 실패 시 서버 제한이 대신 막는다
  }
}

export default function ResendConfirmationMail({ email }: { email: string }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  // 저장된 쿨다운 복원 — 같은 이메일에 대해서만 (새로고침·페이지 이동 대비)
  useEffect(() => {
    const stored = readStoredCooldown();
    if (!stored || stored.email !== normalizedEmail) {
      setSecondsLeft(0);
      return;
    }
    const left = Math.ceil((stored.until - Date.now()) / 1000);
    setSecondsLeft(left > 0 ? left : 0);
  }, [normalizedEmail]);

  // 1초 틱 카운트다운
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const onResend = useCallback(async () => {
    if (sending || secondsLeft > 0) return;
    if (!normalizedEmail) {
      setNotice({
        kind: "error",
        text: "이메일 칸을 먼저 입력한 뒤 눌러주세요.",
      });
      return;
    }

    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/resend-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        const retryAfter = Math.min(
          600,
          Math.max(10, Number(data?.retry_after) || COOLDOWN_SECONDS)
        );
        startResendCooldown(normalizedEmail, retryAfter);
        setSecondsLeft(retryAfter);
        setNotice({
          kind: "error",
          text:
            typeof data?.error === "string"
              ? data.error
              : "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }
      if (!res.ok) {
        setNotice({
          kind: "error",
          text:
            typeof data?.error === "string"
              ? data.error
              : "재발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }

      startResendCooldown(normalizedEmail);
      setSecondsLeft(COOLDOWN_SECONDS);
      setNotice({
        kind: "ok",
        text:
          typeof data?.message === "string"
            ? data.message
            : "인증 메일을 다시 보냈어요. 스팸함도 확인해주세요.",
      });
      trackEvent("resend_confirmation_mail");
    } catch {
      setNotice({
        kind: "error",
        text: "재발송 요청에 실패했습니다. 인터넷 연결을 확인해주세요.",
      });
    } finally {
      setSending(false);
    }
  }, [email, normalizedEmail, secondsLeft, sending]);

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={onResend}
        disabled={sending || secondsLeft > 0}
        className="font-medium text-[var(--accent)] underline underline-offset-2 hover:opacity-80 disabled:no-underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sending
          ? "보내는 중…"
          : secondsLeft > 0
            ? `인증 메일 다시 보내기 (${secondsLeft}초 후 가능)`
            : "인증 메일 다시 보내기"}
      </button>
      {notice && (
        <p
          className={`mt-1.5 leading-relaxed ${
            notice.kind === "ok" ? "text-emerald-700" : "text-red-600"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
