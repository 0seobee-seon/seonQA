const STOPWORDS = new Set([
  "찾아줘", "알려줘", "알려", "어떻게", "무엇", "뭐", "해줘", "해주세요",
  "방법", "절차", "있나요", "인가요", "입니까", "알고싶어", "궁금", "뭔가요",
  "어디", "언제", "누가", "왜", "어느", "입니다", "입니까", "하나요",
]);

export const KEYWORD_WEIGHT = 0.4;
export const VECTOR_WEIGHT = 0.6;
export const KEYWORD_SCORE_CAP = 20;

export function normalize(text: string): string {
  return text.replace(/([가-힣])\s+(?=[가-힣])/g, "$1");
}

export function tokenize(question: string): string[] {
  return (question.match(/[가-힣a-zA-Z0-9]{2,}/g) || []).filter(
    (t) => !STOPWORDS.has(t)
  );
}

export function keywordScore(tokens: string[], filename: string, content: string): number {
  const norm = normalize(content);
  const normFilename = normalize(filename);
  let score = 0;
  for (const t of tokens) {
    if (normFilename.includes(t)) score += 5;
    if (norm.includes(t)) score += 2;
  }
  return score;
}

export function extractSnippet(tokens: string[], content: string): string {
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
