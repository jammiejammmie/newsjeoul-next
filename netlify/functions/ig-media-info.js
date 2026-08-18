// ig-media-info.js — Instagram media_id로 permalink를 조회하는 진단용 엔드포인트.
// Instagram Graph API가 게시물 삭제를 지원하지 않아(2026-08-18 확인, code 100 "Unsupported
// delete request") 수동 삭제가 유일한 경로다 — 그 삭제를 빠르게 하기 위한 permalink 조회.
// 사용: GET /.netlify/functions/ig-media-info?media_id=...  header: x-admin-key
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const GRAPH = 'https://graph.instagram.com/v23.0';

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const mediaId = event.queryStringParameters?.media_id;
  if (!mediaId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'media_id가 필요합니다' }) };

  try {
    const r = await fetch(`${GRAPH}/${mediaId}?fields=id,permalink,caption,timestamp,media_type&access_token=${encodeURIComponent(IG_TOKEN)}`);
    const data = await r.json();
    return { statusCode: r.ok ? 200 : r.status, headers, body: JSON.stringify(data, null, 2) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
