"use client";

import { useState, useRef, useEffect } from "react";
import { categories } from "./data/faq";

type Message = {
  id: number;
  role: "bot" | "user";
  text: string;
  quickReplies?: string[];
  log_id?: string;
  feedbackSent?: boolean;
};

async function searchDocuments(question: string): Promise<{ answer: string | null; source?: string; log_id?: string }> {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return await res.json();
  } catch {
    return { answer: null };
  }
}

async function sendFeedback(log_id: string, feedback: 1 | -1) {
  await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ log_id, feedback }),
  });
}

function renderBotText(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("**") && line.endsWith("**")) {
      return <p key={i} className="font-semibold text-gray-800 mt-2 mb-0.5">{line.replace(/\*\*/g, "")}</p>;
    }
    if (line.startsWith("> ")) {
      return (
        <div key={i} className="border-l-3 border-blue-300 bg-blue-50 px-2 py-1 rounded-r text-xs text-blue-700 my-1">
          {line.replace(/^> /, "")}
        </div>
      );
    }
    if (/^\d+\./.test(line)) {
      return <p key={i} className="text-sm py-0.5">{line}</p>;
    }
    if (line.startsWith("- ") || line.startsWith("- ")) {
      return <p key={i} className="text-sm py-0.5 pl-2">• {line.replace(/^- /, "")}</p>;
    }
    if (line.startsWith("|")) return null;
    if (line.trim() === "") return <div key={i} className="h-1" />;
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith("**") ? <strong key={j}>{p.replace(/\*\*/g, "")}</strong> : p
    );
    return <p key={i} className="text-sm leading-relaxed">{parts}</p>;
  });
}

const WELCOME: Message = {
  id: 0,
  role: "bot",
  text: "안녕하세요! 👋\n선엔지니어링 총무팀 Q&A 챗봇입니다.\n아래 카테고리를 선택하거나 질문을 직접 입력해 주세요.",
  quickReplies: categories.map((c) => `${c.icon} ${c.label}`),
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "인사·급여": ["연차", "급여", "휴가", "인사", "퇴직", "입사"],
  "사내규정": ["규정", "복무", "취업규칙", "상조"],
  "사내전화": ["전화", "내선", "번호"],
  "그룹웨어": ["그룹웨어", "비밀번호", "로그인", "전자결재"],
  "양식·서류": ["양식", "서류", "신청서", "사직", "차용"],
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessage(msg: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextId.current++ }]);
  }

  function markFeedback(msgId: number) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, feedbackSent: true } : m));
  }

  async function handleUserInput(text: string) {
    const cleaned = text.replace(/^[^\w가-힣]+/, "").trim();
    addMessage({ role: "user", text });

    const cat = categories.find((c) => text.includes(c.label));
    if (cat) {
      const catKws = CATEGORY_KEYWORDS[cat.label] || [];
      const hint = catKws.length > 0 ? catKws.join(", ") : cat.label;
      setTimeout(() => {
        addMessage({
          role: "bot",
          text: `**${cat.icon} ${cat.label}** 관련 내용을 검색해 드릴게요.\n키워드를 직접 입력해 주세요.\n예) ${hint}`,
          quickReplies: catKws.slice(0, 4),
        });
      }, 300);
      return;
    }

    const loadingId = nextId.current++;
    setMessages((prev) => [
      ...prev,
      { id: loadingId, role: "bot", text: "🔍 검색 중..." },
    ]);

    const result = await searchDocuments(cleaned);
    setMessages((prev) => prev.filter((m) => m.id !== loadingId));

    if (result.answer) {
      addMessage({
        role: "bot",
        text: `**📄 ${result.source ?? "문서"}**\n\n${result.answer}`,
        quickReplies: ["다른 질문하기", "카테고리 보기"],
        log_id: result.log_id,
      });
    } else {
      addMessage({
        role: "bot",
        text: "죄송합니다. 해당 내용을 찾지 못했어요. 😅\n다른 키워드로 다시 시도하거나 총무팀에 직접 문의해 주세요.",
        quickReplies: ["카테고리 보기", "총무팀 전화"],
        log_id: result.log_id,
      });
    }
  }

  function handleQuickReply(reply: string) {
    if (reply === "다른 질문하기" || reply === "카테고리 보기") {
      addMessage({ role: "user", text: reply });
      setTimeout(() => {
        addMessage({
          role: "bot",
          text: "다시 도와드릴게요! 카테고리를 선택하거나 질문을 입력해 주세요.",
          quickReplies: categories.map((c) => `${c.icon} ${c.label}`),
        });
      }, 300);
      return;
    }
    if (reply === "총무팀 전화") {
      window.location.href = "tel:000-0000-0000";
      return;
    }
    handleUserInput(reply);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    handleUserInput(input.trim());
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-blue-700 text-white px-4 py-4 flex items-center gap-3 shadow shrink-0">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-lg">🤖</div>
        <div className="flex-1">
          <h1 className="text-base font-bold leading-tight">선엔지니어링 Q&A</h1>
          <p className="text-xs text-blue-200">청주 총무팀 업무 도우미</p>
        </div>
      </header>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* 말풍선 */}
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-700 text-white rounded-tr-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
              }`}
            >
              {msg.role === "bot" ? renderBotText(msg.text) : <p>{msg.text}</p>}
            </div>

            {/* 피드백 버튼 (봇 답변 + log_id 있을 때만) */}
            {msg.role === "bot" && msg.log_id && (
              <div className="flex items-center gap-1 mt-1.5 ml-1">
                {msg.feedbackSent ? (
                  <span className="text-xs text-gray-400">피드백 감사합니다</span>
                ) : (
                  <>
                    <span className="text-xs text-gray-400 mr-1">도움이 됐나요?</span>
                    <button
                      onClick={async () => {
                        await sendFeedback(msg.log_id!, 1);
                        markFeedback(msg.id);
                      }}
                      className="text-base px-1.5 py-0.5 rounded hover:bg-green-50 transition-colors"
                      title="도움됨"
                    >
                      👍
                    </button>
                    <button
                      onClick={async () => {
                        await sendFeedback(msg.log_id!, -1);
                        markFeedback(msg.id);
                      }}
                      className="text-base px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors"
                      title="도움안됨"
                    >
                      👎
                    </button>
                  </>
                )}
              </div>
            )}

            {/* 빠른 답변 버튼 */}
            {msg.role === "bot" && msg.quickReplies && (
              <div className="flex flex-wrap gap-2 mt-2 max-w-[90%]">
                {msg.quickReplies.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleQuickReply(r)}
                    className="text-xs px-3 py-1.5 rounded-full border border-blue-300 text-blue-700 bg-white hover:bg-blue-50 transition-all"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-gray-200 bg-white px-4 py-3 flex gap-2 items-center"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요..."
          className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          type="submit"
          className="w-10 h-10 bg-blue-700 text-white rounded-full flex items-center justify-center shrink-0 hover:bg-blue-800 transition-all disabled:opacity-40"
          disabled={!input.trim()}
        >
          ▶
        </button>
      </form>
    </div>
  );
}
