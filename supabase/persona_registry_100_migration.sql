-- 뉴스저울 100명 Editorial Persona Registry — 스키마 확장
-- 근거: PM 지시(2026-07-17, "100명 Editorial Persona Registry 실제 구현"), DEC-003(기존 Persona Registry 결정)의 확장
-- 재실행해도 안전(IF NOT EXISTS) — 순수 추가(additive), 기존 14명 데이터/컬럼 영향 없음

ALTER TABLE editors ADD COLUMN IF NOT EXISTS specialty text;                          -- 전문 분야(한 줄, perspective_tag보다 구체적)
ALTER TABLE editors ADD COLUMN IF NOT EXISTS preferred_event_types text[] NOT NULL DEFAULT '{}'; -- 선호 Event Type(event_type_rules.event_type 값)
ALTER TABLE editors ADD COLUMN IF NOT EXISTS axis_preferences jsonb NOT NULL DEFAULT '{}';       -- 중요하게 보는 Axis와 가중치, 예: {"비교":0.3,"역사":0.2}
ALTER TABLE editors ADD COLUMN IF NOT EXISTS banned_expressions text[] NOT NULL DEFAULT '{}';    -- 이 에디터가 절대 쓰지 않는 저품질 표현
ALTER TABLE editors ADD COLUMN IF NOT EXISTS avatar_emoji text;                        -- 화면 표시용 시각 식별자(실사 이미지 대신 아이콘 — 브랜드 원칙상 실사 인물 이미지 생성 금지)
ALTER TABLE editors ADD COLUMN IF NOT EXISTS assignment_count integer NOT NULL DEFAULT 0;        -- 누적 배정 횟수(Admin 과다배정 경고용)
ALTER TABLE editors ADD COLUMN IF NOT EXISTS content_missions text[] NOT NULL DEFAULT '{}';       -- 이 에디터가 책임지는 콘텐츠 유형(Content Routing Gate의 8종 라우트 값 + FAQ/비교분석 등 세부 산출물 라벨)

CREATE INDEX IF NOT EXISTS idx_editors_preferred_event_types ON editors USING GIN(preferred_event_types);
CREATE INDEX IF NOT EXISTS idx_editors_content_missions ON editors USING GIN(content_missions);
