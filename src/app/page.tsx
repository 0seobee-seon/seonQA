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

type HistoryItem = { role: "user" | "bot"; text: string };

const HISTORY_TURNS = 3;

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
      return <p key={i} className="font-serif font-medium text-ink mt-2 mb-0.5">{line.replace(/\*\*/g, "")}</p>;
    }
    if (line.startsWith("> ")) {
      return (
        <div key={i} className="border-l-2 border-sun bg-paper px-2 py-1 text-xs text-ink/70 my-1">
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

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" />
    </div>
  );
}

const WELCOME: Message = {
  id: 0,
  role: "bot",
  text: "안녕하세요! 👋\n선엔지니어링 Q&A 챗봇입니다.\n아래 카테고리를 선택하거나 질문을 직접 입력해 주세요.",
  quickReplies: categories.map((c) => `${c.icon} ${c.label}`),
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "총무팀": ["명함", "지출결의서", "사무가구", "전산기기", "문서번호", "휴가", "4대보험"],
  "수주전략팀": ["수주", "입찰", "견적", "제안서", "계약"],
  "건설사업관리본부": ["현장", "공사", "감리", "시공", "안전관리"],
};

const STORAGE_KEY = "seonqa_messages";
// 대화가 길어져도 localStorage/메모리가 무한정 쌓이지 않도록 최근 메시지만 유지한다.
const MAX_STORED_MESSAGES = 200;

function loadStoredMessages(): Message[] {
  if (typeof window === "undefined") return [WELCOME];
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return [WELCOME];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0
      ? parsed.slice(-MAX_STORED_MESSAGES)
      : [WELCOME];
  } catch {
    return [WELCOME];
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(loadStoredMessages);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const lastQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    nextId.current = Math.max(0, ...messages.map((m) => m.id)) + 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch {
      // 저장 실패(용량 초과 등)는 대화 자체엔 영향 없으니 조용히 무시
    }
  }, [messages]);

  function addMessage(msg: Omit<Message, "id">) {
    setMessages((prev) => [...prev, { ...msg, id: nextId.current++ }].slice(-MAX_STORED_MESSAGES));
  }

  function markFeedback(msgId: number) {
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, feedbackSent: true } : m));
  }

  async function handleUserInput(text: string) {
    const cleaned = text.replace(/^[^\w가-힣]+/, "").trim();
    addMessage({ role: "user", text });

    const cat = categories.find((c) => cleaned === c.label);
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

    lastQuestionRef.current = cleaned;

    const history = messages
      .slice(-HISTORY_TURNS * 2)
      .filter((m) => m.text !== "🔍 검색 중...")
      .map((m): HistoryItem => ({ role: m.role, text: m.text }));

    const loadingId = nextId.current++;
    const loadingMsg: Message = { id: loadingId, role: "bot", text: "🔍 검색 중..." };
    setMessages((prev) => [...prev, loadingMsg].slice(-MAX_STORED_MESSAGES));

    const showError = () => {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      addMessage({
        role: "bot",
        text: "일시적인 오류로 답변을 가져오지 못했어요. 🙏\n잠시 후 다시 시도해 주세요.",
        quickReplies: ["다시 시도", "카테고리 보기"],
      });
    };

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned, history }),
      });

      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");

      if (!res.ok || isJson) {
        // 빈 질문 / 레이트리밋 / 검색결과 없음 등 - 즉시 완성된 JSON 응답
        setMessages((prev) => prev.filter((m) => m.id !== loadingId));
        if (!res.ok) {
          showError();
          return;
        }
        const data = await res.json();
        if (data.answer) {
          addMessage({
            role: "bot",
            text: `**📄 ${data.source ?? "문서"}**\n\n${data.answer}`,
            quickReplies: ["다른 질문하기", "카테고리 보기"],
            log_id: data.log_id,
          });
        } else {
          addMessage({
            role: "bot",
            text: "죄송합니다. 해당 내용을 찾지 못했어요. 😅\n다른 키워드로 다시 시도하거나 총무팀에 직접 문의해 주세요.",
            quickReplies: ["카테고리 보기", "총무팀 전화"],
            log_id: data.log_id,
          });
        }
        return;
      }

      // 스트리밍 응답 - 첫 줄은 메타(JSON), 이후 바이트는 답변 본문
      if (!res.body) { showError(); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let metaParsed = false;
      let metaBuffer = "";
      let source = "문서";
      let logId: string | undefined;

      for (;;) {
        const { done, value } = await reader.read();
        if (value) {
          const text = decoder.decode(value, { stream: true });
          if (!metaParsed) {
            metaBuffer += text;
            const nlIdx = metaBuffer.indexOf("\n");
            if (nlIdx === -1) continue;
            const metaLine = metaBuffer.slice(0, nlIdx);
            const rest = metaBuffer.slice(nlIdx + 1);
            try {
              const meta = JSON.parse(metaLine);
              source = meta.source ?? "문서";
              logId = meta.log_id ?? undefined;
            } catch {
              // 메타 파싱 실패 시 기본값 유지
            }
            metaParsed = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === loadingId
                  ? { ...m, text: `**📄 ${source}**\n\n${rest}`, log_id: logId }
                  : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingId ? { ...m, text: m.text + text } : m))
            );
          }
        }
        if (done) break;
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId ? { ...m, quickReplies: ["다른 질문하기", "카테고리 보기"] } : m
        )
      );
    } catch {
      showError();
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
    if (reply === "다시 시도" && lastQuestionRef.current) {
      handleUserInput(lastQuestionRef.current);
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
    <div className="flex flex-col h-screen bg-paper">
      {/* 헤더 */}
      <header className="bg-card border-b border-line px-4 py-4 flex items-center gap-3 shrink-0 shadow-sm">
        <div className="flex-1">
          <h1 className="flex items-center gap-2">
            <span className="font-brand font-black uppercase tracking-tight text-seal text-2xl">SEON</span>
            <span className="font-serif text-[10px] font-semibold uppercase tracking-widest text-ink bg-ink/10 border border-ink/20 rounded-full px-2 py-1">Chatbot</span>
          </h1>
        </div>
      </header>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`msg-in flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* 말풍선 */}
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === "user"
                  ? "bg-ink text-paper"
                  : "bg-card border border-line text-ink"
              }`}
            >
              {msg.role === "bot"
                ? msg.text === "🔍 검색 중..." ? <TypingDots /> : renderBotText(msg.text)
                : <p>{msg.text}</p>}
            </div>

            {/* 피드백 버튼 (봇 답변 + log_id 있을 때만) */}
            {msg.role === "bot" && msg.log_id && (
              <div className="flex items-center gap-1 mt-1.5 ml-1">
                {msg.feedbackSent ? (
                  <span className="text-xs text-ink/40">피드백 감사합니다</span>
                ) : (
                  <>
                    <span className="text-xs text-ink/40 mr-1">도움이 됐나요?</span>
                    <button
                      onClick={async () => {
                        await sendFeedback(msg.log_id!, 1);
                        markFeedback(msg.id);
                      }}
                      className="text-base px-1.5 py-0.5 rounded hover:bg-sun/15 hover:scale-110 transition-all"
                      title="도움됨"
                    >
                      👍
                    </button>
                    <button
                      onClick={async () => {
                        await sendFeedback(msg.log_id!, -1);
                        markFeedback(msg.id);
                      }}
                      className="text-base px-1.5 py-0.5 rounded hover:bg-seal/10 hover:scale-110 transition-all"
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
                    className="text-xs px-3 py-1.5 rounded-full border border-sun text-sun bg-card hover:bg-sun/10 hover:scale-105 active:scale-95 transition-all"
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
        className="shrink-0 border-t border-line bg-card px-4 py-3 flex gap-2 items-center"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="질문을 입력하세요..."
          className="flex-1 bg-paper rounded-full px-4 py-2.5 text-sm text-ink placeholder-ink/35 outline-none focus:ring-2 focus:ring-seal/40 transition-shadow"
        />
        <button
          type="submit"
          className="w-10 h-10 bg-ink text-paper rounded-full flex items-center justify-center shrink-0 hover:bg-seal hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100"
          disabled={!input.trim()}
        >
          ▶
        </button>
      </form>
    </div>
  );
}
