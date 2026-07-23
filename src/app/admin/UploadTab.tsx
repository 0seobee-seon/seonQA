"use client";

import { useState } from "react";
import { adminFetch } from "./adminFetch";
import { FileUploadPanel } from "./FileUploadPanel";
import { CATEGORIES } from "./types";

export function UploadTab({ password }: { password: string }) {
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
    <div className="space-y-4">
      <FileUploadPanel password={password} />

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">📤 새 문서 추가 (직접 입력)</h3>
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
    </div>
  );
}
