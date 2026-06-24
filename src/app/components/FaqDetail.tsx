"use client";

import { useState } from "react";
import type { FaqItem } from "../data/faq";

function renderAnswer(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableLines: string[] = [];

  const flushTable = (key: string) => {
    if (tableLines.length < 2) return;
    const [header, , ...rows] = tableLines;
    const headers = header.split("|").map((h) => h.trim()).filter(Boolean);
    elements.push(
      <div key={key} className="overflow-x-auto my-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-blue-50">
              {headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 border border-gray-200 text-blue-800 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
              return (
                <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  {cells.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 border border-gray-200 text-gray-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  lines.forEach((line, i) => {
    if (line.startsWith("|")) {
      tableLines.push(line);
      return;
    }
    if (tableLines.length > 0) flushTable(`table-${i}`);

    if (line.startsWith("**") && line.endsWith("**")) {
      elements.push(<p key={i} className="font-semibold text-gray-800 mt-4 mb-1">{line.replace(/\*\*/g, "")}</p>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <div key={i} className="border-l-4 border-blue-300 bg-blue-50 px-3 py-2 rounded-r-lg my-2 text-sm text-blue-800">
          {line.replace(/^> /, "")}
        </div>
      );
    } else if (/^\d+\./.test(line)) {
      elements.push(<p key={i} className="text-gray-700 text-sm py-0.5 pl-1">{line}</p>);
    } else if (line.startsWith("- ")) {
      elements.push(<p key={i} className="text-gray-700 text-sm py-0.5 pl-3">• {line.replace(/^- /, "")}</p>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
    } else {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
        part.startsWith("**") ? <strong key={j}>{part.replace(/\*\*/g, "")}</strong> : part
      );
      elements.push(<p key={i} className="text-gray-700 text-sm">{parts}</p>);
    }
  });

  if (tableLines.length > 0) flushTable("table-end");
  return elements;
}

export default function FaqDetail({ faq, onBack }: { faq: FaqItem; onBack: () => void }) {
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white py-4 px-4 flex items-center gap-3 shadow">
        <button onClick={onBack} className="text-blue-200 hover:text-white text-lg">←</button>
        <div>
          <p className="text-xs text-blue-200">선엔지니어링 Q&A</p>
          <h1 className="text-base font-semibold">{faq.question}</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* 카테고리 배지 */}
        <span className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-2 py-0.5">
          {faq.category}
        </span>

        {/* 답변 본문 */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-5">
          {renderAnswer(faq.answer)}
        </div>

        {/* 담당자 */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">담당자</p>
            <p className="text-sm font-medium text-gray-800">{faq.contact.name}</p>
            <p className="text-sm text-gray-500">{faq.contact.phone}</p>
          </div>
          <a
            href={`tel:${faq.contact.phone}`}
            className="bg-blue-700 text-white text-sm px-4 py-2 rounded-lg"
          >
            📞 전화
          </a>
        </div>

        {/* 피드백 */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 text-center">
          <p className="text-sm text-gray-500 mb-3">이 답변이 도움이 됐나요?</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setFeedback("up")}
              className={`px-6 py-2 rounded-lg border text-sm transition-all ${
                feedback === "up"
                  ? "bg-blue-700 text-white border-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-400"
              }`}
            >
              👍 도움됐어요
            </button>
            <button
              onClick={() => setFeedback("down")}
              className={`px-6 py-2 rounded-lg border text-sm transition-all ${
                feedback === "down"
                  ? "bg-red-500 text-white border-red-500"
                  : "border-gray-200 text-gray-600 hover:border-red-400"
              }`}
            >
              👎 아쉬워요
            </button>
          </div>
          {feedback && (
            <p className="mt-3 text-xs text-gray-400">
              {feedback === "up" ? "피드백 감사합니다! 😊" : "더 나은 답변을 위해 노력하겠습니다."}
            </p>
          )}
        </div>

        {/* 목록으로 */}
        <button
          onClick={onBack}
          className="w-full py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:border-blue-400 transition-all"
        >
          ← 목록으로 돌아가기
        </button>
      </main>
    </div>
  );
}
