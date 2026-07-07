-- 뉴스저울: Topic 넓은 맥락(ai_context) 필드 추가
-- 실행 순서: topics_entities_schema.sql + topics_schema_amendments.sql + insights_schema.sql 이후 실행.
-- 상태: 문법은 이전 승인된 마이그레이션과 동일 패턴 -- Supabase SQL Editor에 그대로 붙여넣기 가능.

ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_context jsonb;
