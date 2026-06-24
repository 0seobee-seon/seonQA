"use client";

import { useState, useMemo } from "react";
import { faqs, categories, type Category, type FaqItem } from "./data/faq";
import FaqDetail from "./components/FaqDetail";

export default function Home() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedFaq, setSelectedFaq] = useState<FaqItem | null>(null);

  const filtered = useMemo(() => {
    let list = faqs;
    if (selectedCategory) {
      list = list.filter((f) => f.category === selectedCategory);
    }
    if (search.trim()) {
      const tokens = search.trim().split(/\s+/);
      list = list.filter((f) =>
        tokens.some(
          (t) =>
            f.question.includes(t) ||
            f.keywords.some((k) => k.includes(t)) ||
            f.answer.includes(t)
        )
      );
    }
    return list;
  }, [search, selectedCategory]);

  if (selectedFaq) {
    return <FaqDetail faq={selectedFaq} onBack={() => setSelectedFaq(null)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-blue-700 text-white py-8 px-4 text-center shadow">
        <h1 className="text-2xl font-bold tracking-tight">선엔지니어링 Q&A</h1>
        <p className="mt-1 text-blue-200 text-sm">청주 총무팀 업무 도우미</p>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* 검색창 */}
        <div className="relative mb-6">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedCategory(null);
            }}
            placeholder="궁금한 업무를 검색하세요 (예: 명함, 연차, 지출)"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 카테고리 버튼 */}
        {!search && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setSelectedCategory(selectedCategory === cat.id ? null : cat.id)
                }
                className={`flex flex-col items-center justify-center gap-1 py-4 rounded-xl border text-sm font-medium transition-all ${
                  selectedCategory === cat.id
                    ? "bg-blue-700 text-white border-blue-700 shadow"
                    : "bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:text-blue-600"
                }`}
              >
                <span className="text-2xl">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* FAQ 목록 */}
        <div>
          <p className="text-xs text-gray-400 mb-3 px-1">
            {selectedCategory
              ? `${selectedCategory} 관련 질문`
              : search
              ? `"${search}" 검색 결과`
              : "전체 질문 목록"}{" "}
            <span className="font-medium text-gray-600">{filtered.length}건</span>
          </p>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-500 text-sm mb-1">검색 결과가 없습니다.</p>
              <p className="text-gray-400 text-xs">
                다른 키워드로 검색하거나 총무팀에 직접 문의해 주세요.
              </p>
              <a
                href="tel:000-0000-0000"
                className="mt-4 inline-block bg-blue-700 text-white text-sm px-5 py-2 rounded-lg"
              >
                📞 총무팀 문의
              </a>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((faq) => (
                <li key={faq.id}>
                  <button
                    onClick={() => setSelectedFaq(faq)}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-4 hover:border-blue-400 hover:shadow-sm transition-all flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-md px-2 py-0.5 shrink-0">
                        {faq.category}
                      </span>
                      <span className="text-sm text-gray-800">{faq.question}</span>
                    </div>
                    <span className="text-gray-300 shrink-0">›</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
