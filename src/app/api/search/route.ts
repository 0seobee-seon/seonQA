import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const STOPWORDS = new Set([
  "찾아줘", "알려줘", "알려", "어떻게", "무엇", "뭐", "해줘", "해주세요",
  "방법", "절차", "있나요", "인가요", "입니까", "알고싶어", "궁금", "뭔가요",
  "어디", "언제", "누가", "왜", "어느", "입니다", "입니까", "하나요",
]);

// 하이브리드 점수 가중치
const KEYWORD_WEIGHT = 0.4;
const VECTOR_WEIGHT = 0.6;
// 키워드 점수 정규화 기준 (이 이상은 최대값으로 클리핑)
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

  // 키워드 검색용 전체 문서 조회
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, category, content");

  if (error || !docs || docs.length === 0) {
    return NextResponse.json({ answer: null, error: error?.message });
  }

  // --- 벡터 검색 (Google AI API 키가 있는 경우만) ---
  const vectorScoreMap = new Map<string, number>(); // id → similarity

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
      // 벡터 검색 실패 시 키워드 검색으로 fallback
      console.warn("Vector search failed, falling back to keyword only:", e);
    }
  }

  const hasVectorResults = vectorScoreMap.size > 0;

  // --- 하이브리드 점수 계산 ---
  const scored = docs
    .map((doc) => {
      const kScore = keywordScore(tokens, doc.filename, doc.content || "");
      const vScore = vectorScoreMap.get(doc.id) ?? 0;

      let hybrid: number;
      if (hasVectorResults) {
        // 키워드 점수 0~1 정규화 후 가중 합산
        const kNorm = Math.min(kScore, KEYWORD_SCORE_CAP) / KEYWORD_SCORE_CAP;
        hybrid = kNorm * KEYWORD_WEIGHT + vScore * VECTOR_WEIGHT;
      } else {
        // 벡터 없으면 키워드 점수만 사용
        hybrid = kScore;
      }

      return { ...doc, kScore, vScore, hybrid };
    })
    .filter((d) => d.hybrid > 0)
    .sort((a, b) => b.hybrid - a.hybrid);

  if (scored.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const best = scored[0];
  const snippet = extractSnippet(tokens, best.content || "");

  return NextResponse.json({
    answer: snippet,
    source: best.filename,
    category: best.category,
    score: best.hybrid,
    searchMode: hasVectorResults ? "hybrid" : "keyword",
  });
}
