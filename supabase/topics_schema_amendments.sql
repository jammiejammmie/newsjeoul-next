-- 뉴스저울 2.0: topics_entities_schema.sql 승인본에 대한 추가 migration
-- 승인된 원본 파일(topics_entities_schema.sql)은 건드리지 않는다 -- 여기에만 추가한다.
-- 실행 순서: topics_entities_schema.sql 실행 -> 이 파일 실행.
-- 상태: 문법 재검증 완료 -- Supabase SQL Editor에 그대로 붙여넣기 가능한 최종본.

-- 1. entities: soft-delete 필드 (topics.status와 대칭)
-- CHECK을 ADD COLUMN에 인라인으로 둔다. 별도 ADD CONSTRAINT는 IF NOT EXISTS를
-- 지원하지 않아 재실행 시 에러가 나므로 의도적으로 이 형태를 쓴다.
ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived'));

CREATE INDEX IF NOT EXISTS idx_entities_status ON entities (status);

-- 2. topic_updates: 품질 자동검증 필드 (한 문장에 한 컬럼씩 분리)
ALTER TABLE topic_updates ADD COLUMN IF NOT EXISTS quality_score integer;
ALTER TABLE topic_updates ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_topic_updates_is_published ON topic_updates (is_published);

-- 3. 검색용 tsvector 컬럼 + GIN 인덱스
-- to_tsvector(regconfig, text) 2-argument 형태는 PostgreSQL에서 IMMUTABLE로 분류되어
-- generated column에 사용 가능하다 (PostgreSQL 공식 문서 Generated Columns 예제와 동일 패턴).
-- 1-argument to_tsvector(text)는 세션 설정에 의존해 STABLE이라 generated column에 쓸 수 없다.
-- 한글 형태소 사전이 기본 제공되지 않아 'simple'(단순 토큰화)을 사용한다.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(summary, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_topics_search_vector ON topics USING GIN (search_vector);

ALTER TABLE entities ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_entities_search_vector ON entities USING GIN (search_vector);
