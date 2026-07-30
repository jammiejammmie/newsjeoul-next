-- 뉴스저울 다양성 회복 — 마스터 스펙 v1 Track 1
-- 근거: 2026-07-30 진단(카테고리 92%가 Society/Economy, IT·소비재·라이프스타일 0%,
-- outlets 20곳 전부 종합일간지/방송사, event_type_rules 10개 전부 정치·기업·안보 편중,
-- 32명 에디터 페르소나 assignment_count=0)
-- 재실행해도 안전(ON CONFLICT DO NOTHING / event_type 유니크 가정)

-- 1-1. 수집 소스 확장 (outlets)
INSERT INTO outlets (name, google_news_query, homepage_url, is_active) VALUES
  ('전자신문', '전자신문', 'https://www.etnews.com', true),
  ('지디넷코리아', '지디넷코리아', 'https://zdnet.co.kr', true),
  ('디지털데일리', '디지털데일리', 'https://www.ddaily.co.kr', true),
  ('블로터', '블로터', 'https://www.bloter.net', true),
  ('오토뷰', '오토뷰', 'https://www.autoview.co.kr', true),
  ('모터그래프', '모터그래프', 'https://www.motorgraph.com', true),
  ('컨슈머타임스', '컨슈머타임스', 'https://www.cstimes.com', true),
  ('소비자가만드는신문', '소비자가만드는신문', 'https://www.consumerwatch.co.kr', true),
  ('정책브리핑', '정책브리핑', 'https://www.korea.kr', true)
ON CONFLICT (name) DO NOTHING;
-- 판단: "주요 지자체 보도자료"는 다수 지자체를 개별 outlet으로 넣기엔 특정 지역에 편중될 위험이
-- 있어(서울만 넣으면 서울 편중), 이번 1차에는 전국 단위 정책브리핑(korea.kr)만 추가하고
-- 지자체별 소스는 Track2 갭 감지 결과를 보고 실제 수요가 확인되는 지역부터 추가하기로 판단.

-- 1-2. event_type_rules 확장 — 0회 배정된 32명 에디터 페르소나를 실제 파이프라인에 연결
-- 기존 10개 event_type과 동일한 스키마(axis_weights 6축 합=1.0, required/omittable_axes,
-- evidence_required, target_length, common_pitfalls, misclassification_risk)를 따른다.
INSERT INTO event_type_rules
  (event_type, axis_weights, omittable_axes, required_axes, perspective_candidates,
   requires_dual_perspective_fixed, evidence_required, target_length_min, target_length_max,
   zeitgeist_excluded, common_pitfalls, misclassification_risk)
VALUES
  ('라이프스타일·트렌드',
   '{"비교":0.15,"역사":0.10,"연결":0.20,"지금":0.35,"행위자":0.05,"핵심변화":0.15}',
   ARRAY['행위자','역사'], ARRAY['지금'],
   ARRAY['문화평론가','소비자전문'],
   false,
   ARRAY['trend_data','image_hero','source>=2'],
   1000, 1500, false,
   ARRAY['트렌드를 단정적으로 일반화(일부 사례를 전체 유행처럼 서술)','맥락 없이 사진만 나열'],
   '라이프스타일 트렌드를 신제품·모델출시로 오판하면 특정 브랜드 홍보처럼 보이는 스펙 축이 앞서게 됨'),

  ('건강·의료',
   '{"비교":0.15,"역사":0.15,"연결":0.25,"지금":0.30,"행위자":0.05,"핵심변화":0.10}',
   ARRAY['행위자','핵심변화'], ARRAY['지금','연결'],
   ARRAY['의료건강전문가'],
   false,
   ARRAY['expert_quote','study_citation','source>=2'],
   1000, 1500, false,
   ARRAY['의학적으로 검증 안 된 주장을 단정적으로 서술','공포 조장성 어휘 사용','전문가 인용 없이 통계만 나열'],
   '건강 이슈를 재난·긴급상황으로 오판하면 불필요하게 속보성 어조가 붙어 근거 없는 공포를 조장할 위험'),

  ('스포츠',
   '{"비교":0.30,"역사":0.05,"연결":0.10,"지금":0.35,"행위자":0.20,"핵심변화":0}',
   ARRAY['핵심변화','연결'], ARRAY['지금','비교'],
   ARRAY['스포츠분석가'],
   false,
   ARRAY['score_data','player_stat','source'],
   900, 1300, false,
   ARRAY['결과만 나열하고 왜 중요한 경기인지 맥락 누락','팬덤 편향적 서술'],
   '스포츠를 실적·시장변화로 오판하면 숫자(성적)만 강조되고 경기 서사가 실종됨'),

  ('청년정책·복지',
   '{"비교":0.15,"역사":0.10,"연결":0.25,"지금":0.30,"행위자":0.10,"핵심변화":0.10}',
   ARRAY['역사','행위자'], ARRAY['지금','연결'],
   ARRAY['신청가이드전문가','정책분석가'],
   false,
   ARRAY['application_guide','eligibility_criteria','official_source','deadline_data'],
   1000, 1500, false,
   ARRAY['신청 자격/기한을 부정확하게 서술','보도자료를 그대로 요약해 실용 정보(어떻게 신청하는지) 누락'],
   '청년정책을 규제·정책으로 오판하면 신청 방법 같은 실용 정보 대신 절차적 해설에 그쳐 실제 도움이 안 됨'),

  ('지역행정',
   '{"비교":0.15,"역사":0.10,"연결":0.30,"지금":0.20,"행위자":0.15,"핵심변화":0.10}',
   ARRAY['역사','핵심변화'], ARRAY['연결'],
   ARRAY['이해당사자','정책분석가'],
   null,
   ARRAY['official_statement','local_data','resident_comment'],
   1000, 1500, false,
   ARRAY['지자체 보도자료를 그대로 인용만 하고 주민 체감 정보 누락'],
   '지역행정을 규제·정책으로 오판하면 전국 단위 해설처럼 다뤄져 정작 해당 지역 주민에게 필요한 구체 정보가 실종됨'),

  ('환경·기후',
   '{"비교":0.15,"역사":0.20,"연결":0.20,"지금":0.25,"행위자":0.05,"핵심변화":0.15}',
   ARRAY['행위자'], ARRAY['지금','연결'],
   ARRAY['환경전문가'],
   null,
   ARRAY['climate_data','trend_chart','expert_quote','source>=2'],
   1200, 1700, false,
   ARRAY['단일 사건을 기후위기 전체로 과잉 일반화','수치 출처 불명확'],
   '환경 이슈를 재난·긴급상황으로 오판하면 장기 추세 설명 없이 속보성으로만 다뤄져 구조적 맥락이 실종됨'),

  ('기술',
   '{"비교":0.20,"역사":0.15,"연결":0.25,"지금":0.15,"행위자":0.05,"핵심변화":0.20}',
   ARRAY['행위자'], ARRAY['연결','핵심변화'],
   ARRAY['기술덕후','투자분석가'],
   null,
   ARRAY['tech_diagram','industry_data','source>=2'],
   1300, 1800, false,
   ARRAY['특정 제품 홍보처럼 보이는 서술(신제품·모델출시와 혼동)','기술 원리 설명 없이 파급 효과만 과장'],
   '광의의 기술 트렌드를 신제품·모델출시로 오판하면 특정 제품 스펙 나열에 그쳐 산업 전체 흐름이 안 보임')
ON CONFLICT (event_type) DO NOTHING;
-- 판단: 마스터 스펙의 "소비자전문가"는 editors.perspective_tag 실제 값인 "소비자전문"으로
-- 교정해 넣음(오타/축약 차이 — exact match 로직이라 틀리면 그 페르소나가 여전히 선택 안 됨).
