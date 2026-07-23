"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./adminFetch";
import { EditDocPanel } from "./EditDocPanel";
import { CATEGORIES, type Doc } from "./types";

export function DocsTab({ password }: { password: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCat) params.set("category", filterCat);
    adminFetch(`/api/admin/docs?${params}`, password)
      .then((r) => r.json())
      .then((d) => setDocs(d.docs ?? []))
      .finally(() => setLoading(false));
  }, [password, filterCat]);

  useEffect(() => {
    // 데이터 페칭 effect — 마운트/필터 변경 시 문서 목록을 새로 불러온다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

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
              <div key={doc.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
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
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setEditingId(editingId === doc.id ? null : doc.id)}
                        className="text-xs px-2 py-1 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                      >
                        {editingId === doc.id ? "닫기" : "수정"}
                      </button>
                      <button
                        onClick={() => setConfirmId(doc.id)}
                        className="text-xs px-2 py-1 text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>

                {editingId === doc.id && (
                  <div className="mt-3">
                    <EditDocPanel
                      password={password}
                      docId={doc.id}
                      onCancel={() => setEditingId(null)}
                      onDone={() => { setEditingId(null); load(); }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
