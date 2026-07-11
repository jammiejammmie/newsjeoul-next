-- 뉴스저울 Editorial Engine Phase 1 — FIXED 데이터화
-- 근거: docs/newsjeoul-editorial-engine-architecture.md §1, §11, §12(Phase 1)
-- 재실행해도 안전(IF NOT EXISTS / ON CONFLICT DO NOTHING)

CREATE TABLE IF NOT EXISTS event_type_rules (
  event_type text PRIMARY KEY,
  axis_weights jsonb NOT NULL,              -- {"핵심변화":0.35,"비교":0.30,...}
  omittable_axes text[] NOT NULL DEFAULT '{}',
  required_axes text[] NOT NULL DEFAULT '{}',
  perspective_candidates text[] NOT NULL DEFAULT '{}',
  requires_dual_perspective_fixed boolean,   -- NULL이면 AI-JUDGED, true/false면 유형9·10처럼 하드락
  evidence_required text[] NOT NULL DEFAULT '{}',
  target_length_min integer NOT NULL,
  target_length_max integer NOT NULL,
  zeitgeist_excluded boolean NOT NULL DEFAULT false,  -- 유형10(재난)만 true
  common_pitfalls text[] NOT NULL DEFAULT '{}',        -- 흔한 저품질 패턴, 3b QA 체크리스트 재료
  misclassification_risk text,                          -- 유형 오판 시 실패 사례
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_zeitgeist (
  date date PRIMARY KEY,
  tags jsonb NOT NULL DEFAULT '[]',
  generated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS editors (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  perspective_tag text NOT NULL,
  style_signature text,
  rhythm_profile text,
  emphasis_pattern text,
  domains text[] NOT NULL DEFAULT '{}',
  avatar_color text,
  bio text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_editors_perspective_tag ON editors(perspective_tag);
CREATE INDEX IF NOT EXISTS idx_editors_active ON editors(active);

ALTER TABLE topics ADD COLUMN IF NOT EXISTS editorial_status text NOT NULL DEFAULT 'pending';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS editorial_retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_topics_editorial_status ON topics(editorial_status);

-- ============ Editorial OS v1 FIXED 값 입력 (10유형) ============

INSERT INTO event_type_rules (event_type, axis_weights, omittable_axes, required_axes, perspective_candidates, requires_dual_perspective_fixed, evidence_required, target_length_min, target_length_max, zeitgeist_excluded, common_pitfalls, misclassification_risk) VALUES
('신제품·모델출시',
  '{"핵심변화":0.35,"비교":0.30,"지금":0.15,"행위자":0.10,"역사":0.10,"연결":0}',
  ARRAY['연결','역사'], ARRAY['핵심변화','비교'],
  ARRAY['엔지니어','소비자전문','브랜드평론가'], NULL,
  ARRAY['image_hero','spec_data','video_optional','comparison_table','source>=2'],
  1400, 1800, false,
  ARRAY['보도자료 그대로 요약(관점 없음)','스펙 나열만 하고 그래서 어떤가가 없음','이미지 없이 텍스트만'],
  '신제품 출시를 실적 발표로 오판하면 축이 재무 위주로 쏠려 정작 제품 자체 설명이 실종됨'
),
('M&A·투자',
  '{"핵심변화":0,"비교":0.05,"지금":0.20,"행위자":0.30,"역사":0.15,"연결":0.30}',
  ARRAY['핵심변화','비교'], ARRAY['행위자','연결'],
  ARRAY['투자분석가','브랜드평론가','조직전문가'], NULL,
  ARRAY['deal_size_data','equity_diagram','source>=3','person_photo'],
  1600, 2200, false,
  ARRAY['거래액만 강조하고 왜 중요한지 누락','한쪽 입장만 서술'],
  'M&A를 신제품 출시로 오판하면 스펙/비교 축이 앞서 거래의 전략적 의미가 안 보임'
),
('규제·정책',
  '{"핵심변화":0,"비교":0.10,"지금":0.30,"행위자":0.20,"역사":0.20,"연결":0.20}',
  ARRAY['핵심변화','비교'], ARRAY['지금','연결'],
  ARRAY['정책분석가','이해당사자','소비자전문'], NULL,
  ARRAY['legal_text_quote','timeline','stakeholder_comment','comparison_table'],
  1500, 2000, false,
  ARRAY['법조문을 그대로 인용만 하고 해석 없음'],
  '규제를 분쟁으로 오판하면 대립 관점이 과도하게 증폭돼 절차적 사안이 논쟁처럼 보임'
),
('오픈소스·기술공개',
  '{"핵심변화":0.25,"비교":0.10,"지금":0.20,"행위자":0.10,"역사":0,"연결":0.35}',
  ARRAY['역사','비교'], ARRAY['연결'],
  ARRAY['기술덕후','투자분석가','법률전문'], NULL,
  ARRAY['tech_diagram','community_reaction_quote','source','connection_graph'],
  1300, 1700, false,
  ARRAY['기술 스펙만 나열하고 생태계 파급을 다루지 않음'],
  '오픈소스 공개를 신제품 출시로 오판하면 가격/구매 축이 억지로 들어가 어색해짐'
),
('선언·전망·논쟁',
  '{"핵심변화":0,"비교":0.25,"지금":0.15,"행위자":0.25,"역사":0.10,"연결":0.25}',
  ARRAY['핵심변화'], ARRAY['비교'],
  ARRAY['투자분석가','역사연구자'], true,
  ARRAY['quote_full','counter_quote','historical_precedent'],
  1400, 1900, false,
  ARRAY['주장을 사실처럼 단정적으로 서술','반대 근거 생략','발언자 배경 설명 누락'],
  '선언을 신제품 출시로 오판하면 검증 안 된 주장이 확정 사실처럼 스펙 취급됨 — 가장 위험한 오판'
),
('보안사고·장애',
  '{"핵심변화":0,"비교":0,"지금":0.45,"행위자":0.20,"역사":0.10,"연결":0.25}',
  ARRAY['비교','핵심변화'], ARRAY['지금'],
  ARRAY['소비자전문','보안전문가','법률전문'], NULL,
  ARRAY['incident_timeline_minute','official_statement','damage_scope_data','response_guide'],
  800, 1300, false,
  ARRAY['확정 안 된 피해 규모를 단정적으로 서술','대응 방법 정보 누락'],
  '보안사고를 규제로 오판하면 긴급성이 사라지고 절차적 문서처럼 늘어져 독자가 즉시 정보를 놓침'
),
('실적·시장변화',
  '{"핵심변화":0,"비교":0.25,"지금":0.35,"행위자":0.05,"역사":0.15,"연결":0.20}',
  ARRAY['핵심변화','행위자'], ARRAY['지금','비교'],
  ARRAY['투자분석가','소비자전문'], NULL,
  ARRAY['sparkline_chart','yoy_comparison_table','analyst_quote','source'],
  1200, 1600, false,
  ARRAY['숫자만 나열하고 해석 없음'],
  '실적을 선언으로 오판하면 확정된 숫자에 불필요한 대립 관점이 붙어 과장된 논쟁처럼 보임'
),
('인물교체·조직변화',
  '{"핵심변화":0,"비교":0,"지금":0.20,"행위자":0.45,"역사":0.20,"연결":0.15}',
  ARRAY['비교','핵심변화'], ARRAY['행위자'],
  ARRAY['조직전문가','브랜드평론가'], NULL,
  ARRAY['person_photo','career_timeline','predecessor_comparison','inaugural_quote'],
  1300, 1700, false,
  ARRAY['이력만 나열하고 왜 지금 이 사람인가 맥락 누락'],
  '인물교체를 M&A로 오판하면 거래 구조 축이 억지로 들어가 인물 자체 설명이 부족해짐'
),
('분쟁·외교·전쟁',
  '{"핵심변화":0,"비교":0,"지금":0.30,"행위자":0.20,"역사":0.25,"연결":0.25}',
  ARRAY['비교','핵심변화'], ARRAY['지금','역사'],
  ARRAY['국제정치분석가','경제파급분석가'], true,
  ARRAY['map_visualization','timeline','official_statement_both_sides','economic_indicator'],
  1700, 2300, false,
  ARRAY['한쪽 입장만 서술','배경 생략한 채 오늘 사건만 단독 보도','선정적 어휘 사용'],
  '분쟁을 규제로 오판하면 양측 입장 병치가 빠져 심각한 편향 리스크 발생 — 가장 치명적인 오판'
),
('재난·긴급상황',
  '{"핵심변화":0,"비교":0,"지금":0.55,"행위자":0.15,"역사":0.05,"연결":0.25}',
  ARRAY['비교','핵심변화','역사'], ARRAY['지금'],
  ARRAY['안전정보전문가'], false,
  ARRAY['realtime_timeline_minute','map_damage_scope','official_response','action_guide'],
  600, 1000, true,
  ARRAY['미확인 정보를 단정적으로 서술','자극적 어휘','행동요령 누락','과도한 배경 설명으로 속보성 훼손'],
  '재난을 분쟁으로 오판하면 양측 입장을 찾으려다 골든타임 정보 전달이 지연됨 — 가장 위험한 오판'
)
ON CONFLICT (event_type) DO NOTHING;
