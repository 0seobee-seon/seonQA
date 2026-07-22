import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { KEYWORD_SCORE_CAP, KEYWORD_WEIGHT, VECTOR_WEIGHT, applyCategoryBoost, compareByHybridThenRecency, extractSnippet, keywordScore, tokenize } from "./searchUtils";
import { getClientIp, isRateLimited } from "../rateLimit";
import { supabaseAdmin } from "../supabaseAdmin";

type HistoryItem = { role: "user" | "bot"; text: string };
type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

const SEARCH_RATE_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 60_000;

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
  : null;

async function logQuery(
  supabase: SupabaseAdmin,
  payload: {
    question: string;
    answer: string | null;
    source_filename?: string;
    source_category?: string;
    score?: number;
    search_mode?: string;
    was_answered: boolean;
  }
): Promise<string | null> {
  const { data, error } = await supabase.from("query_logs").insert(payload).select("id").single();
  if (error) return null;
  return data?.id ?? null;
}

// 스트리밍 응답의 첫 줄에 실어 보내는 메타데이터 (문서 출처, log_id 등).
// 클라이언트는 첫 "\n" 까지를 JSON으로 파싱하고, 그 이후 바이트는 답변 본문 텍스트로 그대로 이어붙인다.
type StreamMeta = {
  type: "meta";
  source: string;
  category: string;
  score: number;
  searchMode: "hybrid" | "keyword";
  log_id: string | null;
};

function streamMetaLine(meta: StreamMeta): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(meta) + "\n");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (isRateLimited(`search:${ip}`, SEARCH_RATE_LIMIT, SEARCH_RATE_WINDOW_MS)) {
    return NextResponse.json({ answer: null, error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const { question, history } = (await req.json()) as { question: string; history?: HistoryItem[] };

  if (!question?.trim()) {
    return NextResponse.json({ answer: null });
  }

  // 팔로우업 질문("그럼 서류는 어디서 받아?")이 이전 주제를 이어받도록,
  // 직전 사용자 질문을 검색어(키워드/임베딩)에 함께 실어 보낸다.
  const prevUserTurn = (history ?? []).filter((h) => h.role === "user").slice(-1)[0]?.text ?? "";
  const retrievalText = `${prevUserTurn} ${question}`.trim();

  const tokens = tokenize(retrievalText);
  if (tokens.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const supabase = supabaseAdmin();

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, category, content, created_at");

  if (error || !docs || docs.length === 0) {
    const log_id = await logQuery(supabase, { question: question.trim(), answer: null, was_answered: false });
    return NextResponse.json({ answer: null, log_id, error: error?.message });
  }

  // --- 벡터 검색 ---
  const vectorScoreMap = new Map<string, number>();

  if (process.env.GOOGLE_AI_API_KEY) {
    try {
      const embRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: retrievalText.slice(0, 1000) }] },
            outputDimensionality: 768,
          }),
        }
      );
      const embData = await embRes.json();
      if (!embData.embedding?.values) throw new Error(JSON.stringify(embData));
      const queryEmbedding = embData.embedding.values as number[];

      const { data: vectorDocs } = await supabase.rpc("match_documents", {
        query_embedding: queryEmbedding,
        match_threshold: 0.2,
        match_count: 10,
      });

      if (vectorDocs) {
        for (const vd of vectorDocs) {
          vectorScoreMap.set(vd.id, vd.similarity as number);
        }
      }
    } catch (e) {
      console.warn("Vector search failed, falling back to keyword only:", e);
    }
  }

  const hasVectorResults = vectorScoreMap.size > 0;

  const scored = docs
    .map((doc) => {
      const kScore = keywordScore(tokens, doc.filename, doc.content || "");
      const vScore = vectorScoreMap.get(doc.id) ?? 0;

      let hybrid: number;
      if (hasVectorResults) {
        const kNorm = Math.min(kScore, KEYWORD_SCORE_CAP) / KEYWORD_SCORE_CAP;
        hybrid = kNorm * KEYWORD_WEIGHT + vScore * VECTOR_WEIGHT;
      } else {
        hybrid = kScore;
      }

      hybrid = applyCategoryBoost(hybrid, doc.category);

      return { ...doc, kScore, vScore, hybrid };
    })
    .filter((d) => d.hybrid > 0)
    .sort(compareByHybridThenRecency);

  if (scored.length === 0) {
    const log_id = await logQuery(supabase, { question: question.trim(), answer: null, was_answered: false });
    return NextResponse.json({ answer: null, log_id });
  }

  const best = scored[0];

  // 점수가 낮으면 미응답으로 분류
  const LOW_SCORE_THRESHOLD = hasVectorResults ? 0.12 : 3;
  const wasAnswered = best.hybrid >= LOW_SCORE_THRESHOLD;

  // 상위 3개 문서를 컨텍스트로 활용 (일관된 종합 답변)
  const topDocs = scored.slice(0, 3);

  // "누구" 계열 질문이면 각부서업무담당자 문서를 강제로 컨텍스트에 포함
  const isPersonQuery = /누구|담당자|담당은|담당이|누가/.test(question);
  if (isPersonQuery) {
    const buseoDoc = scored.find(
      (d) => d.filename.includes("각부서업무담당자") && !topDocs.some((t) => t.id === d.id)
    );
    if (buseoDoc) topDocs[topDocs.length - 1] = buseoDoc;
  }

  const contextBlocks = topDocs.map((doc) => {
    const raw = doc.content || "";
    // 각부서업무담당자 문서는 전체 내용 전달 (담당자 정보 누락 방지)
    if (doc.filename.includes("각부서업무담당자")) return `[문서: ${doc.filename}]\n${raw}`;
    const snippet = raw.length <= 600 ? raw : extractSnippet(tokens, raw).slice(0, 600);
    return `[문서: ${doc.filename}]\n${snippet}`;
  }).join("\n\n---\n\n");

  // fallback: 담당자 질문이면 각부서업무담당자 문서 내용을, 아니면 best 문서 발췌
  const fallbackDoc = isPersonQuery
    ? (topDocs.find((d) => d.filename.includes("각부서업무담당자")) ?? best)
    : best;
  const fallbackRaw = fallbackDoc.content || "";
  const fallbackSnippet = fallbackRaw.length <= 1500 ? fallbackRaw : extractSnippet(tokens, fallbackRaw);

  const searchMode = hasVectorResults ? "hybrid" as const : "keyword" as const;

  // 답변 내용은 스트리밍이 끝난 뒤에야 확정되므로, log_id를 먼저 발급받아 메타로 보내고
  // 실제 answer 텍스트는 스트림 종료 후 별도로 업데이트한다.
  const log_id = await logQuery(supabase, {
    question: question.trim(),
    answer: null,
    source_filename: best.filename,
    source_category: best.category,
    score: best.hybrid,
    search_mode: searchMode,
    was_answered: wasAnswered,
  });

  const historyBlock = (history ?? []).length > 0
    ? `[이전 대화]\n${(history ?? []).map((h) => `${h.role === "user" ? "직원" : "챗봇"}: ${h.text}`).join("\n")}\n\n`
    : "";

  const prompt = `당신은 선엔지니어링 총무팀 업무 안내 AI입니다.
아래 사내 문서들을 바탕으로 직원의 질문에 친절하고 명확하게 답변해 주세요.

${historyBlock}${contextBlocks}

[직원 질문]
${question}

답변 시 주의사항:
- 이전 대화가 있다면 "그럼", "거기서" 같은 이어지는 표현이 무엇을 가리키는지 문맥으로 파악할 것
- 여러 문서의 내용을 종합하여 일관되고 완전한 답변을 작성할 것
- 담당자, 절차, 주의사항, 링크 등 모든 세부 정보를 빠짐없이 포함할 것
- 단계별 절차가 있으면 순서대로 모두 안내할 것
- 문서에 없는 내용은 추측하지 말 것
- 자연스러운 구어체 한국어로 작성할 것
- 마크다운 형식(볼드, 목록 등) 사용 가능`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        streamMetaLine({
          type: "meta",
          source: best.filename,
          category: best.category,
          score: best.hybrid,
          searchMode,
          log_id,
        })
      );

      let finalAnswer = fallbackSnippet;

      if (groq && contextBlocks) {
        try {
          console.log(`[Groq] contextBlocks ${contextBlocks.length}자, prompt ${prompt.length}자`);
          const completion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 1000,
            stream: true,
          });

          let generated = "";
          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content ?? "";
            if (delta) {
              generated += delta;
              controller.enqueue(encoder.encode(delta));
            }
          }

          if (generated) {
            console.log(`[Groq] 답변 생성 성공 (${generated.length}자)`);
            finalAnswer = generated;
          } else {
            console.error("[Groq] 답변 생성 실패: 빈 응답, 원문 발췌로 fallback");
            controller.enqueue(encoder.encode(fallbackSnippet));
          }
        } catch (e) {
          console.error("Groq 답변 생성 실패, 원문 발췌로 fallback:", e);
          controller.enqueue(encoder.encode(fallbackSnippet));
        }
      } else {
        controller.enqueue(encoder.encode(fallbackSnippet));
      }

      controller.close();

      if (log_id) {
        await supabase.from("query_logs").update({ answer: finalAnswer }).eq("id", log_id);
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
