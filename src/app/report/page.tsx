"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";

type SubmitState = "idle" | "submitting" | "success" | "error";

interface ImageField {
  file: File | null;
  preview: string | null;
}

const EMPTY: ImageField = { file: null, preview: null };

// 업로드 전에 큰 이미지를 적당한 크기(긴 변 2000px, JPEG)로 줄인다.
// 서버/플랫폼 용량 한도(장당 2MB)에 맞추면서도 신고 확인에는 충분한 화질을 유지한다.
// 실패하면 원본을 그대로 반환하고 서버 측 한도 검사가 최종 방어선이 된다.
async function downscaleImage(
  file: File,
  maxDim = 2000,
  quality = 0.85
): Promise<File> {
  if (file.size <= 1_500_000) return file; // 이미 충분히 작으면 원본 그대로

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob || blob.size >= file.size) return file; // 줄여서 더 커지면 원본 유지

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

export default function ReportPage() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [original, setOriginal] = useState<ImageField>(EMPTY);
  const [converted, setConverted] = useState<ImageField>(EMPTY);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setLoggedIn(!!user));
  }, []);

  // 언마운트 시 미리보기 object URL 정리 (메모리 누수 방지)
  const previewsRef = useRef<{ o: string | null; c: string | null }>({
    o: null,
    c: null,
  });
  previewsRef.current = { o: original.preview, c: converted.preview };
  useEffect(
    () => () => {
      if (previewsRef.current.o) URL.revokeObjectURL(previewsRef.current.o);
      if (previewsRef.current.c) URL.revokeObjectURL(previewsRef.current.c);
    },
    []
  );

  async function pickImage(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: ImageField) => void,
    prev: ImageField
  ) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setState("idle");
    setMessage("");

    let finalFile = file;
    try {
      finalFile = await downscaleImage(file);
    } catch {
      finalFile = file;
    }

    // 자동 축소 후에도 2MB를 넘으면(드문 경우) 거절
    if (finalFile.size > 2 * 1024 * 1024) {
      setMessage("이미지 용량이 너무 큽니다. 더 작은 이미지를 사용해주세요.");
      setState("error");
      input.value = "";
      return;
    }

    if (prev.preview) URL.revokeObjectURL(prev.preview);
    setter({ file: finalFile, preview: URL.createObjectURL(finalFile) });
    input.value = ""; // 같은 파일 재선택 허용
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!original.file || !converted.file) {
      setMessage("원본 시험지와 변환 결과 이미지를 모두 첨부해주세요.");
      setState("error");
      return;
    }
    if (comment.trim().length === 0) {
      setMessage("어떤 부분이 잘못 변환됐는지 설명을 입력해주세요.");
      setState("error");
      return;
    }

    setState("submitting");
    setMessage("");

    const form = new FormData();
    form.append("original", original.file);
    form.append("converted", converted.file);
    form.append("comment", comment.trim());

    try {
      const res = await fetch("/api/reports", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "신고 접수에 실패했습니다. 잠시 후 다시 시도해주세요.");
        setState("error");
        return;
      }
      setState("success");
      trackEvent("submit_report");
      if (original.preview) URL.revokeObjectURL(original.preview);
      if (converted.preview) URL.revokeObjectURL(converted.preview);
      setOriginal(EMPTY);
      setConverted(EMPTY);
      setComment("");
    } catch {
      setMessage("네트워크 오류로 접수하지 못했습니다.");
      setState("error");
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 상단 바 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-screen-lg mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={36} height={36} />
            <span className="text-lg font-bold tracking-tight">
              AI Math<span className="text-[var(--accent)]">OCR</span>
            </span>
          </a>
          <a href="/" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            ← 홈으로
          </a>
        </div>
      </header>

      <main className="max-w-screen-lg mx-auto px-6 py-12 lg:py-16">
        {/* 헤더 */}
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-4 py-1.5 mb-6">
            <span>⚠</span> 변환 문제 신고
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">
            변환이 잘 안됐나요?
          </h1>
          <p className="text-lg text-zinc-600 leading-relaxed">
            시험지의 상태에 따라 변환이 잘 안 될 수 있어요. 아래 내용을 먼저
            확인해주시고, 그래도 결과가 이상하다면 직접 신고해주세요.
          </p>
        </div>

        {/* 안내 3블록 */}
        <div className="grid md:grid-cols-3 gap-4 mt-10">
          <div className="card rounded-xl p-6">
            <div className="text-2xl mb-3">🖼️</div>
            <h3 className="font-semibold mb-2">선명한 파일을 써주세요</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              화질이 좋은 이미지나 PDF를 사용해주세요. 흐릿하거나 기울어진 사진,
              그림자가 진 스캔본은 인식 정확도가 떨어집니다.
            </p>
          </div>
          <div className="card rounded-xl p-6">
            <div className="text-2xl mb-3">↩️</div>
            <h3 className="font-semibold mb-2">실패하면 크레딧이 자동 반환돼요</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              변환이 끝나면 프로그램에 완료 창이 뜨는데, 일부 문제가 인식에 실패했다면{" "}
              <span className="font-semibold text-zinc-800">
                “N개 문제 실패 → N크레딧 자동 반환”
              </span>{" "}
              이라고 함께 안내돼요. 반환된 크레딧은 마이페이지 변환 이력에서도 확인할 수 있어요.
            </p>
          </div>
          <div className="card rounded-xl p-6 !border-[var(--accent)]">
            <div className="text-2xl mb-3">🎁</div>
            <h3 className="font-semibold mb-2">채택되면 50크레딧 지급</h3>
            <p className="text-sm text-zinc-600 leading-relaxed">
              신고해주신 내용이 실제 변환 개선에 반영되면{" "}
              <span className="font-semibold text-[var(--accent)]">
                50크레딧(50문제분)
              </span>
              을 감사의 의미로 드립니다.
            </p>
          </div>
        </div>

        {/* 신고 폼 */}
        <section className="mt-14">
          <h2 className="text-2xl font-bold tracking-tight mb-2">신고하기</h2>
          <p className="text-zinc-600 mb-8 leading-relaxed">
            모든 변환을 신고하실 필요는 없어요. 다만{" "}
            <span className="font-medium text-zinc-800">
              화질이 좋은 원본인데도 결과가 이상하게 나왔다면
            </span>
            {" "}— 특히 수학 수식이 잘못 변환된 경우처럼 명백히 틀렸다면 — 아래{" "}
            <span className="font-medium text-zinc-800">[신고 보내기]</span>로
            어떤 부분이 잘못됐는지 알려주세요. 큰 도움이 됩니다.
          </p>

          {loggedIn === false ? (
            <div className="card rounded-2xl p-10 text-center">
              <p className="text-zinc-600 mb-5">
                신고는 로그인한 회원만 보낼 수 있어요. (보상 지급과 처리 안내를 위해 필요해요)
              </p>
              <a
                href="/auth/login?redirect=/report"
                className="btn-primary inline-block px-6 py-3 rounded-lg text-[15px]"
              >
                로그인하고 신고하기
              </a>
            </div>
          ) : state === "success" ? (
            <div className="card rounded-2xl p-10 text-center !border-emerald-300 bg-emerald-50/40">
              <div className="text-3xl mb-3">✅</div>
              <h3 className="text-lg font-semibold mb-2">신고가 접수되었습니다</h3>
              <p className="text-zinc-600 mb-6">
                소중한 제보 감사합니다. 검토 후 변환 개선에 반영되면 50크레딧을 지급해 드릴게요.
              </p>
              <button
                onClick={() => setState("idle")}
                className="btn-outline px-5 py-2.5 rounded-lg text-sm"
              >
                다른 문제 신고하기
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 좌: 원본 / 우: 결과 */}
              <div className="grid md:grid-cols-2 gap-5">
                <ImagePicker
                  title="① 원본 시험지"
                  hint="잘못 변환된 부분이 있는 원본 문제 이미지"
                  field={original}
                  onPick={(e) => pickImage(e, setOriginal, original)}
                />
                <ImagePicker
                  title="② 변환된 결과"
                  hint="HWP/화면에서 잘못 나온 결과를 캡쳐한 이미지"
                  field={converted}
                  onPick={(e) => pickImage(e, setConverted, converted)}
                />
              </div>

              {/* 코멘트 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  ③ 어떤 부분이 잘못 변환됐나요?
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                  rows={5}
                  placeholder="예) 3번 문제의 분수가 1/2이 아니라 12로 변환됐어요. 루트 안의 식도 깨졌습니다."
                  className="w-full px-4 py-3 rounded-xl bg-white border border-[var(--border-light)] text-zinc-900 placeholder-zinc-400 text-sm leading-relaxed focus:outline-none focus:border-[var(--accent)] transition-colors resize-y"
                />
                <div className="text-right text-xs text-zinc-400 mt-1">
                  {comment.length} / 2000
                </div>
              </div>

              {state === "error" && message && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={state === "submitting" || loggedIn === null}
                className="btn-primary px-8 py-3.5 rounded-lg text-[15px] disabled:opacity-50"
              >
                {state === "submitting" ? "접수 중..." : "신고 보내기"}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

function ImagePicker({
  title,
  hint,
  field,
  onPick,
}: {
  title: string;
  hint: string;
  field: ImageField;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <div className="text-sm font-medium text-zinc-700 mb-1">{title}</div>
      <p className="text-xs text-zinc-500 mb-2">{hint}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-[var(--border-light)] hover:border-[var(--accent)] bg-zinc-50 hover:bg-[var(--accent-soft)] transition-colors flex items-center justify-center overflow-hidden"
      >
        {field.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={field.preview} alt={title} className="w-full h-full object-contain" />
        ) : (
          <span className="text-sm text-zinc-400">클릭해서 이미지 선택</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onPick}
        className="hidden"
      />
      {field.file && (
        <p className="text-xs text-zinc-500 mt-1.5 truncate">{field.file.name}</p>
      )}
    </div>
  );
}
