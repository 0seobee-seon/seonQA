import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const STOPWORDS = new Set([
  "찾아줘", "알려줘", "알려", "어떻게", "무엇", "뭐", "해줘", "해주세요",
  "방법", "절차", "있나요", "인가요", "입니까", "알고싶어", "궁금", "뭔가요",
  "어디", "언제", "누가", "왜", "어느", "입니다", "입니까", "하나요",
]);

function normalize(text: string) {
  return text.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
}

function tokenize(question: string): string[] {
  return (question.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
    (t) => !STOPWORDS.has(t)
  );
}

function scoreDoc(tokens: string[], filename: string, content: string): number {
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

  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, filename, category, content");

  if (error || !docs || docs.length === 0) {
    return NextResponse.json({ answer: null, error: error?.message });
  }

  const scored = docs
    .map((doc) => ({
      ...doc,
      score: scoreDoc(tokens, doc.filename, doc.content || ""),
    }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const best = scored[0];
  const snippet = extractSnippet(tokens, best.content || "");

  return NextResponse.json({
    answer: snippet,
    source: best.filename,
    category: best.category,
    score: best.score,
  });
}
