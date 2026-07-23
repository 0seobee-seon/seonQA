"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "./adminFetch";
import type { UnansweredItem } from "./types";

export function UnansweredTab({ password }: { password: string }) {
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

  useEffect(() => {
    // 데이터 페칭 effect — 마운트/password 변경 시 목록을 새로 불러온다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

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
