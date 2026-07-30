// run-diversity-migration.js — 마스터 스펙 v1 Track 1 일회성 적용 함수
// supabase/diversity_expansion_migration.sql과 동일한 내용을 REST API로 적용한다
// (PostgREST는 임의 SQL 실행을 지원하지 않아 SERVICE_KEY 보유 환경에서 이 방식으로 적용).
// 이미 존재하는 name/event_type은 건너뛰어 재실행해도 안전하다.
// 적용 완료 후 이 파일은 삭제 예정 — 상시 admin 엔드포인트로 남겨두지 않는다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const NEW_OUTLETS = [
  { name: '전자신문', google_news_query: '전자신문', homepage_url: 'https://www.etnews.com', is_active: true },
  { name: '지디넷코리아', google_news_query: '지디넷코리아', homepage_url: 'https://zdnet.co.kr', is_active: true },
  { name: '디지털데일리', google_news_query: '디지털데일리', homepage_url: 'https://www.ddaily.co.kr', is_active: true },
  { name: '블로터', google_news_query: '블로터', homepage_url: 'https://www.bloter.net', is_active: true },
  { name: '오토뷰', google_news_query: '오토뷰', homepage_url: 'https://www.autoview.co.kr', is_active: true },
  { name: '모터그래프', google_news_query: '모터그래프', homepage_url: 'https://www.motorgraph.com', is_active: true },
  { name: '컨슈머타임스', google_news_query: '컨슈머타임스', homepage_url: 'https://www.cstimes.com', is_active: true },
  { name: '소비자가만드는신문', google_news_query: '소비자가만드는신문', homepage_url: 'https://www.consumerwatch.co.kr', is_active: true },
  { name: '정책브리핑', google_news_query: '정책브리핑', homepage_url: 'https://www.korea.kr', is_active: true },
];

const NEW_EVENT_TYPE_RULES = [
  {
    event_type: '라이프스타일·트렌드',
    axis_weights: { 비교: 0.15, 역사: 0.10, 연결: 0.20, 지금: 0.35, 행위자: 0.05, 핵심변화: 0.15 },
    omittable_axes: ['행위자', '역사'], required_axes: ['지금'],
    perspective_candidates: ['문화평론가', '소비자전문'],
    requires_dual_perspective_fixed: false,
    evidence_required: ['trend_data', 'image_hero', 'source>=2'],
    target_length_min: 1000, target_length_max: 1500, zeitgeist_excluded: false,
    common_pitfalls: ['트렌드를 단정적으로 일반화(일부 사례를 전체 유행처럼 서술)', '맥락 없이 사진만 나열'],
    misclassification_risk: '라이프스타일 트렌드를 신제품·모델출시로 오판하면 특정 브랜드 홍보처럼 보이는 스펙 축이 앞서게 됨',
  },
  {
    event_type: '건강·의료',
    axis_weights: { 비교: 0.15, 역사: 0.15, 연결: 0.25, 지금: 0.30, 행위자: 0.05, 핵심변화: 0.10 },
    omittable_axes: ['행위자', '핵심변화'], required_axes: ['지금', '연결'],
    perspective_candidates: ['의료건강전문가'],
    requires_dual_perspective_fixed: false,
    evidence_required: ['expert_quote', 'study_citation', 'source>=2'],
    target_length_min: 1000, target_length_max: 1500, zeitgeist_excluded: false,
    common_pitfalls: ['의학적으로 검증 안 된 주장을 단정적으로 서술', '공포 조장성 어휘 사용', '전문가 인용 없이 통계만 나열'],
    misclassification_risk: '건강 이슈를 재난·긴급상황으로 오판하면 불필요하게 속보성 어조가 붙어 근거 없는 공포를 조장할 위험',
  },
  {
    event_type: '스포츠',
    axis_weights: { 비교: 0.30, 역사: 0.05, 연결: 0.10, 지금: 0.35, 행위자: 0.20, 핵심변화: 0 },
    omittable_axes: ['핵심변화', '연결'], required_axes: ['지금', '비교'],
    perspective_candidates: ['스포츠분석가'],
    requires_dual_perspective_fixed: false,
    evidence_required: ['score_data', 'player_stat', 'source'],
    target_length_min: 900, target_length_max: 1300, zeitgeist_excluded: false,
    common_pitfalls: ['결과만 나열하고 왜 중요한 경기인지 맥락 누락', '팬덤 편향적 서술'],
    misclassification_risk: '스포츠를 실적·시장변화로 오판하면 숫자(성적)만 강조되고 경기 서사가 실종됨',
  },
  {
    event_type: '청년정책·복지',
    axis_weights: { 비교: 0.15, 역사: 0.10, 연결: 0.25, 지금: 0.30, 행위자: 0.10, 핵심변화: 0.10 },
    omittable_axes: ['역사', '행위자'], required_axes: ['지금', '연결'],
    perspective_candidates: ['신청가이드전문가', '정책분석가'],
    requires_dual_perspective_fixed: false,
    evidence_required: ['application_guide', 'eligibility_criteria', 'official_source', 'deadline_data'],
    target_length_min: 1000, target_length_max: 1500, zeitgeist_excluded: false,
    common_pitfalls: ['신청 자격/기한을 부정확하게 서술', '보도자료를 그대로 요약해 실용 정보(어떻게 신청하는지) 누락'],
    misclassification_risk: '청년정책을 규제·정책으로 오판하면 신청 방법 같은 실용 정보 대신 절차적 해설에 그쳐 실제 도움이 안 됨',
  },
  {
    event_type: '지역행정',
    axis_weights: { 비교: 0.15, 역사: 0.10, 연결: 0.30, 지금: 0.20, 행위자: 0.15, 핵심변화: 0.10 },
    omittable_axes: ['역사', '핵심변화'], required_axes: ['연결'],
    perspective_candidates: ['이해당사자', '정책분석가'],
    requires_dual_perspective_fixed: null,
    evidence_required: ['official_statement', 'local_data', 'resident_comment'],
    target_length_min: 1000, target_length_max: 1500, zeitgeist_excluded: false,
    common_pitfalls: ['지자체 보도자료를 그대로 인용만 하고 주민 체감 정보 누락'],
    misclassification_risk: '지역행정을 규제·정책으로 오판하면 전국 단위 해설처럼 다뤄져 정작 해당 지역 주민에게 필요한 구체 정보가 실종됨',
  },
  {
    event_type: '환경·기후',
    axis_weights: { 비교: 0.15, 역사: 0.20, 연결: 0.20, 지금: 0.25, 행위자: 0.05, 핵심변화: 0.15 },
    omittable_axes: ['행위자'], required_axes: ['지금', '연결'],
    perspective_candidates: ['환경전문가'],
    requires_dual_perspective_fixed: null,
    evidence_required: ['climate_data', 'trend_chart', 'expert_quote', 'source>=2'],
    target_length_min: 1200, target_length_max: 1700, zeitgeist_excluded: false,
    common_pitfalls: ['단일 사건을 기후위기 전체로 과잉 일반화', '수치 출처 불명확'],
    misclassification_risk: '환경 이슈를 재난·긴급상황으로 오판하면 장기 추세 설명 없이 속보성으로만 다뤄져 구조적 맥락이 실종됨',
  },
  {
    event_type: '기술',
    axis_weights: { 비교: 0.20, 역사: 0.15, 연결: 0.25, 지금: 0.15, 행위자: 0.05, 핵심변화: 0.20 },
    omittable_axes: ['행위자'], required_axes: ['연결', '핵심변화'],
    perspective_candidates: ['기술덕후', '투자분석가'],
    requires_dual_perspective_fixed: null,
    evidence_required: ['tech_diagram', 'industry_data', 'source>=2'],
    target_length_min: 1300, target_length_max: 1800, zeitgeist_excluded: false,
    common_pitfalls: ['특정 제품 홍보처럼 보이는 서술(신제품·모델출시와 혼동)', '기술 원리 설명 없이 파급 효과만 과장'],
    misclassification_risk: '광의의 기술 트렌드를 신제품·모델출시로 오판하면 특정 제품 스펙 나열에 그쳐 산업 전체 흐름이 안 보임',
  },
];

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ` + await res.text());
  return res.json();
}

async function supabaseInsert(table, rows) {
  if (!rows.length) return { inserted: 0 };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`POST ${table} 실패: ` + await res.text());
  return { inserted: rows.length };
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const existingOutlets = await supabaseGet('outlets', '?select=name');
    const existingNames = new Set(existingOutlets.map((o) => o.name));
    const outletsToInsert = NEW_OUTLETS.filter((o) => !existingNames.has(o.name));

    const existingRules = await supabaseGet('event_type_rules', '?select=event_type');
    const existingTypes = new Set(existingRules.map((r) => r.event_type));
    const rulesToInsert = NEW_EVENT_TYPE_RULES.filter((r) => !existingTypes.has(r.event_type));

    const outletsResult = await supabaseInsert('outlets', outletsToInsert);
    const rulesResult = await supabaseInsert('event_type_rules', rulesToInsert);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        outlets: { inserted: outletsResult.inserted, skipped_existing: NEW_OUTLETS.length - outletsToInsert.length },
        event_type_rules: { inserted: rulesResult.inserted, skipped_existing: NEW_EVENT_TYPE_RULES.length - rulesToInsert.length },
      }),
    };
  } catch (e) {
    console.error('run-diversity-migration 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
