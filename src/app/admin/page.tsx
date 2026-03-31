"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type Tab = "users" | "logs" | "stats";

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
            <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
              관리자
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/dashboard"
              className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
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
                  ? "bg-[var(--accent)] text-[#0a0a0a]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "users" && <UsersTab />}
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
  const supabase = createClient();

  const loadUsers = useCallback(async () => {
    let query = supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (search) {
      query = query.ilike("email", `%${search}%`);
    }

    const { data, count } = await query;
    setUsers(data ?? []);
    setTotal(count ?? 0);
  }, [page, search, supabase]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAddCredits() {
    if (!creditModal || !creditAmount) return;
    const amount = parseInt(creditAmount);
    if (isNaN(amount) || amount <= 0) return;

    const { error } = await supabase.rpc("add_credits_raw", {
      p_user_id: creditModal.id,
      p_credits: amount,
    });

    if (!error) {
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
          className="w-full max-w-md px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border-light)] text-zinc-100 placeholder-zinc-600 text-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
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
                  className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02]"
                >
                  <td className="px-6 py-3 text-zinc-200">{u.email}</td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.role === "admin"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-center text-zinc-300">
                    {u.credits}
                  </td>
                  <td className="px-6 py-3 text-center text-zinc-400">
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
                className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 disabled:opacity-30 transition-colors"
              >
                이전
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 disabled:opacity-30 transition-colors"
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
              className="w-full px-4 py-2.5 rounded-xl bg-[#0a0a0a] border border-[var(--border-light)] text-zinc-100 text-sm focus:outline-none focus:border-[var(--accent)] mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCreditModal(null)}
                className="flex-1 py-2 rounded-xl text-sm border border-[var(--border-light)] text-zinc-400 hover:text-zinc-200 transition-colors"
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
  const supabase = createClient();

  const loadLogs = useCallback(async () => {
    const from = (page - 1) * limit;
    let query = supabase
      .from("error_logs")
      .select("*, profiles(email)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (filterUserId) {
      query = query.eq("user_id", filterUserId);
    }

    const { data, count } = await query;
    setLogs((data as ErrorLogEntry[]) ?? []);
    setTotal(count ?? 0);
  }, [page, filterUserId, supabase]);

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
            className="flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
          >
            {filterEmail}
            <span className="text-amber-300">✕</span>
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
            <div key={log.id} className="px-6 py-4 hover:bg-white/[0.02]">
              <div className="flex items-center gap-4">
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                  {log.error_type}
                </span>
                <span
                  className="text-sm text-zinc-300 truncate flex-1 cursor-pointer"
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
                <pre className="mt-3 p-3 rounded-lg bg-black/40 text-xs text-zinc-500 overflow-x-auto whitespace-pre-wrap">
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
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 disabled:opacity-30"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 disabled:opacity-30"
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
  const supabase = createClient();

  useEffect(() => {
    async function loadStats() {
      // 유저 수
      const { count: userCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true });

      // 변환 통계
      const { count: totalConv } = await supabase
        .from("conversions")
        .select("*", { count: "exact", head: true });

      const { count: successConv } = await supabase
        .from("conversions")
        .select("*", { count: "exact", head: true })
        .eq("status", "completed");

      // 총 크레딧 사용
      const { data: creditData } = await supabase
        .from("conversions")
        .select("credits_used")
        .eq("status", "completed");
      const totalCredits =
        creditData?.reduce((sum, c) => sum + c.credits_used, 0) ?? 0;

      setStats({
        total_users: userCount ?? 0,
        total_conversions: totalConv ?? 0,
        success_rate:
          totalConv && totalConv > 0
            ? Math.round(((successConv ?? 0) / totalConv) * 100)
            : 0,
        total_credits_used: totalCredits,
      });
    }
    loadStats();
  }, [supabase]);

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
      color: "text-zinc-100",
    },
    {
      label: "변환 성공률",
      value: stats.success_rate,
      unit: "%",
      color:
        stats.success_rate >= 90
          ? "text-emerald-400"
          : stats.success_rate >= 70
            ? "text-amber-400"
            : "text-red-400",
    },
    {
      label: "총 크레딧 사용",
      value: stats.total_credits_used,
      unit: "회",
      color: "text-zinc-100",
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
