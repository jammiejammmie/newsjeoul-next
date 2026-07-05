-- 뉴스저울 2.0: Topic/Entity 지식그래프 레이어
-- 상태: 초안 — Supabase 실행 전 검토용
-- 기존 stories / articles / story_articles 는 변경하지 않고 FK로 참조만 한다.

-- 1. topics
CREATE TABLE IF NOT EXISTS topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  summary text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'dormant', 'closed')),
  lifecycle_stage text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_stage IN ('emerging', 'active', 'cooling', 'archived')),
  source_type text NOT NULL DEFAULT 'ai'
    CHECK (source_type IN ('system', 'ai', 'manual')),
  importance_score integer NOT NULL DEFAULT 50,
  popularity_score integer NOT NULL DEFAULT 50,
  category text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  last_checked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
CREATE INDEX IF NOT EXISTS idx_topics_lifecycle_stage ON topics(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_topics_source_type ON topics(source_type);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category);

-- 2. entities
CREATE TABLE IF NOT EXISTS entities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'company', 'person', 'organization', 'country',
    'product', 'technology', 'market', 'policy'
  )),
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);

-- 3. entity_aliases
CREATE TABLE IF NOT EXISTS entity_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alias text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_aliases_alias_norm
  ON entity_aliases (lower(alias));

CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity
  ON entity_aliases(entity_id);

-- 4. topic_stories
CREATE TABLE IF NOT EXISTS topic_stories (
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  relevance_score integer NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (topic_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_stories_story
  ON topic_stories(story_id);

-- 5. entity_stories
CREATE TABLE IF NOT EXISTS entity_stories (
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  story_id uuid NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  relevance_score integer NOT NULL DEFAULT 100,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (entity_id, story_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_stories_story
  ON entity_stories(story_id);

-- 6. topic_entities
CREATE TABLE IF NOT EXISTS topic_entities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related',
  explanation text,
  strength_score integer NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (topic_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_entities_topic
  ON topic_entities(topic_id);

CREATE INDEX IF NOT EXISTS idx_topic_entities_entity
  ON topic_entities(entity_id);

-- 7. topic_relations
CREATE TABLE IF NOT EXISTS topic_relations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  target_topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related',
  explanation text,
  strength_score integer NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (source_topic_id <> target_topic_id),
  UNIQUE (source_topic_id, target_topic_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_topic_relations_source
  ON topic_relations(source_topic_id);

CREATE INDEX IF NOT EXISTS idx_topic_relations_target
  ON topic_relations(target_topic_id);

-- 8. entity_relations
CREATE TABLE IF NOT EXISTS entity_relations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'related',
  explanation text,
  strength_score integer NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CHECK (source_entity_id <> target_entity_id),
  UNIQUE (source_entity_id, target_entity_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_entity_relations_source
  ON entity_relations(source_entity_id);

CREATE INDEX IF NOT EXISTS idx_entity_relations_target
  ON entity_relations(target_entity_id);

-- 9. topic_updates
CREATE TABLE IF NOT EXISTS topic_updates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  update_type text NOT NULL CHECK (update_type IN (
    'new_fact', 'rumor', 'confirmed', 'correction', 'timeline', 'followup'
  )),
  title text NOT NULL,
  summary text,
  source_story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topic_updates_topic_created
  ON topic_updates(topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topic_updates_source_story
  ON topic_updates(source_story_id);

-- 10. topic_timeline_events
CREATE TABLE IF NOT EXISTS topic_timeline_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  event_date timestamptz NOT NULL,
  title text NOT NULL,
  summary text,
  source_story_id uuid REFERENCES stories(id) ON DELETE SET NULL,
  importance_score integer NOT NULL DEFAULT 50,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_topic_date
  ON topic_timeline_events(topic_id, event_date);

CREATE INDEX IF NOT EXISTS idx_timeline_events_source_story
  ON topic_timeline_events(source_story_id);

-- RLS
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read" ON topics FOR SELECT USING (true);
CREATE POLICY "anon read" ON entities FOR SELECT USING (true);
CREATE POLICY "anon read" ON entity_aliases FOR SELECT USING (true);
CREATE POLICY "anon read" ON topic_stories FOR SELECT USING (true);
CREATE POLICY "anon read" ON entity_stories FOR SELECT USING (true);
CREATE POLICY "anon read" ON topic_entities FOR SELECT USING (true);
CREATE POLICY "anon read" ON topic_relations FOR SELECT USING (true);
CREATE POLICY "anon read" ON entity_relations FOR SELECT USING (true);
CREATE POLICY "anon read" ON topic_updates FOR SELECT USING (true);
CREATE POLICY "anon read" ON topic_timeline_events FOR SELECT USING (true);

CREATE POLICY "service write" ON topics FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON entities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON entity_aliases FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON topic_stories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON entity_stories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON topic_entities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON topic_relations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON entity_relations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON topic_updates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service write" ON topic_timeline_events FOR ALL USING (auth.role() = 'service_role');
