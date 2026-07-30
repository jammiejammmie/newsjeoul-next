// approve-proposed-event-type.js — Evolution Engine Track 2-2 "원클릭 승인 버튼"
// proposed_event_types의 한 행을 event_type_rules에 실제로 반영하고 status='approved'로 표시.
// Human Promotion 필수 원칙 — 이 엔드포인트는 admin이 버튼을 눌러야만 호출된다(자동 호출 없음).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ` + await res.text());
  return res.json();
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { proposal_id } = JSON.parse(event.body || '{}');
    if (!proposal_id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'proposal_id가 필요합니다' }) };

    const [proposal] = await supabaseGet('proposed_event_types', `?id=eq.${proposal_id}&select=*`);
    if (!proposal) return { statusCode: 404, headers, body: JSON.stringify({ error: '해당 제안을 찾을 수 없습니다' }) };
    if (proposal.status !== 'proposed') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: `이미 처리된 제안입니다(status=${proposal.status})` }) };
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/event_type_rules`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        event_type: proposal.event_type_name,
        axis_weights: proposal.suggested_axis_weights || {},
        perspective_candidates: proposal.suggested_perspective_candidates || [],
        requires_dual_perspective_fixed: null,
        required_axes: [], omittable_axes: [],
        evidence_required: [], target_length_min: 1000, target_length_max: 1500,
        zeitgeist_excluded: false, common_pitfalls: [],
        misclassification_risk: `(Evolution Engine 자동 제안, admin 승인) ${proposal.rationale}`,
      }),
    });
    if (!insertRes.ok) throw new Error('event_type_rules insert 실패: ' + await insertRes.text());

    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/proposed_event_types?id=eq.${proposal_id}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'approved', reviewed_by: 'admin', reviewed_at: new Date().toISOString() }),
    });
    if (!patchRes.ok) throw new Error('proposed_event_types 상태 갱신 실패: ' + await patchRes.text());

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, event_type: proposal.event_type_name }) };
  } catch (e) {
    console.error('approve-proposed-event-type 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
