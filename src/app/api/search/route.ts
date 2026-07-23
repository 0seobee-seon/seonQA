import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { KEYWORD_SCORE_CAP, KEYWORD_WEIGHT, VECTOR_WEIGHT, applyCategoryBoost, compareByHybridThenRecency, extractSnippet, keywordScore, tokenize } from "./searchUtils";
import { getClientIp, isRateLimited } from "../rateLimit";
import { supabaseAdmin } from "../supabaseAdmin";
import { getCachedAnswer, setCachedAnswer } from "./answerCache";
import { searchRequestSchema } from "../validation";

type SupabaseAdmin = ReturnType<typeof supabaseAdmin>;

const SEARCH_RATE_LIMIT = 20;
const SEARCH_RATE_WINDOW_MS = 60_000;
// Vercel 함수 최대 실행시간보다 충분히 짧게 잡아, 초과 시 다음 단계(Groq → 발췌)로 넘어가게 한다.
const GEMINI_TIMEOUT_MS = 12_000;
const GROQ_TIMEOUT_MS = 20_000;

const genAI = process.env.GOOGLE_AI_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY) : null;

const groq = process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
  : null;

// Gemini는 실패 시 Groq로 폴백해야 하므로, 부분 스트리밍 없이 전체 응답을 모아서 반환한다.
async function generateWithGemini(prompt: string): Promise<string | null> {
  if (!genAI) return null;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite",
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
    });
    const result = await model.generateContent(prompt, { signal: abortController.signal });
    return result.response.text().trim() || null;
  } catch (e) {
    console.warn("[Gemini] 답변 생성 실패, Groq로 폴백:", e);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
  if (error) {
    console.error("[search] query_logs insert 실패:", error.message);
    return null;
  }
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ answer: null, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ answer: null, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const { question, history } = parsed.data;

  const supabase = supabaseAdmin();

  // 대화 맥락이 없는 첫 질문에 한해 캐시를 사용한다. history가 있으면 이전 대화를 반영한
  // 답변이라 같은 질문 텍스트라도 문맥에 따라 달라질 수 있어 캐시 대상에서 제외한다.
  const noHistory = (history ?? []).length === 0;
  if (noHistory) {
    const cached = getCachedAnswer(question);
    if (cached) {
      const log_id = await logQuery(supabase, {
        question: question.trim(),
        answer: cached.answer,
        source_filename: cached.source,
        source_category: cached.category,
        score: cached.score,
        search_mode: cached.searchMode,
        was_answered: cached.wasAnswered,
      });
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            streamMetaLine({
              type: "meta",
              source: cached.source,
              category: cached.category,
              score: cached.score,
              searchMode: cached.searchMode,
              log_id,
            })
          );
          controller.enqueue(new TextEncoder().encode(cached.answer));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }

  // 팔로우업 질문("그럼 서류는 어디서 받아?")이 이전 주제를 이어받도록,
  // 직전 사용자 질문을 검색어(키워드/임베딩)에 함께 실어 보낸다.
  const prevUserTurn = (history ?? []).filter((h) => h.role === "user").slice(-1)[0]?.text ?? "";
  const retrievalText = `${prevUserTurn} ${question}`.trim();

  const tokens = tokenize(retrievalText);
  if (tokens.length === 0) {
    return NextResponse.json({ answer: null });
  }

  // 매 요청마다 documents 전체를 훑어 JS에서 키워드 스코어링한다 (searchUtils.keywordScore).
  // 문서 수가 적을 땐(수백 건) 문제없지만, DB 레벨 필터로 미리 좁히려면 documents.content를
  // searchUtils.normalize()와 동일한 규칙으로 정규화해 저장하는 컬럼이 먼저 필요하다 —
  // 그렇지 않으면 한글 음절 사이 공백이 있는 문서가 ILIKE 필터에서 누락되는 회귀가 생긴다.
  // 문서 수가 수천 건대로 늘어나면 이 지점부터 재검토.
  const DOC_SCAN_WARN_THRESHOLD = 2000;

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, category, content, created_at");

  if (docs && docs.length > DOC_SCAN_WARN_THRESHOLD) {
    console.warn(`[search] documents 전체 스캔 중 (${docs.length}건) — DB 레벨 필터링 도입을 검토할 시점`);
  }

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

      // match_documents SQL 함수의 기본 match_threshold(0.3, supabase/migration_vector.sql)보다
      // 낮게 잡아 후보를 더 넉넉히 받아온다 — 최종 채택 여부는 이후 hybrid 스코어링과
      // LOW_SCORE_THRESHOLD가 결정하므로, 여기서는 좁게 자르지 않고 넓게 모으는 편이 안전하다.
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

      const cacheAnswer = (answer: string) => {
        // 대화 맥락 없이 생성된 정상 답변만 캐싱 — history가 섞인 답변은
        // 문맥 의존적이라 다른 세션의 같은 질문에 그대로 재사용하면 안 된다.
        if (noHistory && wasAnswered) {
          setCachedAnswer(question, {
            source: best.filename,
            category: best.category,
            score: best.hybrid,
            searchMode,
            wasAnswered,
            answer,
          });
        }
      };

      if (contextBlocks) {
        const geminiAnswer = genAI ? await generateWithGemini(prompt) : null;

        if (geminiAnswer) {
          console.log(`[Gemini] 답변 생성 성공 (${geminiAnswer.length}자)`);
          finalAnswer = geminiAnswer;
          controller.enqueue(encoder.encode(geminiAnswer));
          cacheAnswer(geminiAnswer);
        } else if (groq) {
          // Groq가 응답을 물고 늘어지면 사용자가 무한정 "검색 중..." 상태로 기다리게 되므로,
          // 일정 시간 내 첫 응답이 없으면 중단하고 fallbackSnippet으로 넘어간다.
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), GROQ_TIMEOUT_MS);
          try {
            console.log(`[Groq] contextBlocks ${contextBlocks.length}자, prompt ${prompt.length}자`);
            const completion = await groq.chat.completions.create(
              {
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.3,
                max_tokens: 1000,
                stream: true,
              },
              { signal: abortController.signal }
            );

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
              cacheAnswer(generated);
            } else {
              console.error("[Groq] 답변 생성 실패: 빈 응답, 원문 발췌로 fallback");
              controller.enqueue(encoder.encode(fallbackSnippet));
            }
          } catch (e) {
            console.error("Groq 답변 생성 실패, 원문 발췌로 fallback:", e);
            controller.enqueue(encoder.encode(fallbackSnippet));
          } finally {
            clearTimeout(timeoutId);
          }
        } else {
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
