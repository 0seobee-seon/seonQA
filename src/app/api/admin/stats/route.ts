import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [allLogs, todayLogs, unanswered, negativeFeedback, docCount] = await Promise.all([
    supabase.from("query_logs").select("id, question, was_answered, feedback, created_at, source_category, score, search_mode").order("created_at", { ascending: false }).limit(200),
    supabase.from("query_logs").select("id", { count: "exact" }).gte("created_at", todayStart.toISOString()),
    supabase.from("query_logs").select("id, question, created_at").eq("was_answered", false).order("created_at", { ascending: false }).limit(50),
    supabase.from("query_logs").select("id", { count: "exact" }).eq("feedback", -1),
    supabase.from("documents").select("id", { count: "exact" }),
  ]);

  const logs = allLogs.data ?? [];
  const total = logs.length;
  const unansweredCount = (unanswered.data ?? []).length;
  const goodFeedback = logs.filter((l) => l.feedback === 1).length;
  const badFeedback = (negativeFeedback.count ?? 0);

  // 자주 나온 질문 (단순 빈도 — 같은 텍스트 기준)
  const freq: Record<string, number> = {};
  for (const l of logs) {
    const q = l.question.trim();
    freq[q] = (freq[q] ?? 0) + 1;
  }
  const topQuestions = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));

  // 카테고리별 분포
  const catFreq: Record<string, number> = {};
  for (const l of logs) {
    const c = l.source_category ?? "미분류";
    catFreq[c] = (catFreq[c] ?? 0) + 1;
  }
  const categoryStats = Object.entries(catFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  return NextResponse.json({
    summary: {
      total,
      today: todayLogs.count ?? 0,
      unanswered: unansweredCount,
      goodFeedback,
      badFeedback,
      docCount: docCount.count ?? 0,
    },
    topQuestions,
    categoryStats,
    recentLogs: logs.slice(0, 50),
    unansweredList: unanswered.data ?? [],
  });
}
