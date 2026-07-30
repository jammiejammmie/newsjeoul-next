// patch-perspective-candidates.js — 1회성 긴급 함수 (2026-07-31, 에디터 31명 미배정 원인 수정)
//
// 진단: 선언·전망·논쟁(48h 13회, 최다빈도 event_type)의 perspective_candidates가
// ["투자분석가","역사연구자"] 2개뿐이라 팩트체커(2명)가 영원히 배정 기회를 못 받음.
// 규제·정책(9회)도 3개뿐이라 교육전문가(3명)/환경전문가(3명)가 밀려남.
// 신제품·모델출시(4회)는 기술덕후(6명, domains=AI/오픈소스/로보틱스/우주기술/바이오테크)를
// 후보에서 아예 빼놓아 사실상 신제품 뉴스와 겹치는 인력을 못 씀.
// 기존 후보를 지우지 않고 추가만 한다 — 되돌리기 쉬움. 실행 후 이 함수는 제거한다.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ADDITIONS = {
  '신제품·모델출시': ['기술덕후'],
  '규제·정책': ['환경전문가', '교육전문가'],
  '선언·전망·논쟁': ['팩트체커'],
};

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error('GET 실패: ' + await res.text());
  return res.json();
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('PATCH 실패: ' + await res.text());
  return res.json();
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const results = [];
  try {
    const types = Object.keys(ADDITIONS);
    const rules = await supabaseGet('event_type_rules', `?event_type=in.(${types.map(encodeURIComponent).join(',')})&select=event_type,perspective_candidates`);
    for (const r of rules) {
      const toAdd = ADDITIONS[r.event_type].filter((t) => !r.perspective_candidates.includes(t));
      if (!toAdd.length) { results.push({ event_type: r.event_type, skipped: true }); continue; }
      const newList = [...r.perspective_candidates, ...toAdd];
      const [updated] = await supabasePatch('event_type_rules', `?event_type=eq.${encodeURIComponent(r.event_type)}`, { perspective_candidates: newList });
      results.push({ event_type: r.event_type, before: r.perspective_candidates, after: updated?.perspective_candidates });
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, results }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message, results }) };
  }
};
