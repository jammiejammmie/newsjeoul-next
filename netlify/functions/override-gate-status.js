// override-gate-status.js — Publish Gate 수동 override(설계서 §5 "수정"/"강제 발행" 버튼용)
// 근거: docs/newsjeoul-publish-gate-design.md §5, DEC-006
// 동기 함수(즉시 응답, 가벼운 단건 PATCH라 26초 캡과 무관) — Admin 전용, admin key 필수.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const VALID_STATUSES = ['DEEP_DIVE', 'SEARCH_GUIDE', 'PRODUCT_BRIEF', 'COMPARE', 'BACKGROUND', 'UPDATE', 'SHORT_BRIEF', 'REJECT'];

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} 실패: ` + await res.text());
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { topic_id, new_status } = body;

    if (!topic_id || !VALID_STATUSES.includes(new_status)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'topic_id와 new_status(publish_long|publish_short|hold|reject)가 필요합니다' }) };
    }

    const [topic] = await supabaseGet('topics', `?id=eq.${topic_id}&select=ai_context`);
    if (!topic) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: '해당 Topic을 찾을 수 없습니다' }) };
    }

    const prevGate = (topic.ai_context && topic.ai_context.gate) || {};
    const newGate = {
      ...prevGate,
      status: new_status,
      overridden_by: 'admin',
      overridden_at: new Date().toISOString(),
    };

    await supabasePatch('topics', `?id=eq.${topic_id}`, {
      gate_status: new_status,
      ai_context: { ...(topic.ai_context || {}), gate: newGate },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, topic_id, new_status }) };
  } catch (e) {
    console.error('override-gate-status 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
