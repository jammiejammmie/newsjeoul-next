-- 뉴스저울 Threads 자동 게시 운영 기록 확장
-- 근거: PM 지시(2026-07-17, "Threads 자동 게시 장애 정정 및 복구" — 게시 건마다 Topic ID/
-- Draft ID/Threads Post ID/게시 시각/Hook 유형/사용 Persona/게시 상태/실패 사유/재시도 횟수/
-- 원문 링크를 기록할 것).
-- 재실행해도 안전(IF NOT EXISTS) — 순수 추가(additive), 기존 threads_posts 데이터 영향 없음.

ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS topic_id uuid;              -- 신규 후보 선정 기준(Topic 우선)
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS hook_type text;             -- 대비/의외성/질문/정보격차 중 하나
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS editors text[] NOT NULL DEFAULT '{}'; -- 해당 Topic 담당 에디터 이름
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success'; -- success/skipped/failed
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS failure_reason text;        -- status=failed일 때 원인
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS source_url text;           -- 실제 게시에 사용한 뉴스저울 링크(UTM 포함)

-- 2026-07-22 추가(PM 지시 "Threads 운영 로그 강화" — Distribution Engine 튜닝을 위해 게시마다
-- 점수 근거를 함께 남길 것). post-threads-background.js의 savePostLog()가 이미 이 두 필드를
-- 보내고 있었으나(컬럼이 없어 그동안 무시됨) 이제 실제로 저장된다.
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS distribution_score numeric;
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS editorial_score numeric;

-- 2026-07-22 추가(PM 지시 "CTA 전면 개편" — "뉴스저울에서 확인하세요" 같은 반복 문구 대신 106개
-- 유도 문구 중 랜덤으로 고른다. 어떤 문구가 실제로 클릭을 유도했는지 나중에 분석·자동 최적화할
-- 수 있도록 문구 id를 함께 저장한다).
ALTER TABLE threads_posts ADD COLUMN IF NOT EXISTS cta_phrase_id text;

CREATE INDEX IF NOT EXISTS idx_threads_posts_topic_id ON threads_posts(topic_id);
