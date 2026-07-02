"""
Phase 3: 청킹(Chunking) 스크립트
extracted/_all_documents.json 을 읽어 청크 단위로 분할 후 저장
"""

import json, re
from pathlib import Path

INPUT_FILE  = Path(r"C:\Users\LG\Desktop\AX 코드 학습\챗봇데이터\extracted\_all_documents.json")
OUTPUT_FILE = Path(r"C:\Users\LG\Desktop\AX 코드 학습\챗봇데이터\extracted\_all_chunks.json")

# ── 청킹 설정 ─────────────────────────────────────────────────────
CHUNK_SIZE    = 600   # 목표 글자 수 (한글 1자 ≈ 1.5 토큰)
CHUNK_OVERLAP = 100   # 앞 청크와 겹치는 글자 수


# ── 카테고리별 분할 기준 ──────────────────────────────────────────

def split_by_article(text: str) -> list[str]:
    """규정/정책: '제X조' 단위로 분할"""
    parts = re.split(r"(?=제\s*\d+\s*조)", text)
    return [p.strip() for p in parts if p.strip()]


def split_by_section(text: str) -> list[str]:
    """업무매뉴얼: 숫자 목차(1. 2. 3.) 또는 슬라이드 단위로 분할"""
    parts = re.split(r"(?=(?:\[슬라이드\s*\d+\]|\n\d+\.\s))", text)
    return [p.strip() for p in parts if p.strip()]


def split_by_row(text: str) -> list[str]:
    """조직/연락처: 줄 단위 분할 (1행 = 1청크)"""
    return [line.strip() for line in text.splitlines() if line.strip()]


def split_by_size(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """기본: 글자 수 기준 슬라이딩 윈도우"""
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = end - overlap
    return chunks


SPLIT_STRATEGY = {
    "규정정책":   split_by_article,
    "업무매뉴얼": split_by_section,
    "조직연락처": split_by_row,
    "사내양식":   split_by_size,
    "기타":       split_by_size,
}


# ── 메인 처리 ─────────────────────────────────────────────────────

with open(INPUT_FILE, encoding="utf-8") as f:
    docs = json.load(f)

all_chunks = []
stats = {}

for doc in docs:
    category = doc["category"]
    splitter = SPLIT_STRATEGY.get(category, split_by_size)
    raw_chunks = splitter(doc["content"])

    # 너무 짧은 조각은 다음 청크에 병합
    merged = []
    buf = ""
    for chunk in raw_chunks:
        buf = (buf + "\n" + chunk).strip() if buf else chunk
        if len(buf) >= CHUNK_SIZE // 2:  # 최소 300자 이상이면 확정
            merged.append(buf)
            buf = ""
    if buf:  # 마지막 잔여분
        if merged:
            merged[-1] += "\n" + buf  # 앞 청크에 붙임
        else:
            merged.append(buf)

    # 청크가 여전히 CHUNK_SIZE 초과면 재분할
    final_chunks = []
    for chunk in merged:
        if len(chunk) > CHUNK_SIZE * 2:
            final_chunks.extend(split_by_size(chunk))
        else:
            final_chunks.append(chunk)

    for i, chunk_text in enumerate(final_chunks):
        chunk_id = f"{category}_{doc['title'][:20]}_{i:03d}"
        chunk_id = re.sub(r"[^가-힣a-zA-Z0-9_]", "_", chunk_id)
        all_chunks.append({
            "chunk_id":    chunk_id,
            "title":       doc["title"],
            "category":    category,
            "source_file": doc["source_file"],
            "chunk_index": i,
            "total_chunks": len(final_chunks),
            "content":     chunk_text,
        })

    stats[category] = stats.get(category, 0) + len(final_chunks)

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(all_chunks, f, ensure_ascii=False, indent=2)

print("청킹 완료")
print(f"총 청크 수: {len(all_chunks)}")
print()
print("카테고리별 청크 수:")
for k, v in sorted(stats.items()):
    print(f"  {k}: {v}개")

# 샘플 출력
print()
print("샘플 청크 (규정정책 첫 번째):")
for c in all_chunks:
    if c["category"] == "규정정책":
        print(f"  chunk_id : {c['chunk_id']}")
        print(f"  글자 수  : {len(c['content'])}")
        print(f"  내용     : {c['content'][:150]}")
        break
