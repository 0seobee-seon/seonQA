"use client";

import { useState, useEffect, useCallback } from "react";

// ─── 타입 ───────────────────────────────────────────────────────────────────

type Stats = {
  summary: {
    total: number;
    today: number;
    unanswered: number;
    goodFeedback: number;
    badFeedback: number;
    docCount: number;
  };
  topQuestions: { question: string; count: number }[];
  categoryStats: { category: string; count: number }[];
  recentLogs: {
    id: string;
    question: string;
    was_answered: boolean;
    feedback: number | null;
    created_at: string;
    source_category: string | null;
    score: number | null;
    search_mode: string | null;
  }[];
  unansweredList: { id: string; question: string; created_at: string }[];
};

type Doc = {
  id: string;
  filename: string;
  category: string;
  created_at: string;
  has_embedding: boolean;
};

type UnansweredItem = { id: string; question: string; created_at: string };

const CATEGORIES = ["업무매뉴얼", "규정정책", "조직연락처", "사내양식", "직접답변", "일반"];

// ─── 인증 훅 ────────────────────────────────────────────────────────────────

function useAdminAuth() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_pw");
    if (saved) { setPassword(saved); setAuthed(true); }
  }, []);

  async function login(pw: string) {
    setChecking(true);
    setError("");
    const res = await fetch("/api/admin/stats", {
      headers: { "x-admin-password": pw },
    });
    setChecking(false);
    if (res.ok) {
      sessionStorage.setItem("admin_pw", pw);
      setPassword(pw);
      setAuthed(true);
    } else {
      setError("비밀번호가 올바르지 않습니다.");
    }
  }

  function logout() {
    sessionStorage.removeItem("admin_pw");
    setAuthed(false);
    setPassword("");
  }

  return { password, authed, checking, error, login, logout };
}

// ─── 공통 fetch 헬퍼 ─────────────────────────────────────────────────────────

function adminFetch(url: string, password: string, opts: RequestInit = {}) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": password,
      ...(opts.headers ?? {}),
    },
  });
}

// ─── 탭: 대시보드 ────────────────────────────────────────────────────────────

function DashboardTab({ password }: { password: string }) {
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

// ─── 탭: 미응답 질문 ─────────────────────────────────────────────────────────

function UnansweredTab({ password }: { password: string }) {
  const [items, setItems] = useState<UnansweredItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UnansweredItem | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/api/admin/qa", password)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, [password]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!selected || !answer.trim()) return;
    setSaving(true);
    const res = await adminFetch("/api/admin/qa", password, {
      method: "POST",
      body: JSON.stringify({ question: selected.question, answer: answer.trim(), log_id: selected.id }),
    });
    setSaving(false);
    if (res.ok) {
      setDone((prev) => [...prev, selected.id]);
      setSelected(null);
      setAnswer("");
    }
  }

  const visible = items.filter((i) => !done.includes(i.id));

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">챗봇이 답변하지 못한 질문들입니다. 직접 답변을 입력하면 다음 질문부터 참고합니다.</p>

      {loading ? (
        <div className="text-center py-8 text-gray-400">불러오는 중...</div>
      ) : visible.length === 0 ? (
        <div className="text-center py-8 text-gray-400">미응답 질문이 없습니다. 👍</div>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selected?.id === item.id ? "border-blue-400 shadow-md" : "border-gray-100 hover:border-blue-200"}`}
              onClick={() => { setSelected(item); setAnswer(""); }}
            >
              <p className="text-sm text-gray-800">{item.question}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(item.created_at).toLocaleString("ko-KR")}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 답변 입력 패널 */}
      {selected && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700">질문: {selected.question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="답변을 입력하세요. 이 내용이 문서로 저장되어 다음 답변에 활용됩니다."
            rows={5}
            className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !answer.trim()}
              className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-blue-800 transition-colors"
            >
              {saving ? "저장 중..." : "저장 및 학습"}
            </button>
            <button
              onClick={() => { setSelected(null); setAnswer(""); }}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 탭: 데이터 업로드 ───────────────────────────────────────────────────────

function UploadTab({ password }: { password: string }) {
  const [filename, setFilename] = useState("");
  const [category, setCategory] = useState("업무매뉴얼");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!filename.trim() || !content.trim()) return;
    setSaving(true);
    setStatus(null);
    const res = await adminFetch("/api/admin/upload", password, {
      method: "POST",
      body: JSON.stringify({ filename, category, content }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setStatus({ type: "success", msg: `저장 완료${data.embedded ? " (벡터 임베딩 생성됨)" : " (임베딩 대기 중)"}` });
      setFilename(""); setContent("");
    } else {
      setStatus({ type: "error", msg: data.error ?? "저장 실패" });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">📤 새 문서 추가</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">문서 제목 *</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="예) 감리현장 개설 시 총무팀 요청사항"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">카테고리</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">내용 *</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="챗봇이 참고할 문서 내용을 입력하세요."
            rows={10}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            required
          />
          <p className="text-xs text-gray-400 mt-1">{content.length.toLocaleString()} 자</p>
        </div>

        {status && (
          <div className={`text-sm px-3 py-2 rounded-lg ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {status.type === "success" ? "✅ " : "❌ "}{status.msg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !filename.trim() || !content.trim()}
          className="w-full py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-blue-800 transition-colors"
        >
          {saving ? "저장 및 임베딩 생성 중..." : "저장"}
        </button>
      </form>
    </div>
  );
}

// ─── 탭: 문서 관리 ───────────────────────────────────────────────────────────

function DocsTab({ password }: { password: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCat) params.set("category", filterCat);
    adminFetch(`/api/admin/docs?${params}`, password)
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .finally(() => setLoading(false));
  }, [password, filterCat]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    setDeleting(id);
    await adminFetch("/api/admin/docs", password, {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    setDocs((prev) => prev.filter((d) => d.id !== id));
    setDeleting(null);
    setConfirmId(null);
  }

  const filtered = docs.filter((d) =>
    !search || d.filename.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="문서명 검색..."
          className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
        />
        <select
          value={filterCat}
          onChange={(e) => { setFilterCat(e.target.value); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
        >
          <option value="">전체 카테고리</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">문서가 없습니다.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
            총 {filtered.length}개 문서
          </div>
          <div className="divide-y divide-gray-50">
            {filtered.map((doc) => (
              <div key={doc.id} className="flex items-center px-4 py-3 hover:bg-gray-50 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{doc.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {doc.category} · {new Date(doc.created_at).toLocaleDateString("ko-KR")}
                    {!doc.has_embedding && <span className="ml-2 text-orange-500">· 임베딩 없음</span>}
                  </p>
                </div>
                {confirmId === doc.id ? (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      className="text-xs px-2 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      {deleting === doc.id ? "삭제 중..." : "확인"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-lg"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(doc.id)}
                    className="shrink-0 text-xs px-2 py-1 text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                  >
                    삭제
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 메인 관리자 페이지 ──────────────────────────────────────────────────────

export default function AdminPage() {
  const { password, authed, checking, error, login, logout } = useAdminAuth();
  const [pw, setPw] = useState("");
  const [tab, setTab] = useState<"dashboard" | "unanswered" | "upload" | "docs">("dashboard");

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔐</div>
            <h1 className="text-lg font-bold text-gray-800">관리자 로그인</h1>
            <p className="text-xs text-gray-500 mt-1">선엔지니어링 Q&A 챗봇 관리자 페이지</p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); login(pw); }}
            className="space-y-3"
          >
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="관리자 비밀번호"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={checking || !pw}
              className="w-full py-3 bg-blue-700 text-white text-sm font-medium rounded-xl disabled:opacity-40 hover:bg-blue-800 transition-colors"
            >
              {checking ? "확인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const TABS = [
    { key: "dashboard" as const, label: "📊 대시보드" },
    { key: "unanswered" as const, label: "❓ 미응답 관리" },
    { key: "upload" as const, label: "📤 데이터 업로드" },
    { key: "docs" as const, label: "📁 문서 관리" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <div>
            <h1 className="text-sm font-bold text-gray-800">Q&A 챗봇 관리자</h1>
            <p className="text-xs text-gray-400">선엔지니어링 총무팀</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg"
        >
          로그아웃
        </button>
      </header>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-200 px-4 overflow-x-auto">
        <div className="flex gap-1 whitespace-nowrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 콘텐츠 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab === "dashboard"   && <DashboardTab  password={password} />}
        {tab === "unanswered"  && <UnansweredTab password={password} />}
        {tab === "upload"      && <UploadTab     password={password} />}
        {tab === "docs"        && <DocsTab       password={password} />}
      </main>
    </div>
  );
}
