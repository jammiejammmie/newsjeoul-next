-- 뉴스저울 Distribution Engine 운영 로그 3종
-- 근거: PM 지시(2026-07-22, "실제 운영 데이터를 쌓는 단계" — Hero 변경 이력, 게시하지 않은
-- 후보의 탈락 사유·점수, 시간대별 목표/실적 기록을 저장할 것).
--
-- 셋 다 순수 append-only 로그 테이블이라 topics.ai_context(jsonb)에 넣기보다 별도 테이블이
-- 자연스럽다(여러 Topic·여러 시점에 걸친 이벤트이지 특정 Topic 하나에 귀속되는 값이 아님).
-- 재실행해도 안전(CREATE TABLE IF NOT EXISTS) — 기존 데이터에 영향 없음.
--
-- 적용 후 반드시 supabase/global_rls_policy.sql을 다시 실행해서 anon read 정책을 새 테이블에도
-- 적용해야 관리자 대시보드(anon key로 조회)에서 값이 보인다.

-- 1) Hero(대표 기사) 변경 이력 — "언제/어떤 Topic에서/어떤 Topic으로/각각 무게가 얼마였는지"
CREATE TABLE IF NOT EXISTS hero_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  from_topic_id uuid,
  from_topic_name text,
  from_importance_score integer,
  to_topic_id uuid NOT NULL,
  to_topic_name text NOT NULL,
  to_importance_score integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hero_history_changed_at ON hero_history(changed_at DESC);

-- 2) 게시하지 않은 후보 로그 — "왜 게시가 적었는지" 나중에 분석하기 위함(Distribution Engine
-- 튜닝용 데이터). reason: quality_threshold / distribution_threshold / duplicate / no_candidate.
CREATE TABLE IF NOT EXISTS distribution_skip_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  topic_id uuid,
  topic_name text,
  category text,
  editorial_score numeric,
  distribution_score numeric,
  reason text NOT NULL,
  detail jsonb
);
CREATE INDEX IF NOT EXISTS idx_distribution_skip_log_run_at ON distribution_skip_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_distribution_skip_log_reason ON distribution_skip_log(reason);

-- 3) 실행(1시간 주기)마다 목표/실적 기록 — 하루가 끝난 뒤 "Distribution Engine이 제대로
-- 동작했는지" 시간대별로 재구성할 수 있게 한다.
CREATE TABLE IF NOT EXISTS distribution_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  today_article_count integer NOT NULL,
  daily_target integer NOT NULL,
  posted_before_run integer NOT NULL,
  posts_attempted integer NOT NULL,
  posts_succeeded integer NOT NULL,
  posted_after_run integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_distribution_run_log_run_at ON distribution_run_log(run_at DESC);
