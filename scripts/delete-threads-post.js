// delete-threads-post.js — 특정 Topic의 Threads 게시물 + 댓글 전체를 삭제한다.
// threads_credentials(Supabase, service_role)의 access_token을 우선 쓰고, 없으면 env 폴백.
// 실행: netlify dev:exec --context production node scripts/delete-threads-post.js <topic_id>
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ENV_TOKEN = process.env.THREADS_ACCESS_TOKEN;

async function getAccessToken() {
  if (SUPABASE_URL && SUPABASE_KEY) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/threads_credentials?select=access_token,expires_at&id=eq.threads&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    });
    if (r.ok) {
      const [row] = await r.json();
      if (row?.access_token) {
        console.log(`[token] DB(threads_credentials) 사용, expires_at=${row.expires_at}`);
        return row.access_token;
      }
    } else {
      console.log(`[token] DB 조회 실패(${r.status}): ${await r.text()}`);
    }
  }
  console.log('[token] env(THREADS_ACCESS_TOKEN) 폴백');
  return ENV_TOKEN;
}

async function listReplies(mediaId, token) {
  const ids = [];
  let url = `https://graph.threads.net/v1.0/${mediaId}/replies?fields=id,text,permalink&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) throw new Error(`replies 조회 실패: ${JSON.stringify(data)}`);
    for (const item of data.data || []) ids.push(item);
    url = data.paging?.next || null;
  }
  return ids;
}

async function deleteMedia(mediaId, token) {
  const r = await fetch(`https://graph.threads.net/v1.0/${mediaId}?access_token=${encodeURIComponent(token)}`, { method: 'DELETE' });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

(async () => {
  const topicId = process.argv[2];
  if (!topicId) {
    console.error('사용법: node scripts/delete-threads-post.js <topic_id>');
    process.exit(1);
  }

  const anonUrl = SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const tr = await fetch(`${anonUrl}/rest/v1/topics?select=id,name,ai_context&id=eq.${topicId}`, {
    headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey },
  });
  const [topic] = await tr.json();
  if (!topic) throw new Error('토픽을 찾을 수 없음: ' + topicId);
  const postId = topic.ai_context?.threads?.post_id;
  if (!postId) {
    console.log(`[skip] "${topic.name}" — threads.post_id 없음(게시된 적 없음)`);
    return;
  }
  console.log(`대상: "${topic.name}" | threads post_id=${postId}`);

  const token = await getAccessToken();
  if (!token) throw new Error('Threads access token을 못 구함');

  const replies = await listReplies(postId, token);
  console.log(`댓글 ${replies.length}건 발견`);
  for (const rep of replies) {
    const res = await deleteMedia(rep.id, token);
    console.log(`  댓글 ${rep.id} 삭제: ${res.ok ? 'OK' : 'FAIL ' + JSON.stringify(res.data)}`);
  }

  const res = await deleteMedia(postId, token);
  console.log(`본문 ${postId} 삭제: ${res.ok ? 'OK' : 'FAIL ' + JSON.stringify(res.data)}`);
})().catch((e) => { console.error('오류:', e.message); process.exit(1); });
