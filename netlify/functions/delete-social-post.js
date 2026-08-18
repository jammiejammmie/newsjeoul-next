// delete-social-post.js — Topic 하나의 Threads 게시물+댓글, Instagram 게시물을 삭제한다.
// 동기 함수(즉시 응답) — Admin 전용. 임성재 페덱스컵 준우승 오보/철회 삭제 요청(2026-08-18)로 신설.
// 사용: POST /.netlify/functions/delete-social-post  body: { topic_id }  header: x-admin-key
//
// 토큰 우선순위는 post-threads-background.js와 동일: threads_credentials(DB, auto-refresh)가
// 정본이고, 없을 때만 env(THREADS_ACCESS_TOKEN, 수동 발급 후 갱신 안 된 값이라 만료 위험)로 폴백.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const GRAPH_THREADS = 'https://graph.threads.net/v1.0';
const GRAPH_IG = 'https://graph.instagram.com/v23.0';

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} 실패(${res.status}): ` + (await res.text()));
  return res.json();
}

async function getThreadsToken() {
  const rows = await supabaseGet('threads_credentials', '?select=access_token,expires_at&id=eq.threads&limit=1');
  const row = rows[0];
  if (row?.access_token) {
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      console.error(`THREADS_TOKEN: DB 토큰 만료(${row.expires_at})`);
    }
    return row.access_token;
  }
  return process.env.THREADS_ACCESS_TOKEN || null;
}

async function listThreadsReplies(mediaId, token) {
  const out = [];
  let url = `${GRAPH_THREADS}/${mediaId}/replies?fields=id,text&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(`replies 조회 실패: ${JSON.stringify(data)}`);
    out.push(...(data.data || []));
    url = data.paging?.next || null;
  }
  return out;
}

async function deleteThreadsMedia(mediaId, token) {
  const r = await fetch(`${GRAPH_THREADS}/${mediaId}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function deleteInstagramMedia(mediaId) {
  // Instagram Content Publishing API는 게시된 미디어의 DELETE를 지원하지 않는다(공식 제약).
  // 시도는 하되 실패를 정상 경로로 취급하고 이유를 남긴다.
  const r = await fetch(`${GRAPH_IG}/${mediaId}?access_token=${encodeURIComponent(IG_TOKEN)}`, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
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
    const topicId = body.topic_id || event.queryStringParameters?.topic_id;
    if (!topicId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'topic_id가 필요합니다' }) };
    }

    const [topic] = await supabaseGet('topics', `?id=eq.${topicId}&select=id,name,ai_context`);
    if (!topic) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: '해당 Topic을 찾을 수 없습니다' }) };
    }

    const result = { topic_id: topicId, name: topic.name, threads: null, instagram: null };

    const threadsPostId = topic.ai_context?.threads?.post_id;
    if (threadsPostId) {
      const token = await getThreadsToken();
      if (!token) {
        result.threads = { error: 'Threads access token 없음' };
      } else {
        const replies = await listThreadsReplies(threadsPostId, token);
        const replyResults = [];
        for (const rep of replies) {
          replyResults.push({ id: rep.id, ...(await deleteThreadsMedia(rep.id, token)) });
        }
        const postResult = await deleteThreadsMedia(threadsPostId, token);
        result.threads = { post_id: threadsPostId, replies_deleted: replyResults, post_delete: postResult };
      }
    } else {
      result.threads = { skipped: 'threads.post_id 없음(게시된 적 없음)' };
    }

    const igMediaId = topic.ai_context?.instagram?.media_id;
    if (igMediaId) {
      if (!IG_TOKEN) {
        result.instagram = { error: 'INSTAGRAM_ACCESS_TOKEN 없음' };
      } else {
        result.instagram = { media_id: igMediaId, ...(await deleteInstagramMedia(igMediaId)) };
      }
    } else {
      result.instagram = { skipped: 'instagram.media_id 없음(게시된 적 없음)' };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result, null, 2) };
  } catch (e) {
    console.error('delete-social-post 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
