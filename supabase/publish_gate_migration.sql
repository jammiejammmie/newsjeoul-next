-- 뉴스저울 Publish Gate — DB 마이그레이션
-- 근거: docs/newsjeoul-publish-gate-design.md §6, DEC-006
-- 재실행해도 안전(IF NOT EXISTS) — 순수 추가(additive), 기존 컬럼/데이터 영향 없음

ALTER TABLE topics ADD COLUMN IF NOT EXISTS gate_status text NOT NULL DEFAULT 'pending_gate';

CREATE INDEX IF NOT EXISTS idx_topics_gate_status ON topics(gate_status);

-- gate_status 허용값: pending_gate | publish_long | publish_short | hold | reject
-- (CHECK 제약은 걸지 않음 — 기존 editorial_status 컬럼도 동일하게 애플리케이션 레벨에서만 값을 통제하는 관례를 따름)

-- 새 컬럼은 RLS가 테이블 단위라 topics 테이블 자체 정책을 그대로 상속받는다.
-- 혹시 "쓰기는 되는데 anon key로 안 보임" 증상이 있으면 아래를 재실행할 것(재실행 안전):
-- \i global_rls_policy.sql
