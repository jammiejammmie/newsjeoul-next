-- 뉴스저울 3.0: Insight / AI 분석 필드 추가
-- 실행 순서: topics_entities_schema.sql + topics_schema_amendments.sql 이후 실행.
-- 상태: 초안 -- Supabase 실행 전 검토용

CREATE TABLE IF NOT EXISTS daily_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  insight_text text NOT NULL,
  topic_ids uuid[] DEFAULT '{}',
  entity_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_insights_created ON daily_insights (created_at DESC);

ALTER TABLE daily_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read" ON daily_insights FOR SELECT USING (true);
CREATE POLICY "service write" ON daily_insights FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_outlook text;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS ai_counter_view text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS ai_analysis text;
