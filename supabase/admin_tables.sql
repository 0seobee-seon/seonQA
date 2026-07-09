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

-- RLS 설정 (anon key 허용)
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all" ON query_logs
  FOR ALL USING (true) WITH CHECK (true);
