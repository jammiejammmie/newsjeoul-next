// 여론조사 업데이트
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
  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
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

[{"region":"서울특별시","election_type":"광역","candidate_a":"후보명","candidate_a_party":"정당","candidate_a_pct":46,"candidate_b":"후보명","candidate_b_party":"정당","candidate_b_pct":38,"candidate_c":null,"candidate_c_party":null,"candidate_c_pct":null,"candidate_d":null,"candidate_d_party":null,"candidate_d_pct":null,"poll_company":"조사기관","media_outlet":"의뢰언론","survey_date":"2026-06-01","sample_size":1000}]`
        }]
      })
    });
    if (!response.ok) throw new Error('Claude API 에러');
    const data = await response.json();
    const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error('JSON 없음');
    const polls = JSON.parse(match[0]);
    const today = new Date(); today.setHours(0,0,0,0);
    await supabaseDelete('polls_kr', today.toISOString());
    await supabaseInsert('polls_kr', polls);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, saved: polls.length }) };
  } catch(e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
