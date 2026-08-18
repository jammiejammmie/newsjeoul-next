// card-content-preview.js — card-content.js를 실제로 트리거하지 않고 단건 검증하는 진단용 엔드포인트.
// 이미 게시된 토픽(Threads/Instagram 성공 여부와 무관)에도 실행 가능 — 게시 로직을 전혀 건드리지
// 않고 buildCardContent()만 단독 호출한다. Admin 전용.
// 사용: POST /.netlify/functions/card-content-preview  body: { topic_id }  header: x-admin-key
const { buildCardContent } = require('./card-content');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const topicId = body.topic_id || event.queryStringParameters?.topic_id;
    if (!topicId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'topic_id가 필요합니다' }) };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topicId}&select=id,name,category,ai_context`, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    });
    const [topic] = await r.json();
    if (!topic) return { statusCode: 404, headers, body: JSON.stringify({ error: '토픽을 찾을 수 없습니다' }) };

    const content = await buildCardContent(topic);
    return { statusCode: 200, headers, body: JSON.stringify({ topic: { id: topic.id, name: topic.name, category: topic.category }, content }, null, 2) };
  } catch (e) {
    console.error('card-content-preview 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
