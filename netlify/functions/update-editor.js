// update-editor.js — Admin 에디터 관리(활성/비활성 토글, 수동 재배정 이력 초기화)
// 근거: PM 지시(2026-07-17, "100명 에디터 Admin 관리 UI" — 목록/활성토글/과다배정 경고).
// 동기 함수(단건 PATCH라 빠름 — Background Function으로 만들 필요 없음).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'];
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { editor_id, active, reset_assignment_count } = JSON.parse(event.body || '{}');
    if (!editor_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'editor_id 필요' }) };
    }
    const patch = {};
    if (typeof active === 'boolean') patch.active = active;
    if (reset_assignment_count === true) patch.assignment_count = 0;
    if (Object.keys(patch).length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '변경할 필드 없음(active 또는 reset_assignment_count 필요)' }) };
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/editors?id=eq.${editor_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Supabase PATCH 실패: ' + await res.text());

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, editor_id, patch }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
