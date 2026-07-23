"use client";

import { useState } from "react";
import { useAdminAuth } from "./useAdminAuth";
import { DashboardTab } from "./DashboardTab";
import { UnansweredTab } from "./UnansweredTab";
import { UploadTab } from "./UploadTab";
import { DocsTab } from "./DocsTab";

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
