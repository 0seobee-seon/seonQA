import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const STOPWORDS = new Set([
  "찾아줘", "알려줘", "알려", "어떻게", "무엇", "뭐", "해줘", "해주세요",
  "방법", "절차", "있나요", "인가요", "입니까", "알고싶어", "궁금", "뭔가요",
  "어디", "언제", "누가", "왜", "어느", "입니다", "입니까", "하나요",
]);

const KEYWORD_WEIGHT = 0.4;
const VECTOR_WEIGHT = 0.6;
const KEYWORD_SCORE_CAP = 20;

function normalize(text: string) {
  return text.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
}

function tokenize(question: string): string[] {
  return (question.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
    (t) => !STOPWORDS.has(t)
  );
}

function keywordScore(tokens: string[], filename: string, content: string): number {
  const norm = normalize(content);
  const normFilename = normalize(filename);
  let score = 0;
  for (const t of tokens) {
    if (normFilename.includes(t)) score += 5;
    if (norm.includes(t)) score += 2;
  }
  return score;
}

function extractSnippet(tokens: string[], content: string): string {
  const norm = normalize(content);
  const seen = new Set<string>();
  const snippets: string[] = [];

  for (const word of tokens) {
    let idx = 0;
    while ((idx = norm.indexOf(word, idx)) !== -1) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(norm.length, idx + 100);
      const snippet = norm.slice(start, end).trim();
      if (!seen.has(snippet)) {
        seen.add(snippet);
        snippets.push(snippet);
      }
      idx += word.length;
      if (snippets.length >= 4) break;
    }
    if (snippets.length >= 4) break;
  }

  return snippets.length > 0 ? snippets.join("\n...\n") : norm.slice(0, 300);
}

async function logQuery(
  supabaseUrl: string,
  supabaseKey: string,
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
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/query_logs`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data[0]?.id as string) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { question } = await req.json();

  if (!question?.trim()) {
    return NextResponse.json({ answer: null });
  }

  const tokens = tokenize(question.trim());
  if (tokens.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, category, content");

  if (error || !docs || docs.length === 0) {
    const log_id = await logQuery(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { question: question.trim(), answer: null, was_answered: false });
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
            content: { parts: [{ text: question.trim().slice(0, 1000) }] },
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

      return { ...doc, kScore, vScore, hybrid };
    })
    .filter((d) => d.hybrid > 0)
    .sort((a, b) => b.hybrid - a.hybrid);

  if (scored.length === 0) {
    const log_id = await logQuery(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { question: question.trim(), answer: null, was_answered: false });
    return NextResponse.json({ answer: null, log_id });
  }

  const best = scored[0];

  // 점수가 낮으면 미응답으로 분류
  const LOW_SCORE_THRESHOLD = hasVectorResults ? 0.12 : 3;
  const wasAnswered = best.hybrid >= LOW_SCORE_THRESHOLD;

  // 상위 3개 문서를 컨텍스트로 활용 (일관된 종합 답변)
  const topDocs = scored.slice(0, 3);
  const contextBlocks = topDocs.map((doc) => {
    const raw = doc.content || "";
    // 각 문서당 최대 600자로 제한 (컨텍스트 과부하 방지)
    const snippet = raw.length <= 600 ? raw : extractSnippet(tokens, raw).slice(0, 600);
    return `[문서: ${doc.filename}]\n${snippet}`;
  }).join("\n\n---\n\n");

  const fallbackSnippet = (() => {
    const raw = best.content || "";
    return raw.length <= 1500 ? raw : extractSnippet(tokens, raw);
  })();
  let answer = fallbackSnippet;

  if (process.env.GOOGLE_AI_API_KEY && contextBlocks) {
    try {
      const prompt = `당신은 선엔지니어링 총무팀 업무 안내 AI입니다.
아래 사내 문서들을 바탕으로 직원의 질문에 친절하고 명확하게 답변해 주세요.

${contextBlocks}

[직원 질문]
${question}

답변 시 주의사항:
- 여러 문서의 내용을 종합하여 일관되고 완전한 답변을 작성할 것
- 담당자, 절차, 주의사항, 링크 등 모든 세부 정보를 빠짐없이 포함할 것
- 단계별 절차가 있으면 순서대로 모두 안내할 것
- 문서에 없는 내용은 추측하지 말 것
- 자연스러운 구어체 한국어로 작성할 것
- 마크다운 형식(볼드, 목록 등) 사용 가능`;

      console.log(`[Gemini] contextBlocks ${contextBlocks.length}자, prompt ${prompt.length}자`);
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
          }),
        }
      );
      const geminiData = await geminiRes.json();
      const generated = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (generated) {
        console.log(`[Gemini] 답변 생성 성공 (${generated.length}자)`);
        answer = generated;
      } else {
        console.error("[Gemini] 답변 생성 실패:", JSON.stringify(geminiData).slice(0, 300));
      }
    } catch (e) {
      console.error("Gemini 답변 생성 실패, 원문 발췌로 fallback:", e);
    }
  }

  const log_id = await logQuery(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    question: question.trim(),
    answer,
    source_filename: best.filename,
    source_category: best.category,
    score: best.hybrid,
    search_mode: hasVectorResults ? "hybrid" : "keyword",
    was_answered: wasAnswered,
  });

  return NextResponse.json({
    answer,
    source: best.filename,
    category: best.category,
    score: best.hybrid,
    searchMode: hasVectorResults ? "hybrid" : "keyword",
    log_id,
  });
}
