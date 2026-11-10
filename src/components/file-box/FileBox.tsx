"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOWNLOAD_URL } from "@/lib/download";
import { shareFileLink } from "@/lib/kakao-share";
import {
  expiryInfo,
  formatDateTime,
  formatDay,
  formatMonthDay,
  formatSize,
  type ExpiryState,
  type Preview,
  type StoredFile,
} from "@/lib/file-box-types";
import FirstProblem from "./FirstProblem";
import Wordmark from "@/components/Wordmark";
import FolderIcon from "@/components/FolderIcon";
import { FileListSkeleton, PreviewSkeleton } from "@/components/Skeleton";

// 내 파일함(D-054) — 시안 docs/mockups/my-files.html 을 옮긴 것.
// 목록(위: 보관 중, 아래: 만료된 파일) + 오른쪽 첫 문제 미리보기(폰은 전체 화면).
// 보관 기한: 8일 이상 회색 → 7일 이하 주황 → 내일 빨간 테두리 → 오늘 빨간 칠. 만료 줄은 체크칸만 동작.

type Tab = "all" | "soon";
type Sort = "new" | "expire";
type DownState = "busy" | "done";
type PreviewData = { preview: Preview | null; image_url: string | null } | "error";

// ── 아이콘(시안과 같은 선 아이콘) ──
const Clock = ({ s = 12 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 20h14" />
  </svg>
);
const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 7h16" />
    <path d="M10 11v6M14 11v6" />
    <path d="M6 7l1 13h10l1-13" />
    <path d="M9 7V4h6v3" />
  </svg>
);
// 카카오 말풍선(카카오 로그인 버튼 가이드 모양) — 노란 바탕 위 검정
const KakaoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#000" d="M12 3.5c-5.25 0-9.5 3.33-9.5 7.44 0 2.66 1.78 5 4.46 6.31l-.9 3.32c-.08.3.26.53.52.36l3.95-2.6c.48.05.97.08 1.47.08 5.25 0 9.5-3.33 9.5-7.47S17.25 3.5 12 3.5z" />
  </svg>
);
const Spinner = () => (
  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
const Check = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
const FileIcon = ({ muted }: { muted?: boolean }) => (
  <svg width="28" height="32" viewBox="0 0 28 32" aria-hidden="true">
    <path d="M3 1h15l7 7v21a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill={muted ? "#fafafa" : "#fff"} stroke={muted ? "#e4e4e7" : "#d4d4d8"} />
    <path d="M18 1v7h7" fill="none" stroke={muted ? "#e4e4e7" : "#d4d4d8"} />
    <text x="13" y="24" textAnchor="middle" fontSize="7.5" fontWeight="700" fill={muted ? "#a1a1aa" : "#2563eb"}>
      HWP
    </text>
  </svg>
);

const SOON: ExpiryState[] = ["today", "tomorrow", "soon"];

function ExpiryLabel({ f, compact, now }: { f: StoredFile; compact?: boolean; now: Date }) {
  const { exp, daysLeft, state } = expiryInfo(f, now);
  const date = `${formatDay(exp, now)}까지`;
  switch (state) {
    case "expired":
      return (
        <>
          <span className="text-sm text-zinc-400">만료됨</span>
          {!compact && <div className="text-xs text-zinc-400 tabular-nums">{formatDay(exp, now)}</div>}
        </>
      );
    case "today":
      return (
        <>
          <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            <Clock />
            오늘 만료
          </span>
          {!compact && <div className="mt-0.5 text-xs font-semibold text-red-700 tabular-nums">오늘 23:59까지</div>}
        </>
      );
    case "tomorrow":
      return (
        <>
          <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">
            <Clock />
            내일 만료
          </span>
          {!compact && <div className="mt-0.5 text-xs text-red-700 tabular-nums">{date}</div>}
        </>
      );
    case "soon":
      return (
        <>
          <span className="text-sm font-medium text-amber-700 tabular-nums">{daysLeft}일 남음</span>
          {!compact && <div className="text-xs text-amber-700 tabular-nums">{date}</div>}
        </>
      );
    default:
      return (
        <>
          <span className="text-sm text-zinc-700 tabular-nums">{daysLeft}일 남음</span>
          {!compact && <div className="text-xs text-zinc-500 tabular-nums">{date}</div>}
        </>
      );
  }
}

async function apiJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

/** 서명 URL로 받기 — 주소에 받을 이름이 들어 있어 브라우저가 바로 저장한다. */
function startBrowserDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function FileBox({ email }: { email: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [files, setFiles] = useState<StoredFile[] | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, PreviewData>>({});
  const [downloading, setDownloading] = useState<Record<string, DownState>>({});
  const [zipping, setZipping] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteOkRef = useRef<HTMLButtonElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await apiJson<{ enabled: boolean; truncated?: boolean; files: StoredFile[] }>("/api/files", { cache: "no-store" });
      setFiles(data.files);
      setEnabled(data.enabled);
      setTruncated(Boolean(data.truncated));
      setNow(new Date());
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "파일 목록을 불러오지 못했습니다.");
      setFiles((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 앱의 [내 파일함에서 보기] — /files?f=<id> 로 열면 그 파일을 골라 둔다(폰은 미리보기를 연다)
  const wanted = searchParams.get("f");
  useEffect(() => {
    if (!files || !wanted) return;
    const f = files.find((x) => x.id === wanted);
    if (f && !f.expired) {
      setSelectedId(f.id);
      if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
      document.querySelector(`[data-row="${f.id}"]`)?.scrollIntoView({ block: "center" });
    }
  }, [files, wanted]);

  // 첫 화면: 아무것도 고르지 않았으면 맨 위의 살아 있는 파일을 미리보기로 — 미리보기 칸이 늘 보이는
  // 넓은 화면에서만(폰은 누를 때 연다 — 미리 골라 두면 첫 줄만 색이 칠해져 헷갈린다)
  useEffect(() => {
    if (!files || selectedId || wanted) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const first = files.find((f) => !expiryInfo(f, now).state.startsWith("expired"));
    if (first) setSelectedId(first.id);
  }, [files, selectedId, wanted, now]);

  // 고른 파일의 미리보기 가져오기
  useEffect(() => {
    if (!selectedId || previews[selectedId]) return;
    apiJson<{ preview: Preview | null; image_url: string | null }>(`/api/files/${selectedId}`)
      .then((d) => setPreviews((p) => ({ ...p, [selectedId]: d })))
      .catch(() => setPreviews((p) => ({ ...p, [selectedId]: "error" })));
  }, [selectedId, previews]);

  const { live, expired, counts } = useMemo(() => {
    const all = files ?? [];
    const q = query.trim().toLowerCase();
    let v = q ? all.filter((f) => f.file_name.toLowerCase().includes(q)) : all;
    if (tab === "soon") v = v.filter((f) => SOON.includes(expiryInfo(f, now).state));
    const isEx = (f: StoredFile) => expiryInfo(f, now).state === "expired";
    const live = v
      .filter((f) => !isEx(f))
      .sort((a, b) =>
        sort === "new"
          ? b.created_at.localeCompare(a.created_at)
          : a.expires_at.localeCompare(b.expires_at)
      );
    const expired = v.filter(isEx).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const counts = {
      all: all.length,
      soon: all.filter((f) => SOON.includes(expiryInfo(f, now).state)).length,
    };
    return { live, expired, counts };
  }, [files, query, tab, sort, now]);

  const selected = files?.find((f) => f.id === selectedId && expiryInfo(f, now).state !== "expired") ?? null;
  const allLiveChecked = live.length > 0 && live.every((f) => checked.has(f.id));
  const someLiveChecked = !allLiveChecked && live.some((f) => checked.has(f.id));
  const checkedHasExpired = [...checked].some((id) => {
    const f = files?.find((x) => x.id === id);
    return !f || expiryInfo(f, now).state === "expired";
  });

  function toggleCheck(id: string, on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllLive(on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      live.forEach((f) => (on ? next.add(f.id) : next.delete(f.id)));
      return next;
    });
  }

  function openFile(f: StoredFile) {
    if (expiryInfo(f, now).state === "expired") return;
    setSelectedId(f.id);
    if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
  }

  async function downloadOne(f: StoredFile) {
    if (downloading[f.id] === "busy") return;
    setDownloading((d) => ({ ...d, [f.id]: "busy" }));
    try {
      const { url } = await apiJson<{ url: string }>(`/api/files/${f.id}/download`);
      startBrowserDownload(url);
      setDownloading((d) => ({ ...d, [f.id]: "done" }));
      showToast(`받았어요 · ${f.file_name}`);
      setTimeout(() => setDownloading((d) => {
        const n = { ...d };
        delete n[f.id];
        return n;
      }), 2200);
    } catch (e) {
      setDownloading((d) => {
        const n = { ...d };
        delete n[f.id];
        return n;
      });
      showToast(e instanceof Error ? e.message : "파일을 받지 못했습니다.");
      if (e instanceof Error && e.message.includes("보관 기간")) load();
    }
  }

  async function downloadChecked() {
    const targets = (files ?? []).filter((f) => checked.has(f.id));
    if (targets.length === 0 || checkedHasExpired) return;
    if (targets.length === 1) return downloadOne(targets[0]);
    setZipping(true);
    try {
      const { zipSync } = await import("fflate");
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      for (const f of targets) {
        const { url } = await apiJson<{ url: string }>(`/api/files/${f.id}/download`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`'${f.file_name}'을(를) 받지 못했습니다.`);
        let name = f.file_name;
        for (let n = 2; entries[name]; n++) name = f.file_name.replace(/(\.hwpx?)$/i, `(${n})$1`);
        // 한글 파일은 이미 압축돼 있어 다시 압축하지 않는다(level 0 — 빠르고 크기 차이 거의 없음)
        entries[name] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
      }
      const zipped = zipSync(entries);
      const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      a.href = href;
      a.download = `내파일함_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
      showToast(`${targets.length}개를 압축 파일(zip) 하나로 받았어요`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "압축 파일을 만들지 못했습니다.");
    } finally {
      setZipping(false);
    }
  }

  async function shareKakao(f: StoredFile) {
    try {
      const s = await apiJson<{ url: string; expires_at: string }>(`/api/files/${f.id}/share`, { method: "POST" });
      const parts = [`문제 ${f.problem_count}`];
      if (f.solution_count) parts.push(`해설 ${f.solution_count}`);
      const ok = await shareFileLink({
        url: s.url,
        title: f.file_name.replace(/\.hwpx?$/i, ""),
        description: `${parts.join(" · ")} · ${formatMonthDay(new Date(s.expires_at))}까지 받을 수 있어요`,
      });
      if (!ok) {
        await navigator.clipboard?.writeText(s.url).catch(() => {});
        showToast("카카오톡을 열 수 없어 받기 링크를 복사했어요");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "받기 링크를 만들지 못했습니다.");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const ids = pendingDelete;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await apiJson(`/api/files/${id}`, { method: "DELETE" });
      } catch {
        failed.push(id);
      }
    }
    const done = ids.filter((id) => !failed.includes(id));
    const allExpired = ids.every((id) => {
      const f = files?.find((x) => x.id === id);
      return !f || expiryInfo(f, now).state === "expired";
    });
    setFiles((prev) => (prev ?? []).filter((f) => !done.includes(f.id)));
    setChecked((prev) => new Set([...prev].filter((id) => !done.includes(id))));
    if (selectedId && done.includes(selectedId)) {
      setSelectedId(null);
      setSheetOpen(false);
    }
    setDeleting(false);
    setPendingDelete(null);
    showToast(
      failed.length
        ? `${failed.length}개는 지우지 못했어요. 잠시 후 다시 시도해 주세요.`
        : allExpired
          ? `${done.length}개를 목록에서 지웠어요`
          : `${done.length}개를 삭제했어요`
    );
  }

  async function toggleEnabled() {
    const next = !enabled;
    setEnabled(next);
    try {
      await apiJson("/api/files/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      showToast(next ? "변환할 때 자동으로 보관해요" : "자동 보관을 껐어요. 이미 보관된 파일은 그대로 있어요");
    } catch (e) {
      setEnabled(!next);
      showToast(e instanceof Error ? e.message : "설정을 바꾸지 못했습니다.");
    }
  }

  async function logout() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  // Esc — 확인 창·폰 미리보기 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pendingDelete && !deleting) setPendingDelete(null);
      else setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingDelete, deleting]);

  useEffect(() => {
    if (pendingDelete) deleteOkRef.current?.focus();
  }, [pendingDelete]);

  // ── 조각 ──

  const downloadButtonInner = (f: StoredFile) =>
    downloading[f.id] === "busy" ? (
      <>
        <Spinner />
        받는 중…
      </>
    ) : downloading[f.id] === "done" ? (
      <>
        <Check />
        받았어요
      </>
    ) : (
      <>
        <DownloadIcon />
        한글 파일 받기
      </>
    );

  const renderRow = (f: StoredFile) => {
    const info = expiryInfo(f, now);
    const ex = info.state === "expired";
    const sel = !ex && f.id === selectedId;
    const meta = `문제 ${f.problem_count}${f.solution_count ? ` · 해설 ${f.solution_count}` : ""}`;
    return (
      <li
        key={f.id}
        data-row={f.id}
        className={`row-grid px-1 py-3 ${sel ? "bg-violet-50/70" : ex ? "" : "hover:bg-zinc-50"} ${ex ? "" : "cursor-pointer"}`}
        onClick={() => openFile(f)}
      >
        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="fb-check"
            checked={checked.has(f.id)}
            onChange={(e) => toggleCheck(f.id, e.target.checked)}
            aria-label={`${f.file_name} 선택`}
          />
        </div>
        <div className="min-w-0 flex items-center gap-3 pl-1">
          <span className="shrink-0">
            <FileIcon muted={ex} />
          </span>
          <div className="min-w-0">
            {ex ? (
              <span className="block line-clamp-2 text-sm text-zinc-400" title="보관 기간이 지나 파일이 지워졌어요">
                {f.file_name}
              </span>
            ) : (
              <button
                type="button"
                className={`line-clamp-2 text-left text-sm font-medium ${sel ? "text-zinc-900" : "text-zinc-800"} hover:underline underline-offset-2`}
                onClick={(e) => {
                  e.stopPropagation();
                  openFile(f);
                }}
              >
                {f.file_name}
              </button>
            )}
            <div className={`text-xs ${ex ? "text-zinc-400" : "text-zinc-500"} tabular-nums truncate`}>
              <span className="sm:hidden">{formatDateTime(new Date(f.created_at), now)} · </span>
              {meta}
            </div>
            <div className="sm:hidden mt-1">
              <ExpiryLabel f={f} compact now={now} />
            </div>
          </div>
        </div>
        <div className={`hidden sm:block text-sm tabular-nums ${ex ? "text-zinc-400" : "text-zinc-600"}`}>
          {formatDateTime(new Date(f.created_at), now)}
        </div>
        <div className="hidden sm:block">
          <ExpiryLabel f={f} now={now} />
        </div>
        <div className="flex justify-center">
          {!ex && (
            <button
              type="button"
              className={`p-2 rounded-lg hover:bg-zinc-100 ${downloading[f.id] === "done" ? "text-violet-700" : "text-zinc-500 hover:text-zinc-900"}`}
              onClick={(e) => {
                e.stopPropagation();
                downloadOne(f);
              }}
              aria-label={`${f.file_name} 받기`}
              title="한글 파일 받기"
            >
              {downloading[f.id] === "busy" ? <Spinner /> : downloading[f.id] === "done" ? <Check /> : <DownloadIcon />}
            </button>
          )}
        </div>
      </li>
    );
  };

  const renderPreview = (f: StoredFile | null, inSheet?: boolean) => {
    if (!f) {
      return (
        <div className="px-6 py-20 text-center">
          <p className="text-sm text-zinc-500">파일을 고르면 여기에서 첫 문제를 미리 볼 수 있어요.</p>
        </div>
      );
    }
    const info = expiryInfo(f, now);
    const tone =
      info.state === "today"
        ? "text-red-700 font-semibold"
        : info.state === "tomorrow"
          ? "text-red-700"
          : info.state === "soon"
            ? "text-amber-700"
            : "text-zinc-500";
    const left = info.state === "today" ? "오늘 만료" : info.state === "tomorrow" ? "내일 만료" : `${info.daysLeft}일 남음`;
    const p = previews[f.id];
    return (
      <>
        <div className="px-5 pt-5 pb-4 border-b border-zinc-100">
          <div className="flex items-start gap-3">
            <span className="shrink-0 mt-0.5">
              <FileIcon />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-snug break-words">{f.file_name}</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs tabular-nums">
                <dt className="text-zinc-400">변환</dt>
                <dd className="text-zinc-600">{formatDateTime(new Date(f.created_at), now)}</dd>
                <dt className="text-zinc-400">보관</dt>
                <dd className={tone}>
                  {formatDay(info.exp, now)}까지 · {left}
                </dd>
                <dt className="text-zinc-400">내용</dt>
                <dd className="text-zinc-600">
                  문제 {f.problem_count}
                  {f.solution_count ? ` · 해설 ${f.solution_count}` : " · 해설 없음"}
                  {f.figure_count ? ` · 그림 ${f.figure_count}` : ""} · {formatSize(f.size_bytes)}
                </dd>
              </dl>
            </div>
          </div>
          {!inSheet && (
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm inline-flex items-center justify-center gap-1.5" onClick={() => downloadOne(f)}>
                {downloadButtonInner(f)}
              </button>
              {/* 카카오 노랑 + 말풍선 + 글자(카카오 로그인 버튼 느낌, 사용자 요청 11-06) */}
              <button type="button" className="kakao-btn shrink-0 rounded-lg px-4 py-2.5 text-sm inline-flex items-center justify-center gap-1.5" onClick={() => shareKakao(f)} aria-label="카카오톡으로 보내기" title="카카오톡으로 보내기">
                <KakaoIcon />
                카카오톡
              </button>
              <button type="button" className="btn-outline rounded-lg px-3 py-2.5 text-sm text-zinc-600" onClick={() => setPendingDelete([f.id])} aria-label="삭제" title="삭제">
                <TrashIcon />
              </button>
            </div>
          )}
        </div>
        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">첫 문제 미리보기</h3>
            <span className="text-xs text-zinc-400 tabular-nums">전체 {f.problem_count}문제</span>
          </div>
          <div className="mt-3">
            {p === undefined ? (
              <PreviewSkeleton />
            ) : p === "error" ? (
              <p className="text-sm text-zinc-500">미리보기를 불러오지 못했어요. 한글 파일을 받아서 확인해 주세요.</p>
            ) : p.preview ? (
              <FirstProblem preview={p.preview} figureUrl={p.image_url} />
            ) : (
              <p className="text-sm text-zinc-500">이 파일은 미리보기가 없어요. 한글 파일을 받아서 확인해 주세요.</p>
            )}
          </div>
          {f.problem_count > 1 && <p className="mt-5 text-sm text-zinc-500">나머지 {f.problem_count - 1}문제는 한글 파일에서 확인하세요.</p>}
          <p className="mt-6 text-xs leading-relaxed text-zinc-400">
            미리보기는 첫 문제만 웹에서 다시 그려 보여 줘요. 줄바꿈·그림 크기는 한글 파일과 조금 다를 수 있어요.
          </p>
        </div>
      </>
    );
  };

  const pendingItems = (pendingDelete ?? []).map((id) => files?.find((f) => f.id === id)).filter(Boolean) as StoredFile[];
  const pendingAllExpired = pendingItems.length > 0 && pendingItems.every((f) => expiryInfo(f, now).state === "expired");

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mathocr-icon.png" alt="AI MathOCR" width={36} height={36} />
            <Wordmark decorative className="h-[13px] shrink-0 w-auto text-zinc-900" />
          </a>
          <div className="flex items-center gap-4 sm:gap-5 text-sm min-w-0">
            <a href="/dashboard" className="hidden sm:inline whitespace-nowrap text-zinc-600 hover:text-zinc-900">
              마이페이지
            </a>
            <a href="/files" aria-current="page" className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap text-zinc-900 font-semibold">
              <FolderIcon className="h-[17px] w-[17px] text-[var(--accent)]" />
              내 파일함
            </a>
            <span className="hidden md:inline truncate text-zinc-500">{email}</span>
            <button type="button" onClick={logout} className="shrink-0 whitespace-nowrap text-zinc-500 hover:text-zinc-700">
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-24">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">내 파일함</h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              변환한 한글 파일을 변환한 날부터 30일 동안 보관해요. 기간이 지나면 파일은 자동으로 지워져요.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none shrink-0">
            <span>변환할 때 자동 보관</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={toggleEnabled}
              className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? "bg-[var(--accent)]" : "bg-zinc-300"}`}
            >
              {/* left-0 필수 — 없으면 버튼 가운데 정렬 때문에 손잡이가 가운데서 출발해 켜짐일 때 밖으로 밀려 안 보인다 */}
              <span className={`absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-transform ${enabled ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </button>
          </label>
        </div>

        {!enabled && (
          <p className="mb-4 text-sm text-zinc-500">
            자동 보관이 꺼져 있어요. 새로 변환한 파일은 내 PC에만 저장되고 여기에는 올라오지 않아요.
          </p>
        )}

        <div className="flex gap-6 items-start">
          <section className="flex-1 min-w-0" aria-label="파일 목록">
            <div className="flex flex-col-reverse sm:flex-row sm:items-end justify-between gap-3 border-b border-zinc-200">
              <div className="flex gap-5 text-sm" role="tablist">
                {(["all", "soon"] as Tab[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => {
                      setTab(k);
                      setChecked(new Set());
                    }}
                    className={`-mb-px pb-2.5 border-b-2 ${tab === k ? "border-zinc-900 text-zinc-900 font-semibold" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
                  >
                    {k === "all" ? "전체" : "곧 만료"}{" "}
                    <span className={`tabular-nums ${tab === k ? "text-zinc-500 font-normal" : "text-zinc-400"}`}>{counts[k]}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1 sm:pt-0 sm:pb-2.5">
                <label className="relative flex-1 sm:w-56">
                  <span className="sr-only">시험지명 검색</span>
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="시험지명 검색"
                    className="w-full rounded-lg border border-zinc-300 pl-8 pr-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-[var(--accent)] focus:outline-none"
                  />
                </label>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm text-zinc-700 bg-white"
                  aria-label="정렬"
                >
                  <option value="new">최신순</option>
                  <option value="expire">만료 임박순</option>
                </select>
              </div>
            </div>

            {/* 표 머리 — 체크하면 이 자리가 선택 도구로 바뀐다(같은 높이라 줄이 밀리지 않음) */}
            <div className="h-12 mt-1 border-b border-zinc-200 px-1">
              {checked.size > 0 ? (
                <div className="h-full grid grid-cols-[40px_minmax(0,1fr)] items-center">
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      className="fb-check"
                      checked={allLiveChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someLiveChecked;
                      }}
                      onChange={(e) => toggleAllLive(e.target.checked)}
                      aria-label="보이는 파일 모두 선택"
                    />
                  </div>
                  <div className="flex items-center gap-2 pl-1 text-sm">
                    <span className="font-medium text-zinc-900 tabular-nums mr-1">{checked.size}개 선택</span>
                    <button
                      type="button"
                      className="btn-outline rounded-lg px-3 py-1.5 text-sm disabled:opacity-60"
                      disabled={checkedHasExpired || zipping}
                      title={checkedHasExpired ? "만료된 파일이 섞여 있어 받을 수 없어요" : undefined}
                      onClick={downloadChecked}
                    >
                      {zipping ? "압축 중…" : "받기"}
                    </button>
                    <button type="button" className="btn-outline rounded-lg px-3 py-1.5 text-sm text-red-700" onClick={() => setPendingDelete([...checked])}>
                      삭제
                    </button>
                    <button type="button" className="ml-auto text-zinc-500 hover:text-zinc-800" onClick={() => setChecked(new Set())}>
                      선택 해제
                    </button>
                  </div>
                </div>
              ) : (
                <div className="row-grid h-full text-xs text-zinc-500">
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      className="fb-check"
                      checked={allLiveChecked}
                      onChange={(e) => toggleAllLive(e.target.checked)}
                      aria-label="보이는 파일 모두 선택"
                      disabled={live.length === 0}
                    />
                  </div>
                  <div className="pl-1">시험지명</div>
                  <div className="hidden sm:block">변환일</div>
                  <div className="hidden sm:block">보관 기한</div>
                  <div />
                </div>
              )}
            </div>

            {files === null ? (
              <FileListSkeleton />
            ) : loadError && files.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-zinc-600">{loadError}</p>
                <button type="button" className="btn-outline mt-4 rounded-lg px-4 py-2 text-sm" onClick={load}>
                  다시 불러오기
                </button>
              </div>
            ) : files.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-base font-medium text-zinc-800">아직 보관된 파일이 없어요</p>
                <p className="mt-1.5 text-sm text-zinc-500">앱에서 변환하면 결과 한글 파일이 여기에 30일 동안 보관돼요.</p>
                <a href={DOWNLOAD_URL} className="btn-outline inline-block mt-5 rounded-lg px-4 py-2 text-sm">
                  앱 내려받기
                </a>
              </div>
            ) : live.length === 0 && expired.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">
                {query ? `'${query}'와(과) 맞는 파일이 없어요.` : "7일 안에 만료되는 파일이 없어요."}
              </p>
            ) : (
              <>
                {truncated && (
                  <p className="pt-3 text-xs text-zinc-500">최근 1,000개만 보여요. 오래된 파일은 지우면 다음 파일이 보여요.</p>
                )}
                <ul className="divide-y divide-[var(--border-subtle)]">
                  {live.length ? live.map(renderRow) : <li className="py-12 text-center text-sm text-zinc-500">보관 중인 파일이 없어요.</li>}
                </ul>
                {expired.length > 0 && (
                  <>
                    <div className="mt-10 flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-2 px-1">
                      <h2 className="text-sm font-semibold text-zinc-500">
                        만료된 파일 <span className="font-normal tabular-nums">{expired.length}</span>
                        <span className="block sm:inline mt-0.5 sm:mt-0 sm:ml-1.5 text-xs font-normal text-zinc-400">
                          파일은 지워졌고, 만료 30일 뒤 목록에서도 사라져요
                        </span>
                      </h2>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
                        onClick={() => setPendingDelete(expired.map((f) => f.id))}
                      >
                        모두 지우기
                      </button>
                    </div>
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {expired.map(renderRow)}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>

          <aside className="hidden lg:block w-[380px] xl:w-[420px] shrink-0 sticky top-6" aria-label="미리보기">
            <div className="rounded-xl border border-zinc-200 bg-white max-h-[calc(100vh-3rem)] overflow-y-auto">
              {renderPreview(selected)}
            </div>
          </aside>
        </div>
      </main>

      {/* 폰·태블릿 미리보기 — 오른쪽에서 들어오는 전체 화면 */}
      <div
        className={`lg:hidden fixed inset-0 z-30 bg-white flex flex-col transition-transform duration-[260ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none ${sheetOpen && selected ? "translate-x-0" : "translate-x-full"}`}
        role="dialog"
        aria-label="미리보기"
        aria-hidden={!(sheetOpen && selected)}
      >
        <div className="flex items-center gap-2 px-2 py-2.5 border-b border-zinc-200">
          <button type="button" onClick={() => setSheetOpen(false)} className="flex items-center gap-1 px-2 py-1.5 text-sm text-zinc-600 hover:text-zinc-900">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            목록
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{selected && renderPreview(selected, true)}</div>
        {/* 오른쪽 아래는 채널톡 상담 버튼 자리(폰: 폭 약 45px·오른쪽 15px, 태블릿은 더 큼) — 비워 두고 그 왼쪽에 버튼을 둔다.
            삭제는 여기서 빼고 목록의 체크 → [삭제]로만(사용자 요청 11-06) */}
        {selected && (
          <div className="border-t border-zinc-200 pl-4 pr-[76px] md:pr-[104px] py-3 flex gap-2">
            <button type="button" className="btn-primary flex-1 min-w-0 rounded-lg px-3 py-3 text-sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap" onClick={() => downloadOne(selected)}>
              {downloadButtonInner(selected)}
            </button>
            <button type="button" className="kakao-btn shrink-0 rounded-lg px-3.5 py-3 text-sm inline-flex items-center justify-center gap-1.5" onClick={() => shareKakao(selected)} aria-label="카카오톡으로 보내기" title="카카오톡으로 보내기">
              <KakaoIcon />
              카카오톡
            </button>
          </div>
        )}
      </div>

      {/* 삭제 확인 */}
      {pendingDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-zinc-900/30" onClick={() => !deleting && setPendingDelete(null)} />
          <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-[0_12px_40px_-12px_rgba(0,0,0,.25)]" role="alertdialog" aria-modal="true" aria-labelledby="fb-del-title" aria-describedby="fb-del-body">
            <h2 id="fb-del-title" className="text-base font-semibold break-words">
              {pendingAllExpired
                ? pendingItems.length === 1
                  ? "목록에서 지울까요?"
                  : `${pendingItems.length}개를 목록에서 지울까요?`
                : pendingItems.length === 1
                  ? `'${pendingItems[0]?.file_name}'을(를) 삭제할까요?`
                  : `파일 ${pendingItems.length}개를 삭제할까요?`}
            </h2>
            <p id="fb-del-body" className="mt-2 text-sm leading-relaxed text-zinc-600">
              {pendingAllExpired
                ? "보관 기간이 지나 파일은 이미 지워졌어요. 목록에서만 사라져요."
                : "삭제한 파일은 다시 받을 수 없어요. 변환 이력과 크레딧 내역은 마이페이지에 그대로 남아요."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-outline rounded-lg px-4 py-2 text-sm" onClick={() => setPendingDelete(null)} disabled={deleting}>
                취소
              </button>
              <button
                ref={deleteOkRef}
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? "지우는 중…" : pendingAllExpired ? "지우기" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        role="status"
        className={`fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-6 z-50 w-max max-w-[calc(100vw-32px)] text-center rounded-lg bg-zinc-900 text-white text-sm px-4 py-2.5 transition-opacity duration-200 pointer-events-none ${toast ? "opacity-100" : "opacity-0"}`}
      >
        {toast}
      </div>
    </div>
  );
}
