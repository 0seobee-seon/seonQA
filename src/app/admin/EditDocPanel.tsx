"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "./adminFetch";
import { CATEGORIES } from "./types";

export function EditDocPanel({ password, docId, onDone, onCancel }: { password: string; docId: string; onDone: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(true);
  const [filename, setFilename] = useState("");
  const [category, setCategory] = useState("업무매뉴얼");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    // 데이터 페칭 effect — docId가 바뀔 때마다 해당 문서 내용을 새로 불러온다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    adminFetch(`/api/admin/docs?id=${docId}`, password)
      .then((r) => r.json())
      .then((d) => {
        setFilename(d.doc?.filename ?? "");
        setCategory(d.doc?.category ?? "업무매뉴얼");
        setContent(d.doc?.content ?? "");
      })
      .finally(() => setLoading(false));
  }, [password, docId]);

  async function handleSave() {
    if (!filename.trim() || !content.trim()) return;
    setSaving(true);
    setStatus(null);
    const res = await adminFetch("/api/admin/docs", password, {
      method: "PATCH",
      body: JSON.stringify({ id: docId, filename: filename.trim(), category, content: content.trim() }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      onDone();
    } else {
      setStatus({ type: "error", msg: data.error ?? "저장 실패" });
    }
  }

  return (
    <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 space-y-3">
      {loading ? (
        <div className="text-center py-6 text-gray-400 text-sm">불러오는 중...</div>
      ) : (
        <>
          <div>
            <label className="block text-xs text-gray-600 mb-1">문서 제목</label>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            >
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-y"
            />
          </div>

          {status && (
            <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700">❌ {status.msg}</div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !filename.trim() || !content.trim()}
              className="px-4 py-2 bg-blue-700 text-white text-sm rounded-lg disabled:opacity-40 hover:bg-blue-800 transition-colors"
            >
              {saving ? "저장 및 재임베딩 중..." : "저장"}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors"
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  );
}
