// scripts/chunk_text.py 의 카테고리별 청킹 로직을 그대로 포팅.
// 어드민 파일 업로드로 들어온 문서도 기존 문서들과 동일한 방식으로 쪼개서
// 검색 품질(키워드/벡터 매칭)이 일관되게 유지되도록 한다.

const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 100;

function splitByArticle(text: string): string[] {
  return text
    .split(/(?=제\s*\d+\s*조)/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitBySection(text: string): string[] {
  return text
    .split(/(?=(?:\[슬라이드\s*\d+\]|\n\d+\.\s))/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitByRow(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function splitBySize(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + size;
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

const SPLIT_STRATEGY: Record<string, (text: string) => string[]> = {
  규정정책: splitByArticle,
  업무매뉴얼: splitBySection,
  조직연락처: splitByRow,
  사내양식: splitBySize,
  기타: splitBySize,
};

export function chunkDocument(content: string, category: string): string[] {
  const splitter = SPLIT_STRATEGY[category] ?? splitBySize;
  const rawChunks = splitter(content);

  // 너무 짧은 조각은 다음 청크에 이어붙여 최소 크기(CHUNK_SIZE/2)를 채운다
  const merged: string[] = [];
  let buf = "";
  for (const chunk of rawChunks) {
    buf = buf ? `${buf}\n${chunk}`.trim() : chunk;
    if (buf.length >= CHUNK_SIZE / 2) {
      merged.push(buf);
      buf = "";
    }
  }
  if (buf) {
    if (merged.length) merged[merged.length - 1] += "\n" + buf;
    else merged.push(buf);
  }

  // 청크가 여전히 너무 크면(CHUNK_SIZE*2 초과) 사이즈 기준으로 재분할
  const final: string[] = [];
  for (const chunk of merged) {
    if (chunk.length > CHUNK_SIZE * 2) {
      final.push(...splitBySize(chunk));
    } else {
      final.push(chunk);
    }
  }

  return final.length ? final : (content.trim() ? [content.trim()] : []);
}
