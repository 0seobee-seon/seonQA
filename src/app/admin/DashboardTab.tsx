"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "./adminFetch";
import type { Stats } from "./types";

export function DashboardTab({ password }: { password: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/stats", password)
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [password]);

  if (loading) return <div className="text-center py-12 text-gray-400">데이터 불러오는 중...</div>;
  if (!stats) return <div className="text-center py-12 text-red-400">데이터를 불러오지 못했습니다.</div>;

  const { summary, topQuestions, categoryStats, recentLogs } = stats;
  const answeredRate = summary.total > 0
    ? Math.round(((summary.total - summary.unanswered) / summary.total) * 100)
    : 0;
  const maxCat = Math.max(...categoryStats.map((c) => c.count), 1);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "전체 질문", value: summary.total, color: "blue" },
          { label: "오늘 질문", value: summary.today, color: "indigo" },
          { label: "미응답", value: summary.unanswered, color: "orange" },
          { label: "응답률", value: `${answeredRate}%`, color: "green" },
          { label: "👍 좋아요", value: summary.goodFeedback, color: "emerald" },
          { label: "👎 별로예요", value: summary.badFeedback, color: "red" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 text-${c.color}-600`}>{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* 자주 묻는 질문 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">🔥 자주 묻는 질문 Top 10</h3>
          {topQuestions.length === 0 ? (
            <p className="text-sm text-gray-400">아직 데이터가 없습니다.</p>
          ) : (
            <ol className="space-y-2">
              {topQuestions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="text-gray-700 leading-snug">{q.question}</span>
                  <span className="shrink-0 ml-auto text-xs text-gray-400">{q.count}회</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* 카테고리별 분포 */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">📂 카테고리별 질문</h3>
          {categoryStats.length === 0 ? (
            <p className="text-sm text-gray-400">아직 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {categoryStats.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                    <span>{c.category}</span><span>{c.count}회</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(c.count / maxCat) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 최근 질문 로그 */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 최근 질문 로그</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-3">질문</th>
                <th className="pb-2 pr-3">카테고리</th>
                <th className="pb-2 pr-3">점수</th>
                <th className="pb-2 pr-3">응답</th>
                <th className="pb-2 pr-3">피드백</th>
                <th className="pb-2">시간</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-1.5 pr-3 max-w-[200px] truncate text-gray-700">{log.question}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{log.source_category ?? "-"}</td>
                  <td className="py-1.5 pr-3 text-gray-500">{log.score != null ? log.score.toFixed(2) : "-"}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${log.was_answered ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {log.was_answered ? "응답" : "미응답"}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    {log.feedback === 1 ? "👍" : log.feedback === -1 ? "👎" : "-"}
                  </td>
                  <td className="py-1.5 text-gray-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
