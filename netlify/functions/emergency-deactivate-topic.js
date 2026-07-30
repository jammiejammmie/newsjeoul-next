// emergency-deactivate-topic.js — 1회성 긴급 대응 함수(2026-07-30)
// "이준석 대통령 칠레 순방" 팩트 오류 토픽(4741004e-ecb0-4d35-b431-4ef39a92445d) 긴급 비활성화용.
// dev:exec/CLI로는 SUPABASE_SERVICE_KEY가 마스킹돼 나와 로컬에서 직접 PATCH 불가 — 실제
// 배포 환경에서 실행되는 함수로 처리. 사용 후 제거 예정.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const topicId = event.queryStringParameters?.topic_id;
  if (!topicId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'topic_id 필요' }) };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topicId}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'inactive' }),
  });
  const body = await res.text();
  return { statusCode: res.status, headers, body };
};
