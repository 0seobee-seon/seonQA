"use client";

import { useRef, useState } from "react";
import { CATEGORIES } from "./types";

export function FileUploadPanel({ password }: { password: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("업무매뉴얼");
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setStatus(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("category", category);

    try {
      const res = await fetch("/api/admin/upload-file", {
        method: "POST",
        headers: { "x-admin-password": password },
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", msg: `"${data.filename}" 업로드 완료 — 청크 ${data.chunks}개 생성, 임베딩 ${data.embedded}/${data.chunks}개` });
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      } else {
        setStatus({ type: "error", msg: data.error ?? "업로드 실패" });
      }
    } catch {
      setStatus({ type: "error", msg: "네트워크 오류로 업로드하지 못했습니다." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">📎 파일로 업로드</h3>
      <p className="text-xs text-gray-400 mb-4">PDF, HWPX 파일을 올리면 텍스트 추출 → 청킹 → 임베딩까지 자동으로 처리됩니다.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">파일 (PDF, HWPX)</label>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.hwpx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
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

        {status && (
          <div className={`text-sm px-3 py-2 rounded-lg ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {status.type === "success" ? "✅ " : "❌ "}{status.msg}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          className="w-full py-2.5 bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-blue-800 transition-colors"
        >
          {uploading ? "추출 및 업로드 중..." : "업로드"}
        </button>
      </div>
    </div>
  );
}
