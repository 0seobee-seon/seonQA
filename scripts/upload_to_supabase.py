"""
Phase 4: Supabase 업로드 스크립트
chunks JSON → Gemini 임베딩 생성 → Supabase documents 테이블 삽입

사전 준비:
  1. .env 파일에 값 입력 (SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY)
  2. pip install supabase python-dotenv

임베딩 모델: gemini-embedding-001 (REST API, 768차원) — seonQA와 동일
"""

import json, os, time, urllib.request
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL  = os.environ["SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_KEY"]
GEMINI_KEY    = os.environ["GEMINI_API_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

CHUNKS_FILE = Path(__file__).parent / "extracted" / "_all_chunks.json"
TABLE_NAME  = "documents"


def get_embedding(text: str) -> list:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-embedding-001:embedContent?key={GEMINI_KEY}"
    )
    body = json.dumps({
        "model": "models/gemini-embedding-001",
        "content": {"parts": [{"text": text[:8000]}]},
        "outputDimensionality": 768,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        data = json.loads(res.read())
    if "embedding" not in data:
        raise ValueError(f"임베딩 오류: {data}")
    return data["embedding"]["values"]


def get_uploaded_ids() -> set:
    res = supabase.table(TABLE_NAME).select("filename").execute()
    return {row["filename"] for row in res.data}


with open(CHUNKS_FILE, encoding="utf-8") as f:
    chunks = json.load(f)

print(f"총 청크 수: {len(chunks)}")
uploaded_ids = get_uploaded_ids()
print(f"이미 업로드된 항목 수: {len(uploaded_ids)}")

pending = [c for c in chunks if c["chunk_id"] not in uploaded_ids]
print(f"업로드할 청크 수: {len(pending)}\n")

success = 0
fail = 0

for i, chunk in enumerate(pending):
    try:
        embedding = get_embedding(chunk["content"])

        supabase.table(TABLE_NAME).insert({
            "filename":  chunk["chunk_id"],
            "category":  chunk["category"],
            "content":   chunk["content"],
            "embedding": embedding,
        }).execute()

        success += 1
        if success % 10 == 0 or success == 1:
            print(f"[{success}/{len(pending)}] 진행 중... ({chunk['title'][:30]})")

        time.sleep(0.1)

    except Exception as e:
        fail += 1
        err_msg = str(e)
        print(f"  [오류] {chunk['chunk_id']}: {err_msg}")
        if "429" in err_msg:
            print("  [속도제한] 60초 대기...")
            time.sleep(60)
        else:
            time.sleep(2)

    if (i + 1) % 20 == 0:
        time.sleep(1)

print(f"\n완료 - 성공: {success} / 실패: {fail}")
