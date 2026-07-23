-- 관리자 모드용 쿼리 로그 테이블
-- Supabase SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS query_logs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  question    TEXT        NOT NULL,
  answer      TEXT,
  source_filename  TEXT,
  source_category  TEXT,
  score       REAL,
  search_mode TEXT,          -- 'hybrid' | 'keyword' | null
  was_answered BOOLEAN   DEFAULT true,
  feedback    SMALLINT,      -- 1=좋아요, -1=별로예요, null=미응답
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_logs_created_at   ON query_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_was_answered ON query_logs (was_answered);
CREATE INDEX IF NOT EXISTS idx_query_logs_feedback     ON query_logs (feedback);

-- RLS 설정: 정책을 만들지 않고 RLS만 켠다.
-- 정책이 없으면 anon/authenticated 롤은 기본적으로 전부 접근 거부되고,
-- 서버(API 라우트)에서 쓰는 service_role 키만 RLS를 우회해 접근할 수 있다.
-- 절대 "anon_all" 류의 USING (true) 정책을 추가하지 말 것 —
-- 이 테이블에는 직원 질문/답변 원문이 그대로 쌓이므로, anon key가 노출되는 순간
-- 전체 대화 로그가 공개된다.
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;
