"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Tab = "users" | "logs" | "stats" | "reports" | "refunds";

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
  created_at: string;
  profiles?: { email: string } | null;
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
            <a href="/" className="flex items-center gap-2">
              <span
                className="text-xl font-bold tracking-tighter"
                style={{ fontFamily: "var(--font-en)" }}
              >
                Math
              </span>
              <span
                className="text-xl font-bold text-[var(--accent)]"
                style={{ fontFamily: "var(--font-en)" }}
              >
                OCR
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
        {tab === "reports" && <ReportsTab />}
        {tab === "refunds" && <RefundsTab />}
        {tab === "logs" && <LogsTab />}
        {tab === "stats" && <StatsTab />}
      </div>
    </div>
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
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-zinc-50"
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
                      onClick={() => setCreditModal(u)}
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
              {expandedId === log.id && log.stack_trace && (
                <pre className="mt-3 p-3 rounded-lg bg-zinc-100 text-xs text-zinc-500 overflow-x-auto whitespace-pre-wrap">
                  {log.stack_trace}
                </pre>
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
function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);

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

  return (
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
  const limit = 10;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/reports?${params.toString()}`);
    if (!res.ok) {
      setReports([]);
      setTotal(0);
      return;
    }
    const data = await res.json();
    setReports((data.reports as ReportEntry[]) ?? []);
    setTotal(data.total ?? 0);
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

      {reports.length === 0 ? (
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
          <img src={url} alt={label} className="w-full h-full object-contain" />
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
