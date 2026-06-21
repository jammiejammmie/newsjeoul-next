-- 뉴스저울 v2: 침묵 추적 테이블
-- Supabase Dashboard > SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS story_coverage_log (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id     uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  measured_at  timestamptz DEFAULT now() NOT NULL,
  outlet_count integer NOT NULL,
  total_outlets integer NOT NULL,
  label        text NOT NULL CHECK (label IN ('T0', 'T24', 'T7D')),
  verdict      text CHECK (verdict IN ('실제침묵', '지연보도', '부분반응')),
  UNIQUE (story_id, label)
);

CREATE INDEX IF NOT EXISTS idx_scl_story_id  ON story_coverage_log(story_id);
CREATE INDEX IF NOT EXISTS idx_scl_label_ts  ON story_coverage_log(label, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_scl_verdict   ON story_coverage_log(verdict) WHERE verdict IS NOT NULL;

ALTER TABLE story_coverage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read"    ON story_coverage_log FOR SELECT USING (true);
CREATE POLICY "service write" ON story_coverage_log FOR ALL
  USING (auth.role() = 'service_role');
