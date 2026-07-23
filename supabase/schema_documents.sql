-- documents 테이블 실제 스키마 백업 (Supabase 대시보드에서 수동 생성되어
-- 저장소에 기록이 없던 것을, 2026-07-23 기준 라이브 DB에서 그대로 옮겨온 것.
-- 이미 존재하는 테이블이므로 실행 목적이 아니라 참고/재현용 문서다.

CREATE TABLE IF NOT EXISTS documents (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  filename    TEXT        NOT NULL,
  category    TEXT,
  content     TEXT,
  -- 초기 Python 배치 업로드(scripts/upload_to_supabase.py) 시절 원본 파일 경로를 남기던 컬럼.
  -- 현재 API 라우트(admin/upload*, admin/qa, admin/docs)는 이 컬럼을 읽거나 쓰지 않는다.
  source_path TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  embedding   VECTOR(768) -- migration_vector.sql 참고
);

-- RLS: 정책 없이 켜져 있음 → anon/authenticated 전부 접근 거부,
-- 서버의 service_role 키(supabaseAdmin.ts)만 우회 접근 가능.
-- query_logs와 동일한 원칙 — USING (true) 류의 공개 정책을 추가하지 말 것.
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 참고: public.faqs 테이블도 라이브 DB에 존재하지만(RLS 켜짐, 정책 없음, row 0개)
-- 현재 코드베이스 어디에서도 참조하지 않는다. src/app/data/faq.ts는 이름만 비슷한
-- 별개의 클라이언트 정적 데이터 파일이며 이 테이블과 무관하다.
-- 실제로 쓰지 않을 계획이면 삭제 후보로 남겨둔다 (삭제는 별도 확인 후 진행).
