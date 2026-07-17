-- 뉴스저울 Scheduler/Worker 분리 — Cron 안전장치 테이블
-- 근거: PM 지시(2026-07-17, "Cron 근본원인 수정 Phase 2 — Scheduler/Worker 분리").
-- x-nf-event 헤더는 위조 가능해 외부에서 Scheduler를 호출할 수 있으므로, Scheduler 자체가
-- 위조 호출을 당해도 피해가 없도록 잠금(중복 실행 방지)과 최소 실행 간격(빈도 제한)을 DB에 둔다.
-- 재실행해도 안전(IF NOT EXISTS) — 신규 테이블 2개, 기존 테이블 영향 없음.

CREATE TABLE IF NOT EXISTS cron_locks (
  stage text PRIMARY KEY,             -- 예: 'collect-news', 'process-stories' 등 워커 이름
  running boolean NOT NULL DEFAULT false,
  started_at timestamptz,             -- 현재(또는 마지막) 실행 시작 시각
  last_success_at timestamptz,        -- 마지막 성공 완료 시각(최소 실행 간격 판단 기준)
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 감사 로그 — 정상/비정상(중복·과빈도·위조 의심) 호출을 전부 기록해 나중에 추적 가능하게 한다.
CREATE TABLE IF NOT EXISTS cron_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage text NOT NULL,
  invoked_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,                -- 'schedule' | 'manual' | 'unknown'
  outcome text NOT NULL,                -- 'dispatched' | 'skipped_locked' | 'skipped_too_soon' | 'worker_error'
  detail text
);

CREATE INDEX IF NOT EXISTS idx_cron_invocations_stage_time ON cron_invocations(stage, invoked_at DESC);
