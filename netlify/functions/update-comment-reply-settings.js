// update-comment-reply-settings.js — Track 3-2 라이브 전환 토글 전용
// admin 화면의 on/off 스위치 하나만 호출한다. 이 함수 자체도, 다른 어떤 자동화도 is_live를
// true로 자동 설정하지 않는다 — 사람이 admin 화면에서 명시적으로 누를 때만 호출된다.
// 주의: is_live=true로 바뀌어도 실제 게시 코드(scan-comments-shadow-background.js)는 여전히
// 게시하지 않는다 — 그 코드가 아직 구현되지 않았기 때문(CHANGELOG.md 참고, 의도적 단계 분리).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const { is_live } = JSON.parse(event.body || '{}');
    if (typeof is_live !== 'boolean') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'is_live(boolean)가 필요합니다' }) };
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/comment_auto_reply_settings?id=eq.true`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ is_live, updated_at: new Date().toISOString(), updated_by: 'admin' }),
    });
    if (!res.ok) throw new Error('설정 갱신 실패: ' + await res.text());

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, is_live }) };
  } catch (e) {
    console.error('update-comment-reply-settings 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
