"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type RefObject,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Tab = "users" | "logs" | "stats" | "reports" | "refunds" | "promos";

interface AdminUser {
  id: string;
  email: string;
  role: string;
  credits: number;
  expires_at: string | null;
  created_at: string;
}

interface ErrorLogEntry {
  id: string;
  user_id: string;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  profiles?: { email: string } | null;
}

// 실패 로그 메타데이터를 사람이 읽을 수 있게 변환
const LOG_STEP_LABELS: Record<string, string> = {
  init: "시작",
  validate: "영역 검증",
  crop: "영역 크롭",
  ocr: "OCR 인식",
  hwp_generate: "한글 문서 생성",
};
const LOG_CATEGORY_LABELS: Record<string, string> = {
  hwp_server_fault: "한글 내부 오류 (자동화 중 예외)",
  hwp_not_installed: "한글 미설치 / 뷰어",
  hwp_typelib_not_registered: "한글 설치 손상 (복구 설치 필요)",
  hwp_launch_failed: "한글 실행 실패",
  hwp_com_error: "한글 연동 오류",
  other: "기타 (한글 무관)",
};

function LogMetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-zinc-400 shrink-0 w-24">{label}</span>
      <span className="text-zinc-700 break-all">{value}</span>
    </div>
  );
}

function LogMetadata({ metadata }: { metadata: Record<string, unknown> }) {
  const step = typeof metadata.step === "string" ? metadata.step : null;
  const category = typeof metadata.category === "string" ? metadata.category : null;
  const rows: { label: string; value: ReactNode }[] = [];

  if (category) {
    rows.push({
      label: "원인 분류",
      value: (
        <span className="font-medium text-zinc-900">
          {LOG_CATEGORY_LABELS[category] ?? category}
        </span>
      ),
    });
  }
  if (step) rows.push({ label: "실패 단계", value: LOG_STEP_LABELS[step] ?? step });
  if (metadata.error_code)
    rows.push({ label: "에러 코드", value: String(metadata.error_code) });
  if (typeof metadata.hwp_installed === "boolean")
    rows.push({
      label: "한글 설치 감지",
      value: metadata.hwp_installed ? "감지됨" : "미감지(설치 안 됨/뷰어)",
    });
  if (metadata.hwp_version)
    rows.push({ label: "한글 버전", value: String(metadata.hwp_version) });
  if (metadata.pdf_name)
    rows.push({ label: "파일", value: String(metadata.pdf_name) });
  if (typeof metadata.region_count === "number")
    rows.push({ label: "영역 수", value: String(metadata.region_count) });

  // 알려지지 않은 키는 원본 JSON으로 보조 표시
  const known = new Set([
    "step",
    "category",
    "error_code",
    "hwp_installed",
    "hwp_version",
    "pdf_name",
    "region_count",
  ]);
  const extra = Object.fromEntries(
    Object.entries(metadata).filter(([k]) => !known.has(k))
  );

  if (rows.length === 0 && Object.keys(extra).length === 0) return null;

  return (
    <div className="mt-3 p-3 rounded-lg bg-zinc-50 border border-[var(--border-subtle)] space-y-1">
      <div className="text-xs font-medium text-zinc-500 mb-1.5">진단 정보</div>
      {rows.map((r) => (
        <LogMetaRow key={r.label} label={r.label} value={r.value} />
      ))}
      {Object.keys(extra).length > 0 && (
        <pre className="mt-1 text-[11px] text-zinc-400 whitespace-pre-wrap break-all">
          {JSON.stringify(extra)}
        </pre>
      )}
    </div>
  );
}

interface Stats {
  total_users: number;
  total_conversions: number;
  success_rate: number;
  total_credits_used: number;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      setIsAdmin(true);
      setLoading(false);
    }
    checkAdmin();
  }, [supabase, router]);

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">권한 확인 중...</div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "users", label: "유저 관리" },
    { key: "promos", label: "프로모션 코드" },
    { key: "reports", label: "변환 리포트" },
    { key: "refunds", label: "크레딧 반환" },
    { key: "logs", label: "오류 로그" },
    { key: "stats", label: "통계" },
  ];

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2.5">
              <img src="/mathocr-icon.png" alt="AI MathOCR" width={36} height={36} />
              <span className="text-lg font-bold tracking-tight">
                AI Math<span className="text-[var(--accent)]">OCR</span>
              </span>
            </a>
            <span className="text-xs text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded">
              관리자
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/dashboard"
              className="text-sm text-zinc-600 hover:text-zinc-800 transition-colors"
            >
              마이페이지
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-[var(--surface)] rounded-xl p-1 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-[var(--accent)] text-white"
                  : "text-zinc-600 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users" && <UsersTab />}
        {tab === "promos" && <PromosTab />}
        {tab === "reports" && <ReportsTab />}
        {tab === "refunds" && <RefundsTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
  );
}

/* ── 프로모션 코드 탭 ── */
interface PromoRedemption {
  id: string;
  email: string | null;
  credits_granted: number;
  source: "mypage" | "signup";
  created_at: string;
}

interface PromoCode {
  id: string;
  code: string;
  credits: number;
  max_uses: number | null;
  validity_days: number | null; // null = 계정 만료일 따름(연장 없음)
  is_active: boolean;
  memo: string | null;
  created_at: string;
  use_count: number;
  promo_redemptions: PromoRedemption[];
}

function PromosTab() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formCredits, setFormCredits] = useState("");
  const [formMaxUses, setFormMaxUses] = useState("1");
  const [formValidityDays, setFormValidityDays] = useState("");
  const [formMemo, setFormMemo] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCodes = useCallback(async () => {
    const res = await fetch("/api/admin/promo-codes");
    if (!res.ok) {
      setCodes([]);
      return;
    }
    const data = await res.json();
    setCodes(data.codes ?? []);
  }, []);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  async function handleCreate() {
    if (creating) return;
    setFormError("");

    const credits = parseInt(formCredits);
    if (isNaN(credits) || credits <= 0) {
      setFormError("지급 크레딧을 올바르게 입력해주세요.");
      return;
    }
    // 최대 사용 횟수: 빈칸 = 무제한
    const maxUsesTrimmed = formMaxUses.trim();
    let maxUses: number | null = null;
    if (maxUsesTrimmed) {
      maxUses = parseInt(maxUsesTrimmed);
      if (isNaN(maxUses) || maxUses <= 0) {
        setFormError("최대 사용 횟수를 올바르게 입력해주세요. (빈칸 = 무제한)");
        return;
      }
    }

    // 유효기간(일): 빈칸 = 연장 없음(계정 만료일 따름)
    const validityTrimmed = formValidityDays.trim();
    let validityDays: number | null = null;
    if (validityTrimmed) {
      validityDays = parseInt(validityTrimmed);
      if (isNaN(validityDays) || validityDays <= 0 || validityDays > 3650) {
        setFormError("유효기간은 1~3,650일 사이로 입력해주세요. (빈칸 = 연장 없음)");
        return;
      }
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: formCode.trim(),
          credits,
          max_uses: maxUses,
          validity_days: validityDays,
          memo: formMemo.trim() || null,
        }),
      });
      const result = await res.json().catch(() => ({}));

      if (res.ok && result.success) {
        setFormCode("");
        setFormCredits("");
        setFormMaxUses("1");
        setFormValidityDays("");
        setFormMemo("");
        loadCodes();
      } else {
        setFormError(result.error ?? "코드 생성에 실패했습니다.");
      }
    } catch {
      setFormError("코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(promo: PromoCode) {
    const res = await fetch(`/api/admin/promo-codes/${promo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !promo.is_active }),
    });
    if (res.ok) loadCodes();
  }

  async function handleDelete(promo: PromoCode) {
    if (!confirm(`코드 "${promo.code}"를 삭제할까요?`)) return;
    const res = await fetch(`/api/admin/promo-codes/${promo.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      loadCodes();
    } else {
      const result = await res.json().catch(() => ({}));
      alert(result.error ?? "코드 삭제에 실패했습니다.");
    }
  }

  return (
    <>
      {/* 코드 생성 폼 */}
      <div className="bezel-card rounded-2xl p-6 mb-6">
        <h3 className="text-lg font-semibold mb-1">새 프로모션 코드</h3>
        <p className="text-sm text-zinc-500 mb-4">
          코드와 지급 크레딧을 직접 지정합니다. 같은 코드는 한 계정당 1회만 사용할 수 있습니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">코드</label>
            <input
              type="text"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value)}
              placeholder="예: welcome2026"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">지급 크레딧</label>
            <input
              type="number"
              min={1}
              value={formCredits}
              onChange={(e) => setFormCredits(e.target.value)}
              placeholder="예: 100"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              최대 사용 횟수 (빈칸 = 무제한)
            </label>
            <input
              type="number"
              min={1}
              value={formMaxUses}
              onChange={(e) => setFormMaxUses(e.target.value)}
              placeholder="무제한"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              유효기간 · 일 (빈칸 = 연장 없음)
            </label>
            <input
              type="number"
              min={1}
              max={3650}
              value={formValidityDays}
              onChange={(e) => setFormValidityDays(e.target.value)}
              placeholder="예: 30"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">메모 (선택)</label>
            <input
              type="text"
              value={formMemo}
              onChange={(e) => setFormMemo(e.target.value)}
              placeholder="예: OO학원 배포용"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-300 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          유효기간을 지정하면 코드 사용 시 계정 만료일이 최소 &quot;오늘 + 지정 일수&quot;로
          연장됩니다 (잔여 크레딧 포함, 기존 만료일이 더 길면 그대로). 빈칸이면 크레딧만
          지급되고 계정의 기존 만료일을 따릅니다.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleCreate}
            disabled={!formCode.trim() || !formCredits.trim() || creating}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {creating ? "생성 중..." : "코드 생성"}
          </button>
          {formError && <span className="text-sm text-red-600">{formError}</span>}
        </div>
      </div>

      {/* 코드 목록 */}
      <div className="bezel-card rounded-2xl overflow-hidden">
        {codes.length === 0 ? (
          <div className="px-6 py-12 text-center text-zinc-500">
            아직 생성된 프로모션 코드가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                  <th className="px-6 py-3 font-medium">코드</th>
                  <th className="px-6 py-3 font-medium text-center">지급 크레딧</th>
                  <th className="px-6 py-3 font-medium text-center">유효기간</th>
                  <th className="px-6 py-3 font-medium text-center">사용 현황</th>
                  <th className="px-6 py-3 font-medium text-center">상태</th>
                  <th className="px-6 py-3 font-medium">메모</th>
                  <th className="px-6 py-3 font-medium">생성일</th>
                  <th className="px-6 py-3 font-medium text-center">액션</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((p) => (
                  <PromoRow
                    key={p.id}
                    promo={p}
                    expanded={expandedId === p.id}
                    onToggleExpand={() =>
                      setExpandedId((prev) => (prev === p.id ? null : p.id))
                    }
                    onToggleActive={() => handleToggleActive(p)}
                    onDelete={() => handleDelete(p)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function PromoRow({
  promo,
  expanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
}: {
  promo: PromoCode;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const exhausted =
    promo.max_uses !== null && promo.use_count >= promo.max_uses;

  return (
    <>
      <tr className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-zinc-50">
        <td className="px-6 py-3 font-mono text-zinc-800">{promo.code}</td>
        <td className="px-6 py-3 text-center text-[var(--accent)] font-medium">
          {promo.credits}
        </td>
        <td
          className="px-6 py-3 text-center text-zinc-600"
          title={
            promo.validity_days
              ? `사용 시 만료일이 최소 오늘+${promo.validity_days}일로 연장`
              : "연장 없음 — 계정의 기존 만료일을 따름"
          }
        >
          {promo.validity_days ? `${promo.validity_days}일` : "—"}
        </td>
        <td className="px-6 py-3 text-center">
          <button
            onClick={onToggleExpand}
            disabled={promo.use_count === 0}
            className={`text-sm ${
              promo.use_count > 0
                ? "text-[var(--accent)] hover:underline"
                : "text-zinc-400 cursor-default"
            }`}
            title={promo.use_count > 0 ? "사용 내역 보기" : undefined}
          >
            {promo.use_count} / {promo.max_uses ?? "∞"}
            {promo.use_count > 0 && (
              <span className="ml-1 text-xs">{expanded ? "▲" : "▼"}</span>
            )}
          </button>
        </td>
        <td className="px-6 py-3 text-center">
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${
              !promo.is_active
                ? "bg-zinc-100 text-zinc-500 border-zinc-200"
                : exhausted
                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
            }`}
          >
            {!promo.is_active ? "비활성" : exhausted ? "소진" : "활성"}
          </span>
        </td>
        <td className="px-6 py-3 text-zinc-600 max-w-[200px] truncate" title={promo.memo ?? undefined}>
          {promo.memo || "—"}
        </td>
        <td className="px-6 py-3 text-zinc-500">
          {new Date(promo.created_at).toLocaleDateString("ko-KR")}
        </td>
        <td className="px-6 py-3 text-center whitespace-nowrap">
          <button
            onClick={onToggleActive}
            className="text-xs text-[var(--accent)] hover:underline mr-3"
          >
            {promo.is_active ? "비활성화" : "활성화"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-600 hover:underline"
          >
            삭제
          </button>
        </td>
      </tr>
      {expanded && promo.use_count > 0 && (
        <tr className="border-b border-[var(--border-subtle)] bg-zinc-50">
          <td colSpan={8} className="px-6 py-4">
            <div className="text-xs font-medium text-zinc-500 mb-2">
              사용 내역 ({promo.use_count}건)
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-400">
                  <th className="py-1.5 pr-4 font-medium">사용자</th>
                  <th className="py-1.5 pr-4 font-medium text-center">지급 크레딧</th>
                  <th className="py-1.5 pr-4 font-medium text-center">경로</th>
                  <th className="py-1.5 font-medium">사용 일시</th>
                </tr>
              </thead>
              <tbody>
                {promo.promo_redemptions.map((r) => (
                  <tr key={r.id} className="text-zinc-600">
                    <td className="py-1.5 pr-4">{r.email ?? "(탈퇴한 사용자)"}</td>
                    <td className="py-1.5 pr-4 text-center">+{r.credits_granted}</td>
                    <td className="py-1.5 pr-4 text-center">
                      {r.source === "signup" ? "회원가입" : "마이페이지"}
                    </td>
                    <td className="py-1.5">
                      {new Date(r.created_at).toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── 유저 관리 탭 ── */
function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [creditModal, setCreditModal] = useState<AdminUser | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  // 행 클릭 → 유저 상세(마이페이지 뷰 + CS 정보) 모달
  const [detailUser, setDetailUser] = useState<AdminUser | null>(null);
  const limit = 20;

  const loadUsers = useCallback(async () => {
    // service_role 권한이 필요한 조회는 서버 API(/api/admin/*)를 통해서만 한다.
    // 브라우저 anon 클라이언트로 직접 profiles 전체를 읽으면 RLS에 막힌다.
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (search) params.set("search", search);

    const res = await fetch(`/api/admin/users?${params.toString()}`);
    if (!res.ok) {
      setUsers([]);
      setTotal(0);
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
    setTotal(data.total ?? 0);
  }, [page, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAddCredits() {
    if (!creditModal || !creditAmount) return;
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) return;

    const res = await fetch(`/api/admin/users/${creditModal.id}/credits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credits: amount }),
    });

    if (res.ok) {
      setCreditModal(null);
      setCreditAmount("");
      // 상세 모달이 열려 있으면 닫는다 — 요약 수치가 갱신 전 값으로 남지 않게
      setDetailUser(null);
      loadUsers();
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="이메일로 검색..."
          className="w-full max-w-md px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border-light)] text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* Table */}
      <div className="bezel-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                <th className="px-6 py-3 font-medium">이메일</th>
                <th className="px-6 py-3 font-medium text-center">권한</th>
                <th className="px-6 py-3 font-medium text-center">크레딧</th>
                <th className="px-6 py-3 font-medium text-center">유효기간</th>
                <th className="px-6 py-3 font-medium">가입일</th>
                <th className="px-6 py-3 font-medium text-center">액션</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setDetailUser(u)}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-zinc-50 cursor-pointer"
                >
                  <td className="px-6 py-3 text-zinc-800">{u.email}</td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.role === "admin"
                          ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center text-zinc-700">
                    {u.credits}
                  </td>
                  <td className="px-6 py-3 text-center text-zinc-600">
                    {u.expires_at
                      ? new Date(u.expires_at).toLocaleDateString("ko-KR")
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreditModal(u);
                      }}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      크레딧 부여
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-sm text-zinc-500">{total}명</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30 transition-colors"
              >
                이전
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30 transition-colors"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {detailUser && (
        <UserDetailModal
          user={detailUser}
          onClose={() => setDetailUser(null)}
          onGrant={() => setCreditModal(detailUser)}
        />
      )}

      {/* Credit Modal */}
      {creditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bezel-card rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-1">크레딧 부여</h3>
            <p className="text-sm text-zinc-500 mb-5">{creditModal.email}</p>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              placeholder="부여할 크레딧 수"
              min="1"
              className="w-full px-4 py-2.5 rounded-xl bg-white border border-[var(--border-light)] text-zinc-900 text-sm focus:outline-none focus:border-[var(--accent)] mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCreditModal(null)}
                className="flex-1 py-2 rounded-xl text-sm border border-[var(--border-light)] text-zinc-600 hover:text-zinc-800 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAddCredits}
                className="flex-1 btn-primary py-2 rounded-xl text-sm"
              >
                부여
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── 유저 상세 모달 — 해당 유저의 마이페이지 뷰 + CS 정보(지급 내역·변환 이력·오류 로그) ── */
interface UserCreditEvent {
  type: string;
  label: string;
  detail: string | null;
  delta: number;
  refunded: boolean;
  at: string;
}

interface UserConversion {
  id: string;
  pdf_name: string | null;
  problem_count: number;
  solution_count?: number | null;
  credits_used: number;
  refunded_credits: number;
  status: string;
  created_at: string;
}

const CONV_STATUS_LABELS: Record<string, string> = {
  completed: "완료",
  failed: "실패",
  pending: "진행 중",
};

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="px-6 py-4 border-t border-[var(--border-subtle)]">
      <h4 className="text-sm font-semibold text-zinc-900 mb-3">{title}</h4>
      {children}
    </div>
  );
}

function UserDetailModal({
  user,
  onClose,
  onGrant,
}: {
  user: AdminUser;
  onClose: () => void;
  onGrant: () => void;
}) {
  const [events, setEvents] = useState<UserCreditEvent[] | null>(null);
  const [convs, setConvs] = useState<UserConversion[] | null>(null);
  const [logs, setLogs] = useState<ErrorLogEntry[] | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ev, cv, lg] = await Promise.all([
        fetch(`/api/credits/history?user_id=${user.id}`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch(`/api/admin/users/${user.id}/conversions`).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch(`/api/admin/logs?user_id=${user.id}&limit=20`).then((r) =>
          r.ok ? r.json() : null
        ),
      ]);
      if (cancelled) return;
      setEvents(ev?.events ?? []);
      setConvs(cv?.conversions ?? []);
      setLogs(lg?.logs ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const isExpired =
    user.expires_at && new Date(user.expires_at) < new Date();
  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString("ko-KR", {
      dateStyle: "short",
      timeStyle: "short",
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bezel-card rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[var(--surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4 sticky top-0 bg-[var(--surface)] z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate">{user.email}</h3>
            <p className="text-xs text-zinc-500">
              가입일 {new Date(user.created_at).toLocaleDateString("ko-KR")} ·
              권한 {user.role}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onGrant}
              className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-light)] text-[var(--accent)] hover:bg-zinc-50 transition-colors"
            >
              크레딧 부여
            </button>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700 text-xl leading-none px-1"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        {/* 요약 */}
        <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500 mb-0.5">잔여 크레딧</div>
            <div className="text-xl font-bold text-[var(--accent)]">
              {user.credits}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500 mb-0.5">유효기간</div>
            <div
              className={`text-sm font-semibold ${isExpired ? "text-red-600" : "text-zinc-900"}`}
            >
              {user.expires_at
                ? new Date(user.expires_at).toLocaleDateString("ko-KR")
                : "무제한"}
              {isExpired && <span className="ml-1 text-xs">만료</span>}
            </div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500 mb-0.5">오류 로그</div>
            <div className="text-sm font-semibold text-zinc-900">
              {logs === null ? "…" : `${logs.length}건`}
            </div>
          </div>
        </div>

        {/* 크레딧 지급 내역 */}
        <DetailSection title="크레딧 지급 내역">
          {events === null ? (
            <p className="text-sm text-zinc-400">불러오는 중…</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-zinc-500">지급 내역이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {events.map((e, i) => (
                <li
                  key={`${e.at}-${i}`}
                  className="py-2 flex items-center justify-between gap-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-zinc-800">{e.label}</span>
                    {e.detail && (
                      <span className="ml-2 text-zinc-400">{e.detail}</span>
                    )}
                    {e.refunded && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-600">
                        환불됨
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-medium ${
                        e.refunded
                          ? "text-zinc-300 line-through"
                          : e.delta >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {e.delta >= 0 ? `+${e.delta}` : e.delta}
                    </span>
                    <span className="text-zinc-400 text-xs w-20 text-right">
                      {new Date(e.at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        {/* 변환 이력 */}
        <DetailSection title="변환 이력 (최근 20건)">
          {convs === null ? (
            <p className="text-sm text-zinc-400">불러오는 중…</p>
          ) : convs.length === 0 ? (
            <p className="text-sm text-zinc-500">변환 이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                    <th className="py-2 pr-3 font-medium">날짜</th>
                    <th className="py-2 pr-3 font-medium">시험지명</th>
                    <th className="py-2 pr-3 font-medium text-center">
                      문제(해설)
                    </th>
                    <th className="py-2 pr-3 font-medium text-center">
                      크레딧
                    </th>
                    <th className="py-2 pr-3 font-medium text-center">반환</th>
                    <th className="py-2 font-medium text-center">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {convs.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border-subtle)] last:border-0"
                    >
                      <td className="py-2 pr-3 text-zinc-500 whitespace-nowrap">
                        {new Date(c.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="py-2 pr-3 text-zinc-800 max-w-[180px] truncate">
                        {c.pdf_name || "—"}
                      </td>
                      <td className="py-2 pr-3 text-center text-zinc-700">
                        {c.problem_count}
                        {(c.solution_count ?? 0) > 0
                          ? `(+${c.solution_count})`
                          : ""}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        {c.credits_used > 0 ? (
                          <span className="text-red-600">
                            -{c.credits_used}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-3 text-center">
                        {c.refunded_credits > 0 ? (
                          <span className="text-emerald-600">
                            +{c.refunded_credits}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 text-center text-zinc-600">
                        {CONV_STATUS_LABELS[c.status] ?? c.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DetailSection>

        {/* 오류 로그 */}
        <DetailSection title="오류 로그 (최근 20건)">
          {logs === null ? (
            <p className="text-sm text-zinc-400">불러오는 중…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-zinc-500">오류 로그가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {logs.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <button
                    className="w-full text-left"
                    onClick={() =>
                      setExpandedLogId(expandedLogId === log.id ? null : log.id)
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-800 truncate">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 mr-2">
                          {log.error_type}
                        </span>
                        {log.error_message}
                      </span>
                      <span className="text-zinc-400 text-xs whitespace-nowrap">
                        {fmtDateTime(log.created_at)}
                      </span>
                    </div>
                  </button>
                  {expandedLogId === log.id && log.metadata && (
                    <div className="mt-2 p-3 rounded-lg bg-zinc-50 space-y-1">
                      <LogMetadata metadata={log.metadata} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </div>
    </div>
  );
}

/* ── 오류 로그 탭 ── */
function LogsTab() {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterEmail, setFilterEmail] = useState<string | null>(null);
  const limit = 20;

  const loadLogs = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (filterUserId) params.set("user_id", filterUserId);

    const res = await fetch(`/api/admin/logs?${params.toString()}`);
    if (!res.ok) {
      setLogs([]);
      setTotal(0);
      return;
    }
    const data = await res.json();
    setLogs((data.logs as ErrorLogEntry[]) ?? []);
    setTotal(data.total ?? 0);
  }, [page, filterUserId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function handleUserFilter(userId: string, email: string | null) {
    if (filterUserId === userId) {
      // 같은 유저 클릭 → 필터 해제
      setFilterUserId(null);
      setFilterEmail(null);
    } else {
      setFilterUserId(userId);
      setFilterEmail(email);
    }
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bezel-card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          오류 로그{" "}
          <span className="text-sm font-normal text-zinc-500">
            ({total}건)
          </span>
        </h2>
        {filterEmail && (
          <button
            onClick={() => {
              setFilterUserId(null);
              setFilterEmail(null);
              setPage(1);
            }}
            className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            {filterEmail}
            <span className="text-amber-500">✕</span>
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="px-6 py-12 text-center text-zinc-500">
          {filterEmail
            ? `${filterEmail}의 오류 로그가 없습니다.`
            : "오류 로그가 없습니다."}
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-subtle)]">
          {logs.map((log) => (
            <div key={log.id} className="px-6 py-4 hover:bg-zinc-50">
              <div className="flex items-center gap-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 shrink-0">
                  {log.error_type}
                </span>
                <span
                  className="text-sm text-zinc-700 truncate flex-1 cursor-pointer"
                  onClick={() =>
                    setExpandedId(expandedId === log.id ? null : log.id)
                  }
                >
                  {log.error_message}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUserFilter(
                      log.user_id,
                      log.profiles?.email ?? null
                    );
                  }}
                  className={`text-xs shrink-0 hover:text-[var(--accent)] transition-colors ${
                    filterUserId === log.user_id
                      ? "text-[var(--accent)] font-semibold"
                      : "text-zinc-600"
                  }`}
                >
                  {log.profiles?.email ?? log.user_id.slice(0, 8)}
                </button>
                <span className="text-xs text-zinc-600 shrink-0">
                  {new Date(log.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              {expandedId === log.id && (
                <>
                  {log.metadata && typeof log.metadata === "object" && (
                    <LogMetadata metadata={log.metadata} />
                  )}
                  {log.stack_trace && (
                    <pre className="mt-3 p-3 rounded-lg bg-zinc-100 text-xs text-zinc-500 overflow-x-auto whitespace-pre-wrap">
                      {log.stack_trace}
                    </pre>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-sm text-zinc-500">{total}건</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 통계 탭 ── */

interface PurchaseBreakdown {
  total: number;
  starter: number;
  basic: number;
  pro: number;
  other: number;
}

interface DailyRow {
  date: string;
  signups: number;
  // 가입 출처별 분해 (M4). 키는 utm_source, UTM 없이 온 가입은 "direct".
  signup_sources?: Record<string, number>;
  conversions: number;
  credits_used: number;
  revenue: number;
  purchases: PurchaseBreakdown;
}

interface AiClaude {
  configured: boolean;
  error?: string;
  daily?: { date: string; usd: number }[];
  month_to_date_usd?: number;
}

interface AiMathpix {
  configured: boolean;
  error?: string;
  unit_usd?: number;
  daily?: { date: string; count: number; est_usd: number }[];
  month_to_date_count?: number;
  month_to_date_est_usd?: number;
}

interface AiStats {
  days: number;
  month: string;
  claude: AiClaude;
  mathpix: AiMathpix;
}

// 플랜별 차트 색 — 색약(적록) 구분 검증 완료 조합. Basic만 브랜드 보라 유지.
const PLAN_CHART_COLORS: Record<string, string> = {
  starter: "#1baf7a",
  basic: "#7c3aed",
  pro: "#eda100",
  other: "#a1a1aa",
};
const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  basic: "Basic",
  pro: "Pro",
  other: "기타",
};

// 가입 출처(UTM) 표시 — 표기 규약(docs/MARKETING_2026-07-10.md M4)의 소스만 고정 배색.
// 규약 밖 소스가 들어와도 회색으로 원문 그대로 노출된다.
const SOURCE_LABELS: Record<string, string> = {
  direct: "직접 유입",
  naver: "네이버",
  google: "구글",
  meta: "메타",
  youtube: "유튜브",
  community: "커뮤니티",
  referral: "추천",
};
const SOURCE_COLORS: Record<string, string> = {
  direct: "#a1a1aa",
  naver: "#03c75a",
  google: "#4285f4",
  meta: "#d62976",
  youtube: "#ff0033",
  community: "#eda100",
  referral: "#14b8a6",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;
const sourceColor = (s: string) => SOURCE_COLORS[s] ?? "#71717a";

// 일자별 테이블용 컴팩트 출처 표기 — 광고·채널 유입(UTM 있는 것)만 표시
function fmtSources(sources: Record<string, number> | undefined): string {
  const tagged = Object.entries(sources ?? {}).filter(([s]) => s !== "direct");
  if (tagged.length === 0) return "—";
  return tagged
    .sort((a, b) => b[1] - a[1])
    .map(([s, c]) => `${sourceLabel(s)} ${c}`)
    .join(" · ");
}

const fmtInt = (n: number) => n.toLocaleString("ko-KR");
const fmtKrw = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (key: string) => {
  const [, m, d] = key.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
};

function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const [ai, setAi] = useState<AiStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function loadStats() {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) return;
      const data = await res.json();
      setStats({
        total_users: data.users?.total ?? 0,
        total_conversions: data.conversions?.total ?? 0,
        success_rate: Math.round(data.conversions?.success_rate ?? 0),
        total_credits_used: data.conversions?.total_credits_used ?? 0,
      });
    }
    loadStats();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    Promise.all([
      fetch(`/api/admin/stats/daily?days=${days}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/admin/stats/ai?days=${days}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([dailyData, aiData]) => {
        if (cancelled) return;
        if (dailyData?.daily) setDaily(dailyData.daily as DailyRow[]);
        if (aiData) setAi(aiData as AiStats);
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!stats) {
    return <div className="text-zinc-500">통계 로딩 중...</div>;
  }

  const statCards = [
    {
      label: "총 사용자",
      value: stats.total_users,
      unit: "명",
      color: "text-[var(--accent)]",
    },
    {
      label: "총 변환 건수",
      value: stats.total_conversions,
      unit: "건",
      color: "text-zinc-900",
    },
    {
      label: "변환 성공률",
      value: stats.success_rate,
      unit: "%",
      color:
        stats.success_rate >= 90
          ? "text-emerald-600"
          : stats.success_rate >= 70
            ? "text-amber-600"
            : "text-red-600",
    },
    {
      label: "총 크레딧 사용",
      value: stats.total_credits_used,
      unit: "회",
      color: "text-zinc-900",
    },
  ];

  const planKeys = ["starter", "basic", "pro", "other"] as const;
  const planTotals = planKeys.map((k) => ({
    key: k,
    total: (daily ?? []).reduce((sum, d) => sum + d.purchases[k], 0),
  }));
  // '기타'는 실제 발생했을 때만 노출
  const visiblePlanKeys = planKeys.filter(
    (k) => k !== "other" || planTotals.find((p) => p.key === "other")!.total > 0
  );

  const periodTotals = (daily ?? []).reduce(
    (acc, d) => {
      acc.signups += d.signups;
      acc.purchases += d.purchases.total;
      acc.credits += d.credits_used;
      acc.revenue += d.revenue;
      return acc;
    },
    { signups: 0, purchases: 0, credits: 0, revenue: 0 }
  );

  // 기간 내 가입 출처별 합계 (많은 순) — 채널별 예산 판단(M4)의 핵심 숫자
  const sourceTotals = Object.entries(
    (daily ?? []).reduce<Record<string, number>>((acc, d) => {
      for (const [source, count] of Object.entries(d.signup_sources ?? {})) {
        acc[source] = (acc[source] ?? 0) + count;
      }
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      {/* 누적 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div key={s.label} className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">{s.label}</div>
            <div className={`text-3xl font-bold ${s.color}`}>
              {s.value.toLocaleString()}
              <span className="text-base font-normal text-zinc-500 ml-1">
                {s.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 기간 필터 — 아래 모든 차트에 공통 적용 */}
      <div className="flex items-center gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
              days === d
                ? "bg-[var(--accent)] text-white"
                : "text-zinc-600 hover:text-zinc-800 border border-[var(--border-light)]"
            }`}
          >
            최근 {d}일
          </button>
        ))}
        {refreshing && daily && (
          <span className="text-xs text-zinc-400 ml-2">갱신 중...</span>
        )}
      </div>

      {/* 일자별 서비스 지표 */}
      <section className={refreshing && daily ? "opacity-60 transition-opacity" : ""}>
        <h2 className="text-lg font-semibold mb-4">일자별 지표</h2>
        {!daily ? (
          <div className="bezel-card rounded-2xl px-6 py-12 text-center text-zinc-500">
            불러오는 중...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
              <div className="bezel-card rounded-2xl p-5">
                <ChartHeader
                  title="신규 회원가입"
                  summary={`${fmtInt(periodTotals.signups)}명`}
                />
                <DailyBarChart
                  data={daily.map((d) => ({ date: d.date, values: [d.signups] }))}
                  series={[{ label: "가입", color: "#7c3aed" }]}
                  format={(n) => `${fmtInt(n)}명`}
                />
                {/* 기간 내 가입 출처별 합계 (M4 — UTM 기반, null은 직접 유입) */}
                {sourceTotals.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    {sourceTotals.map(([source, count]) => (
                      <span
                        key={source}
                        className="flex items-center gap-1.5 text-xs text-zinc-600"
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: sourceColor(source) }}
                        />
                        {sourceLabel(source)}{" "}
                        <span className="text-zinc-400">{fmtInt(count)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bezel-card rounded-2xl p-5">
                <ChartHeader
                  title="구매 건수"
                  summary={`${fmtInt(periodTotals.purchases)}건 · ${fmtKrw(periodTotals.revenue)}`}
                />
                <DailyBarChart
                  data={daily.map((d) => ({
                    date: d.date,
                    values: visiblePlanKeys.map((k) => d.purchases[k]),
                  }))}
                  series={visiblePlanKeys.map((k) => ({
                    label: PLAN_LABELS[k],
                    color: PLAN_CHART_COLORS[k],
                  }))}
                  format={(n) => `${fmtInt(n)}건`}
                />
                {/* 범례 + 기간 내 플랜별 합계 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {visiblePlanKeys.map((k) => (
                    <span key={k} className="flex items-center gap-1.5 text-xs text-zinc-600">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PLAN_CHART_COLORS[k] }}
                      />
                      {PLAN_LABELS[k]}{" "}
                      <span className="text-zinc-400">
                        {fmtInt(planTotals.find((p) => p.key === k)!.total)}
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="bezel-card rounded-2xl p-5 md:col-span-2 xl:col-span-1">
                <ChartHeader
                  title="크레딧 사용"
                  summary={`${fmtInt(periodTotals.credits)}회`}
                />
                <DailyBarChart
                  data={daily.map((d) => ({ date: d.date, values: [d.credits_used] }))}
                  series={[{ label: "크레딧", color: "#2a78d6" }]}
                  format={(n) => `${fmtInt(n)}회`}
                />
              </div>
            </div>

            <DailyTable daily={daily} visiblePlanKeys={visiblePlanKeys} />
          </>
        )}
      </section>

      {/* AI 서비스 비용 */}
      <section className={refreshing && ai ? "opacity-60 transition-opacity" : ""}>
        <h2 className="text-lg font-semibold mb-1">AI 서비스 비용</h2>
        <p className="text-xs text-zinc-400 mb-4">
          일자는 UTC 기준 (한국시간 오전 9시 경계) · 데이터는 각 서비스 공식 API에서 조회
        </p>
        {!ai ? (
          <div className="bezel-card rounded-2xl px-6 py-12 text-center text-zinc-500">
            불러오는 중...
          </div>
        ) : (
          <AiCostSection ai={ai} />
        )}
      </section>
    </div>
  );
}

function ChartHeader({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h3 className="text-sm font-medium text-zinc-700">{title}</h3>
      <span className="text-sm font-semibold text-zinc-900">{summary}</span>
    </div>
  );
}

/* ── 일자별 막대 차트 (SVG, 의존성 없음) ── */

function useContainerWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// 축 최대값을 보기 좋은 숫자로 올림 (절반 눈금도 정수가 되도록 짝수 계열)
function niceMax(v: number): number {
  if (v <= 2) return 2;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 4, 6, 8, 10]) {
    if (v <= m * pow) return m * pow;
  }
  return 10 * pow;
}

// 위쪽 모서리만 둥근 막대 (데이터 끝만 둥글게, 바닥은 직각)
function topRoundedBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    "Z",
  ].join(" ");
}

interface ChartDatum {
  date: string;
  values: number[];
}

function DailyBarChart({
  data,
  series,
  format,
  height = 180,
}: {
  data: ChartDatum[];
  series: { label: string; color: string }[];
  format: (n: number) => string;
  height?: number;
}) {
  const [containerRef, width] = useContainerWidth();
  const [hover, setHover] = useState<number | null>(null);

  const padTop = 8;
  const padBottom = 20;
  const padLeft = 34;
  const padRight = 4;
  const innerW = Math.max(0, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const rawMax = Math.max(...totals, 0);
  const max = niceMax(rawMax);
  const isEmpty = rawMax === 0;

  const n = data.length;
  const slotW = n > 0 ? innerW / n : 0;
  const barW = Math.min(24, Math.max(2, slotW * 0.65));

  // x축 라벨: 6개 내외만 표시
  const labelStep = Math.max(1, Math.ceil(n / 6));
  const yTicks = [max / 2, max];

  const hovered = hover !== null ? data[hover] : null;
  const tooltipLeft =
    hover !== null && width > 0
      ? Math.min(Math.max(padLeft + hover * slotW + slotW / 2 - 70, 0), width - 150)
      : 0;

  return (
    <div ref={containerRef} className="relative" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={series.map((s) => s.label).join(", ")}
        >
          {/* 눈금선 (헤어라인) + y 라벨 */}
          {yTicks.map((t) => {
            const y = padTop + innerH - (t / max) * innerH;
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  stroke="#ececee"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill="#a1a1aa"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {t >= 1000 ? `${t / 1000}k` : t}
                </text>
              </g>
            );
          })}
          {/* 기준선 */}
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={padTop + innerH}
            y2={padTop + innerH}
            stroke="#d4d4d8"
            strokeWidth={1}
          />

          {/* 호버 배경 */}
          {hover !== null && (
            <rect
              x={padLeft + hover * slotW}
              y={padTop}
              width={slotW}
              height={innerH}
              fill="#f4f4f5"
            />
          )}

          {/* 막대 (스택: 아래→위, 세그먼트 사이 2px 흰 간격) */}
          {data.map((d, i) => {
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            let cursorY = padTop + innerH;
            const segments: ReactNode[] = [];
            const lastIdx = d.values.reduce(
              (acc, v, si) => (v > 0 ? si : acc),
              -1
            );
            d.values.forEach((v, si) => {
              if (v <= 0) return;
              const segH = (v / max) * innerH;
              const isTop = si === lastIdx;
              // 흰 간격(2px)은 세그먼트 '위쪽'에 — 막대는 항상 바닥(기준선)에 붙는다
              const drawH = isTop ? segH : Math.max(1, segH - 2);
              segments.push(
                isTop ? (
                  <path
                    key={si}
                    d={topRoundedBar(x, cursorY - segH, barW, drawH, 3)}
                    fill={series[si].color}
                  />
                ) : (
                  <rect
                    key={si}
                    x={x}
                    y={cursorY - drawH}
                    width={barW}
                    height={drawH}
                    fill={series[si].color}
                  />
                )
              );
              cursorY -= segH;
            });
            return <g key={d.date}>{segments}</g>;
          })}

          {/* x축 라벨 */}
          {data.map((d, i) =>
            i % labelStep === 0 ? (
              <text
                key={d.date}
                x={padLeft + i * slotW + slotW / 2}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="#a1a1aa"
              >
                {shortDate(d.date)}
              </text>
            ) : null
          )}

          {/* 호버 히트 영역 (슬롯 전체) */}
          {data.map((d, i) => (
            <rect
              key={d.date}
              x={padLeft + i * slotW}
              y={padTop}
              width={slotW}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
      )}

      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 pointer-events-none">
          기간 내 데이터가 없습니다
        </div>
      )}

      {/* 툴팁 */}
      {hovered && !isEmpty && (
        <div
          className="absolute top-0 z-10 pointer-events-none rounded-lg bg-zinc-900 text-white px-3 py-2 shadow-lg"
          style={{ left: tooltipLeft, minWidth: 120 }}
        >
          <div className="text-[11px] text-zinc-400 mb-1">{shortDate(hovered.date)}</div>
          {series.map((s, si) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-zinc-300">{s.label}</span>
              <span
                className="ml-auto font-medium"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(hovered.values[si])}
              </span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs mt-1 pt-1 border-t border-zinc-700">
              <span className="text-zinc-300">합계</span>
              <span
                className="ml-auto font-medium"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(hovered.values.reduce((a, b) => a + b, 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 일자별 상세 테이블 ── */
function DailyTable({
  daily,
  visiblePlanKeys,
}: {
  daily: DailyRow[];
  visiblePlanKeys: readonly ("starter" | "basic" | "pro" | "other")[];
}) {
  // 최근 날짜가 위로
  const rows = [...daily].reverse();
  return (
    <div className="bezel-card rounded-2xl overflow-hidden">
      <div className="px-6 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-sm font-medium text-zinc-700">일자별 상세</h3>
      </div>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
              <th className="px-6 py-2.5 font-medium">날짜</th>
              <th className="px-4 py-2.5 font-medium text-right">가입</th>
              <th className="px-4 py-2.5 font-medium text-xs">유입 출처</th>
              <th className="px-4 py-2.5 font-medium text-right">구매</th>
              {visiblePlanKeys.map((k) => (
                <th key={k} className="px-4 py-2.5 font-medium text-right text-xs">
                  {PLAN_LABELS[k]}
                </th>
              ))}
              <th className="px-4 py-2.5 font-medium text-right">변환</th>
              <th className="px-4 py-2.5 font-medium text-right">크레딧</th>
              <th className="px-6 py-2.5 font-medium text-right">매출</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {rows.map((d) => {
              const empty =
                d.signups === 0 && d.purchases.total === 0 && d.conversions === 0;
              return (
                <tr
                  key={d.date}
                  className={`border-b border-[var(--border-subtle)] last:border-0 ${
                    empty ? "text-zinc-300" : "text-zinc-700"
                  }`}
                >
                  <td className="px-6 py-2">{d.date}</td>
                  <td className="px-4 py-2 text-right">{fmtInt(d.signups)}</td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-zinc-500">
                    {fmtSources(d.signup_sources)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">
                    {fmtInt(d.purchases.total)}
                  </td>
                  {visiblePlanKeys.map((k) => (
                    <td key={k} className="px-4 py-2 text-right text-xs">
                      {fmtInt(d.purchases[k])}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right">{fmtInt(d.conversions)}</td>
                  <td className="px-4 py-2 text-right">{fmtInt(d.credits_used)}</td>
                  <td className="px-6 py-2 text-right">
                    {d.revenue > 0 ? fmtKrw(d.revenue) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── AI 서비스 비용 섹션 ── */
function AiCostSection({ ai }: { ai: AiStats }) {
  const { claude, mathpix } = ai;
  const [monthYear, monthNum] = ai.month.split("-");
  const monthLabel = `${monthYear}년 ${parseInt(monthNum)}월`;

  // 두 서비스 날짜 합집합 (최근이 위)
  const dateSet = new Set<string>();
  claude.daily?.forEach((d) => dateSet.add(d.date));
  mathpix.daily?.forEach((d) => dateSet.add(d.date));
  const allDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  const claudeByDate = new Map((claude.daily ?? []).map((d) => [d.date, d]));
  const mathpixByDate = new Map((mathpix.daily ?? []).map((d) => [d.date, d]));

  return (
    <div className="space-y-4">
      {/* 월 누적 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bezel-card rounded-2xl p-6">
          <div className="text-sm text-zinc-500 mb-1">
            Claude API · {monthLabel} 누적 비용
          </div>
          {!claude.configured ? (
            <ClaudeSetupGuide />
          ) : claude.error ? (
            <div className="text-sm text-red-600 mt-2">{claude.error}</div>
          ) : (
            <>
              <div className="text-3xl font-bold text-zinc-900">
                {fmtUsd(claude.month_to_date_usd ?? 0)}
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                선불 크레딧에서 차감되는 방식이라 별도 결제일은 없습니다. 잔액이
                소진되면 충전(자동충전 설정 시 자동 결제)됩니다.
              </p>
            </>
          )}
        </div>

        <div className="bezel-card rounded-2xl p-6">
          <div className="text-sm text-zinc-500 mb-1">
            Mathpix OCR · {monthLabel} 사용량
          </div>
          {!mathpix.configured ? (
            <div className="text-sm text-zinc-500 mt-2">
              MATHPIX_APP_ID / MATHPIX_APP_KEY 환경변수가 설정되지 않았습니다.
            </div>
          ) : mathpix.error ? (
            <div className="text-sm text-red-600 mt-2">{mathpix.error}</div>
          ) : (
            <>
              <div className="text-3xl font-bold text-zinc-900">
                {fmtInt(mathpix.month_to_date_count ?? 0)}
                <span className="text-base font-normal text-zinc-500 ml-1">건</span>
                <span className="text-lg font-semibold text-zinc-600 ml-3">
                  ≈ {fmtUsd(mathpix.month_to_date_est_usd ?? 0)}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-2">
                월 사용량 후불 청구 — 이 금액이 다음 달 초에 결제될 예상액입니다.
                (건당 ${mathpix.unit_usd} 기준 추정, MATHPIX_COST_PER_REQUEST로 조정
                가능)
              </p>
            </>
          )}
        </div>
      </div>

      {/* 일자별 차트 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {claude.configured && !claude.error && (
          <div className="bezel-card rounded-2xl p-5">
            <ChartHeader
              title="Claude 일자별 비용"
              summary={fmtUsd((claude.daily ?? []).reduce((s, d) => s + d.usd, 0))}
            />
            <DailyBarChart
              data={(claude.daily ?? []).map((d) => ({ date: d.date, values: [d.usd] }))}
              series={[{ label: "비용(USD)", color: "#2a78d6" }]}
              format={fmtUsd}
            />
          </div>
        )}
        {mathpix.configured && !mathpix.error && (
          <div className="bezel-card rounded-2xl p-5">
            <ChartHeader
              title="Mathpix 일자별 요청"
              summary={`${fmtInt((mathpix.daily ?? []).reduce((s, d) => s + d.count, 0))}건`}
            />
            <DailyBarChart
              data={(mathpix.daily ?? []).map((d) => ({
                date: d.date,
                values: [d.count],
              }))}
              series={[{ label: "요청 수", color: "#1baf7a" }]}
              format={(n) => `${fmtInt(n)}건`}
            />
          </div>
        )}
      </div>

      {/* 일자별 상세 테이블 */}
      {allDates.length > 0 && (
        <div className="bezel-card rounded-2xl overflow-hidden">
          <div className="px-6 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-medium text-zinc-700">AI 비용 일자별 상세</h3>
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                  <th className="px-6 py-2.5 font-medium">날짜 (UTC)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Claude 비용</th>
                  <th className="px-4 py-2.5 font-medium text-right">Mathpix 요청</th>
                  <th className="px-6 py-2.5 font-medium text-right">Mathpix 예상 비용</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
                {allDates.map((date) => {
                  const c = claudeByDate.get(date);
                  const m = mathpixByDate.get(date);
                  return (
                    <tr
                      key={date}
                      className="border-b border-[var(--border-subtle)] last:border-0 text-zinc-700"
                    >
                      <td className="px-6 py-2">{date}</td>
                      <td className="px-4 py-2 text-right">
                        {c ? fmtUsd(c.usd) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {m ? fmtInt(m.count) : "—"}
                      </td>
                      <td className="px-6 py-2 text-right">
                        {m ? fmtUsd(m.est_usd) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ClaudeSetupGuide() {
  return (
    <div className="text-sm text-zinc-500 mt-2 space-y-1.5">
      <p>
        Claude 비용 조회에는 <span className="font-mono text-xs">ANTHROPIC_ADMIN_KEY</span>{" "}
        환경변수가 필요합니다 (일반 API 키와 다른 Admin 키).
      </p>
      <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-0.5">
        <li>Anthropic Console → Settings → Admin keys에서 키 생성 (조직 계정 필요)</li>
        <li>Vercel 프로젝트 환경변수에 ANTHROPIC_ADMIN_KEY 추가 후 재배포</li>
      </ol>
    </div>
  );
}

/* ── 변환 리포트 탭 ── */
interface ReportEntry {
  id: string;
  user_id: string;
  email: string | null;
  comment: string;
  status: "received" | "reviewed" | "accepted" | "rejected";
  rewarded: boolean;
  rewarded_at: string | null;
  created_at: string;
  original_url: string | null;
  converted_url: string | null;
}

const STATUS_META: Record<
  ReportEntry["status"],
  { label: string; cls: string }
> = {
  received: { label: "접수", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" },
  reviewed: { label: "확인", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  accepted: { label: "채택", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  rejected: { label: "반려", cls: "bg-red-500/10 text-red-600 border-red-500/20" },
};

// 수동 상태 토글에서는 '채택'을 빼고 접수/확인/반려만. 채택은 보상 지급 버튼 전용.
const TOGGLE_STATUSES: ReportEntry["status"][] = ["received", "reviewed", "rejected"];

function ReportsTab() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const limit = 10;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/reports?${params.toString()}`);
      if (!res.ok) {
        setReports([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setReports((data.reports as ReportEntry[]) ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "상태 변경에 실패했습니다.");
    }
    load();
  }

  async function reward(id: string) {
    if (!confirm("이 신고자에게 50크레딧을 지급할까요? (신고가 '채택' 처리됩니다)")) return;
    setBusyId(id);
    const res = await fetch(`/api/admin/reports/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reward: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyId(null);
    if (!res.ok) alert(data.error ?? "지급에 실패했습니다.");
    load();
  }

  const totalPages = Math.ceil(total / limit);
  const filters: [string, string][] = [
    ["", "전체"],
    ["received", "접수"],
    ["reviewed", "확인"],
    ["accepted", "채택"],
    ["rejected", "반려"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        {filters.map(([v, label]) => (
          <button
            key={v || "all"}
            onClick={() => {
              setStatusFilter(v);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              statusFilter === v
                ? "bg-[var(--accent)] text-white"
                : "text-zinc-600 hover:text-zinc-800 border border-[var(--border-light)]"
            }`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-sm text-zinc-500">총 {total}건</span>
      </div>

      {loading && reports.length === 0 ? (
        <div className="bezel-card rounded-2xl px-6 py-12 text-center text-zinc-500">
          불러오는 중...
        </div>
      ) : reports.length === 0 ? (
        <div className="bezel-card rounded-2xl px-6 py-12 text-center text-zinc-500">
          신고가 없습니다.
        </div>
      ) : (
        reports.map((r) => (
          <div key={r.id} className="bezel-card rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_META[r.status].cls}`}
              >
                {STATUS_META[r.status].label}
              </span>
              <span className="text-sm font-medium text-zinc-800">
                {r.email ?? "(이메일 없음)"}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {r.user_id.slice(0, 8)}
              </span>
              <span className="text-xs text-zinc-500 ml-auto">
                {new Date(r.created_at).toLocaleString("ko-KR")}
              </span>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <ReportImage label="원본 시험지" url={r.original_url} onOpen={setLightbox} />
              <ReportImage label="변환 결과" url={r.converted_url} onOpen={setLightbox} />
            </div>

            <div className="rounded-xl bg-zinc-50 border border-[var(--border-subtle)] px-4 py-3 mb-4">
              <div className="text-xs text-zinc-400 mb-1">신고 내용</div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap break-words">
                {r.comment}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {TOGGLE_STATUSES.map((s) => (
                <button
                  key={s}
                  disabled={busyId === r.id}
                  onClick={() => setStatus(r.id, s)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-50 ${
                    r.status === s
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "text-zinc-600 border-[var(--border-light)] hover:bg-zinc-50"
                  }`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
              <div className="ml-auto">
                {r.rewarded ? (
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    ✓ 50크레딧 지급됨
                  </span>
                ) : (
                  <button
                    disabled={busyId === r.id}
                    onClick={() => reward(r.id)}
                    className="btn-primary text-xs px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    채택 + 50크레딧 지급
                  </button>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <span className="text-sm text-zinc-500">총 {total}건</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              다음
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="신고 이미지 원본"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}

function ReportImage({
  label,
  url,
  onOpen,
}: {
  label: string;
  url: string | null;
  onOpen: (u: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-1.5">{label}</div>
      {url ? (
        <button
          type="button"
          onClick={() => onOpen(url)}
          className="block w-full aspect-[4/3] rounded-xl overflow-hidden border border-[var(--border-light)] bg-zinc-50 hover:border-[var(--accent)] transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain"
          />
        </button>
      ) : (
        <div className="w-full aspect-[4/3] rounded-xl border border-[var(--border-light)] bg-zinc-50 flex items-center justify-center text-xs text-zinc-400">
          이미지 없음
        </div>
      )}
    </div>
  );
}

/* ── 크레딧 반환 내역 탭 ── */
interface RefundEntry {
  id: string;
  user_id: string;
  email: string | null;
  pdf_name: string | null;
  problem_count: number;
  credits_used: number;
  refunded_credits: number;
  status: string;
  created_at: string;
}

function RefundsTab() {
  const [refunds, setRefunds] = useState<RefundEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const [filterEmail, setFilterEmail] = useState<string | null>(null);
  const limit = 20;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filterUserId) params.set("user_id", filterUserId);
    const res = await fetch(`/api/admin/refunds?${params.toString()}`);
    if (!res.ok) {
      setRefunds([]);
      setTotal(0);
      return;
    }
    const data = await res.json();
    setRefunds((data.refunds as RefundEntry[]) ?? []);
    setTotal(data.total ?? 0);
  }, [page, filterUserId]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleUser(userId: string, email: string | null) {
    if (filterUserId === userId) {
      setFilterUserId(null);
      setFilterEmail(null);
    } else {
      setFilterUserId(userId);
      setFilterEmail(email);
    }
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="bezel-card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          크레딧 반환 내역{" "}
          <span className="text-sm font-normal text-zinc-500">({total}건)</span>
        </h2>
        {filterEmail && (
          <button
            onClick={() => {
              setFilterUserId(null);
              setFilterEmail(null);
              setPage(1);
            }}
            className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:opacity-80 transition-opacity"
          >
            {filterEmail}
            <span>✕</span>
          </button>
        )}
      </div>

      {refunds.length === 0 ? (
        <div className="px-6 py-12 text-center text-zinc-500">
          {filterEmail
            ? `${filterEmail}의 반환 내역이 없습니다.`
            : "반환 내역이 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                <th className="px-6 py-3 font-medium">날짜</th>
                <th className="px-6 py-3 font-medium">유저</th>
                <th className="px-6 py-3 font-medium">파일</th>
                <th className="px-6 py-3 font-medium text-center">사용</th>
                <th className="px-6 py-3 font-medium text-center">반환</th>
                <th className="px-6 py-3 font-medium text-center">사유</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-zinc-50"
                >
                  <td className="px-6 py-3 text-zinc-600">
                    {new Date(r.created_at).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => toggleUser(r.user_id, r.email)}
                      className={`hover:text-[var(--accent)] transition-colors ${
                        filterUserId === r.user_id
                          ? "text-[var(--accent)] font-semibold"
                          : "text-zinc-700"
                      }`}
                    >
                      {r.email ?? r.user_id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-zinc-700">{r.pdf_name || "—"}</td>
                  <td className="px-6 py-3 text-center text-zinc-600">
                    {r.credits_used}
                  </td>
                  <td className="px-6 py-3 text-center text-emerald-600 font-medium">
                    +{r.refunded_credits}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        r.status === "failed"
                          ? "bg-red-500/10 text-red-600 border-red-500/20"
                          : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      }`}
                    >
                      {r.status === "failed" ? "전체 실패" : "일부 실패"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <span className="text-sm text-zinc-500">{total}건</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-600 disabled:opacity-30"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
