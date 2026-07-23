import { normalize } from "./searchUtils";

// stats에서 확인되는 "자주 나오는 질문" 반복 호출에 대해 Gemini 임베딩 + Groq 완성 호출을
// 매번 다시 하지 않도록 짧은 TTL로 캐싱한다. rateLimit.ts와 같은 이유로 인스턴스 로컬
// in-memory 캐시다 — 서버리스 인스턴스마다 따로 유지되고 콜드스타트 시 초기화된다.
// 문서가 수정/추가되면(admin/docs, admin/qa, admin/upload*) 다른 인스턴스의 캐시까지
// 지우진 못하므로, 정합성은 최대 TTL 시간만큼만 보장된다.

type CachedAnswer = {
  source: string;
  category: string;
  score: number;
  searchMode: "hybrid" | "keyword";
  wasAnswered: boolean;
  answer: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, CachedAnswer>();

function cacheKey(question: string): string {
  return normalize(question.trim());
}

export function getCachedAnswer(question: string): CachedAnswer | null {
  const key = cacheKey(question);
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  return hit;
}

export function setCachedAnswer(question: string, value: Omit<CachedAnswer, "expiresAt">): void {
  const key = cacheKey(question);
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { ...value, expiresAt: Date.now() + CACHE_TTL_MS });
}
