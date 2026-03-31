"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

interface Profile {
  credits: number;
  expires_at: string | null;
  role: string;
}

interface Conversion {
  id: string;
  pdf_name: string | null;
  problem_count: number;
  credits_used: number;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [totalConversions, setTotalConversions] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();
  const limit = 10;

  const loadData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/login");
      return;
    }
    setUser(user);

    // 프로필
    const { data: profileData } = await supabase
      .from("profiles")
      .select("credits, expires_at, role")
      .eq("id", user.id)
      .single();
    setProfile(profileData);

    // 변환 이력
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data: convData, count } = await supabase
      .from("conversions")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);
    setConversions(convData ?? []);
    setTotalConversions(count ?? 0);
    setLoading(false);
  }, [page, supabase, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isExpired =
    profile?.expires_at && new Date(profile.expires_at) < new Date();
  const totalPages = Math.ceil(totalConversions / limit);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-zinc-500">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
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
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">{user?.email}</span>
            {profile?.role === "admin" && (
              <a
                href="/admin"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                관리자
              </a>
            )}
            <button
              onClick={handleLogout}
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-8">마이페이지</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {/* 크레딧 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">잔여 크레딧</div>
            <div className="text-3xl font-bold text-[var(--accent)]">
              {profile?.credits ?? 0}
              <span className="text-base font-normal text-zinc-500 ml-1">
                회
              </span>
            </div>
          </div>

          {/* 유효기간 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">유효기간</div>
            <div
              className={`text-xl font-semibold ${isExpired ? "text-red-400" : "text-zinc-100"}`}
            >
              {profile?.expires_at
                ? new Date(profile.expires_at).toLocaleDateString("ko-KR")
                : "무제한"}
              {isExpired && (
                <span className="text-sm text-red-400 ml-2">만료됨</span>
              )}
            </div>
          </div>

          {/* 총 변환 */}
          <div className="bezel-card rounded-2xl p-6">
            <div className="text-sm text-zinc-500 mb-1">총 변환 횟수</div>
            <div className="text-3xl font-bold text-zinc-100">
              {totalConversions}
              <span className="text-base font-normal text-zinc-500 ml-1">
                건
              </span>
            </div>
          </div>
        </div>

        {/* Conversion History */}
        <div className="bezel-card rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
            <h2 className="text-lg font-semibold">변환 이력</h2>
          </div>

          {conversions.length === 0 ? (
            <div className="px-6 py-12 text-center text-zinc-500">
              아직 변환 이력이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500 border-b border-[var(--border-subtle)]">
                    <th className="px-6 py-3 font-medium">날짜</th>
                    <th className="px-6 py-3 font-medium">PDF 파일</th>
                    <th className="px-6 py-3 font-medium text-center">
                      문제 수
                    </th>
                    <th className="px-6 py-3 font-medium text-center">
                      크레딧
                    </th>
                    <th className="px-6 py-3 font-medium text-center">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-white/[0.02]"
                    >
                      <td className="px-6 py-3 text-zinc-400">
                        {new Date(c.created_at).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-6 py-3 text-zinc-200">
                        {c.pdf_name || "—"}
                      </td>
                      <td className="px-6 py-3 text-center text-zinc-300">
                        {c.problem_count}
                      </td>
                      <td className="px-6 py-3 text-center text-zinc-300">
                        {c.credits_used}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-sm text-zinc-500">
                {totalConversions}건 중 {(page - 1) * limit + 1}–
                {Math.min(page * limit, totalConversions)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 rounded-lg text-sm border border-[var(--border-light)] text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    started: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const labels: Record<string, string> = {
    completed: "완료",
    started: "진행 중",
    failed: "실패",
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs border ${styles[status] ?? "text-zinc-400 border-zinc-700"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
