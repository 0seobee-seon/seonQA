-- 1. pgvector 확장 활성화
create extension if not exists vector;

-- 2. documents 테이블에 embedding 컬럼 추가 (Google text-embedding-004: 768차원)
alter table documents add column if not exists embedding vector(768);

-- 3. 코사인 유사도 검색 함수 생성
-- match_threshold 기본값(0.3)은 함수를 직접 호출할 때의 기본값일 뿐이다.
-- 실제 서비스 호출부(src/app/api/search/route.ts)는 0.2로 넘겨 후보를 더 넉넉히 받고,
-- 최종 채택 여부는 이후 hybrid 스코어링에서 결정한다 — 두 값이 다른 것은 의도된 것.
create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float default 0.3,
  match_count int default 5
)
returns table (
  id uuid,
  filename text,
  category text,
  content text,
  similarity float
)
language sql stable
as $$
  select
    documents.id,
    documents.filename,
    documents.category,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.embedding is not null
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
$$;

-- 4. 벡터 인덱스 생성 (문서 수 증가 시 검색 속도 개선)
create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);
