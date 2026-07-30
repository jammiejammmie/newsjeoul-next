-- 뉴스저울 Evolution Engine — 마스터 스펙 v1 Track 2 + Track 3 스키마
-- 근거: 2026-07-30 마스터 스펙 v1, Track 2(자기확장 편집 시스템) + Track 3(댓글 자동응답, 섀도우 모드)
--
-- 실행 방법: Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행.
-- BLOCKED 사유: PostgREST(REST API)는 DML(insert/select/update)만 가능하고 DDL(CREATE TABLE)을
-- 지원하지 않는다. 이 세션에는 Supabase 관리 토큰/DB 커넥션 문자열이 없어(Netlify와 별개 서비스,
-- 로그인 자격 없음) 직접 실행 불가 — CHANGELOG.md BLOCKED 섹션 참고.
-- 이 파일이 실행되면 Track 2/3의 관련 Netlify 함수는 이미 배포돼 있어 다음 주간 cron부터
-- 자동으로 정상 동작한다(코드는 테이블 부재 시에도 에러 없이 조용히 skip하도록 작성돼 있음).

-- ── Track 2: Evolution Engine ──────────────────────────────────────────────

-- 2-2. 갭 감지가 제안한 신규 event_type/페르소나 후보. status='proposed'인 동안은 파이프라인에
-- 전혀 영향 없음 — admin이 승인(status='approved')해야만 event_type_rules에 실제로 반영된다.
CREATE TABLE IF NOT EXISTS proposed_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_name text NOT NULL,
  rationale text NOT NULL,                          -- 왜 이 카테고리가 필요한지(패턴 설명)
  suggested_perspective_candidates text[] NOT NULL DEFAULT '{}',
  suggested_axis_weights jsonb,                      -- AI가 제안한 axis_weights(event_type_rules와 동일 형식)
  sample_article_titles text[] NOT NULL DEFAULT '{}', -- 근거로 삼은 실제 기사 제목 샘플
  detected_article_count integer NOT NULL DEFAULT 0,  -- 이 패턴에 해당하는 것으로 추정되는 기사 수(최근 N일)
  status text NOT NULL DEFAULT 'proposed',            -- proposed | approved | rejected
  detected_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_proposed_event_types_status ON proposed_event_types (status);

-- 2-3. 주간 자기 감시 리포트 — 카테고리 분포 + 에디터 활용률 스냅샷.
CREATE TABLE IF NOT EXISTS weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_week_start date NOT NULL,                    -- 리포트 대상 기간 시작(월요일)
  category_distribution jsonb NOT NULL,               -- {"Society": 40, "Economy": 13, ...}
  editor_utilization jsonb NOT NULL,                  -- {"perspective_tag": {"assigned_this_week": N, "total": M}, ...}
  zero_assignment_perspectives text[] NOT NULL DEFAULT '{}', -- 이번 주 0회 배정된 perspective_tag 목록
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_week ON weekly_reports (report_week_start DESC);

-- ── Track 3: 커뮤니티 소통 레이어(댓글 자동응답, 섀도우 모드) ────────────────

-- 3-2. 섀도우 모드 로그 — 실제로 게시하지 않고 "이렇게 답했을 것"만 기록.
-- is_live=false로 시작(하드 기본값). true로 바뀌는 건 admin 화면의 수동 토글 하나뿐이고,
-- 이 마이그레이션이나 어떤 자동화 코드도 이 값을 true로 바꾸지 않는다.
CREATE TABLE IF NOT EXISTS comment_auto_reply_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_post_id text NOT NULL,               -- 원 게시물 Threads post id
  comment_id text NOT NULL,                   -- 댓글(reply) Threads id
  comment_text text NOT NULL,
  commenter_username text,
  classification text NOT NULL,               -- auto_reply_eligible | needs_human_review | excluded
  exclusion_reason text,                      -- 정치적_논쟁성 | 욕설_혐오 | 개인정보_요구 | 애매함 | null
  generated_reply_text text,                  -- classification=auto_reply_eligible일 때만 채워짐
  was_posted boolean NOT NULL DEFAULT false,  -- 실제 게시 여부(섀도우 모드에선 항상 false)
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comment_auto_reply_log_classification ON comment_auto_reply_log (classification);
CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_auto_reply_log_comment_id ON comment_auto_reply_log (comment_id);

-- 3-3. 라이브 전환 스위치 — 단일 행, admin 화면의 토글 하나가 이 값만 바꾼다.
-- 기본값 false(섀도우 모드) — 이 마이그레이션은 절대 true를 넣지 않는다.
CREATE TABLE IF NOT EXISTS comment_auto_reply_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),  -- 단일 행 강제(항상 id=true 하나만 존재)
  is_live boolean NOT NULL DEFAULT false,
  max_replies_per_hour integer NOT NULL DEFAULT 20,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO comment_auto_reply_settings (id, is_live) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

-- RLS: 이 리포지토리의 기존 테이블들과 동일하게, anon 키로 admin 페이지가 직접 SELECT하고
-- 쓰기는 SERVICE_KEY(서버) 경로로만 이뤄지는 패턴을 따른다. 기존 정책 이름 규칙을 모르므로
-- 최소한의 안전한 기본값(anon SELECT 허용, anon INSERT/UPDATE/DELETE 차단)만 명시한다 —
-- 실제 적용 시 기존 프로젝트의 RLS 정책 네이밍/구조에 맞춰 조정 필요.
ALTER TABLE proposed_event_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_auto_reply_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_auto_reply_settings ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY는 IF NOT EXISTS를 지원하지 않아(CREATE TABLE/INDEX와 다름) DROP 후 재생성하는
-- 방식으로 재실행해도 안전하게 만든다.
DROP POLICY IF EXISTS anon_select ON proposed_event_types;
CREATE POLICY anon_select ON proposed_event_types FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_select ON weekly_reports;
CREATE POLICY anon_select ON weekly_reports FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_select ON comment_auto_reply_log;
CREATE POLICY anon_select ON comment_auto_reply_log FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_select ON comment_auto_reply_settings;
CREATE POLICY anon_select ON comment_auto_reply_settings FOR SELECT USING (true);
