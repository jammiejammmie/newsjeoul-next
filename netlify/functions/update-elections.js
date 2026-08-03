// 여론조사 업데이트(아침)
// 2026-08-03: candidate_*_pct가 integer 컬럼인데 모델이 소수점 지지율(49.6)을 반환해
// 적재가 계속 500으로 실패했다 — 적재 직전 정규화를 lib/polls-kr.js로 분리해 저녁 함수와 공유한다.
const { normalizePollRows } = require('./lib/polls-kr');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function supabaseDelete(table, gte_date) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?created_at=gte.${gte_date}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }
  });
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Supabase error: ' + await res.text());
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod === 'POST' || event.httpMethod === 'GET') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `한국 최근 주요 정치 여론조사 결과를 검색해줘. 서울시장, 부산시장, 대구시장, 경기도지사 등 광역단체장 지지율 데이터를 찾아줘.

반드시 아래 JSON 배열 형식으로만 답해. 다른 말 하지마.
지지율(candidate_*_pct)과 표본수(sample_size)는 반드시 정수로만 써라 — 소수점(49.6)이나 단위("49.6%", "1,000명")를 붙이지 마라.

[{"region":"서울특별시","election_type":"광역","candidate_a":"후보명","candidate_a_party":"정당","candidate_a_pct":46,"candidate_b":"후보명","candidate_b_party":"정당","candidate_b_pct":38,"candidate_c":null,"candidate_c_party":null,"candidate_c_pct":null,"candidate_d":null,"candidate_d_party":null,"candidate_d_pct":null,"poll_company":"조사기관","media_outlet":"의뢰언론","survey_date":"2026-06-01","sample_size":1000}]`
        }]
      })
    });
    if (!response.ok) throw new Error('Claude API 에러');
    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('JSON 없음');
    const polls = normalizePollRows(JSON.parse(match[0]));
    if (!polls.length) throw new Error('정규화 후 적재할 여론조사 행이 없음');
    const today = new Date(); today.setHours(0,0,0,0);
    await supabaseDelete('polls_kr', today.toISOString());
    await supabaseInsert('polls_kr', polls);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, saved: polls.length }) };
  } catch(e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
