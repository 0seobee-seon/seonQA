const STOPWORDS = new Set([
  "찾아줘", "알려줘", "알려", "어떻게", "무엇", "뭐", "해줘", "해주세요",
  "방법", "절차", "있나요", "인가요", "입니까", "알고싶어", "궁금", "뭔가요",
  "어디", "언제", "누가", "왜", "어느", "입니다", "입니까", "하나요",
]);

export const KEYWORD_WEIGHT = 0.4;
export const VECTOR_WEIGHT = 0.6;
export const KEYWORD_SCORE_CAP = 20;

// 관리자가 미응답 질문에 직접 검증해서 답한 문서는 더 신뢰할 수 있으므로 가산점을 준다
export const DIRECT_ANSWER_CATEGORY = "직접답변";
export const DIRECT_ANSWER_BOOST = 1.15;
// 점수 차이가 이 값보다 작으면 동점으로 보고 최신 문서를 우선한다 (오래된 중복/오류 문서 방지)
export const TIE_SCORE_EPSILON = 0.03;

export function applyCategoryBoost(hybrid: number, category: string | null | undefined): number {
  return category === DIRECT_ANSWER_CATEGORY ? hybrid * DIRECT_ANSWER_BOOST : hybrid;
}

export function compareByHybridThenRecency<T extends { hybrid: number; created_at: string }>(a: T, b: T): number {
  if (Math.abs(b.hybrid - a.hybrid) < TIE_SCORE_EPSILON) {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }
  return b.hybrid - a.hybrid;
}

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
