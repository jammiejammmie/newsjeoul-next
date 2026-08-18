// ig-list-media.js — 계정의 최근 게시물 목록(id/caption/permalink/timestamp) 조회.
// media_id로 직접 조회가 안 되는 게시물을 찾기 위한 진단용(2026-08-18).
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const GRAPH = 'https://graph.instagram.com/v23.0';

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const limit = event.queryStringParameters?.limit || '25';
  try {
    const r = await fetch(`${GRAPH}/${IG_USER_ID}/media?fields=id,permalink,caption,timestamp&limit=${limit}&access_token=${encodeURIComponent(IG_TOKEN)}`);
    const data = await r.json();
    return { statusCode: r.ok ? 200 : r.status, headers, body: JSON.stringify(data, null, 2) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
