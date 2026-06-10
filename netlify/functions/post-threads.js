// Threads 자동 포스팅 — 오늘의 침묵지수 TOP1
// Copy template rotates A→E daily so the Threads profile never looks repetitive.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const TOTAL_OUTLETS = 20;
const BASE_URL = 'https://newsjeoul.co.kr';

// ── Data ─────────────────────────────────────────────────────────
async function fetchTopSilenceStory() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stories?select=id,title,silence_score,story_articles(article_id)&order=silence_score.desc&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    }
  );
  if (!res.ok) throw new Error('Supabase 조회 실패: ' + await res.text());
  const rows = await res.json();
  if (!rows.length) throw new Error('스토리 없음');
  const story = rows[0];
  story.reportCount = (story.story_articles || []).length;
  return story;
}

// ── Copy templates A–E ───────────────────────────────────────────
// Rotates once per day so consecutive days show different copy.
function buildPost(story, url) {
  const n = story.reportCount;
  const silent = TOTAL_OUTLETS - n;
  // absolute day index → cycles 0 1 2 3 4 0 1 2 3 4 …
  const idx = Math.floor(Date.now() / 86400000) % 5;

  const templates = [
    // A — direct stat + question
    `${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 보도했습니다.

당신은 이 뉴스를 보셨나요?

뉴스저울 →
${url}`,

    // B — first person voice
    `저는 오늘 처음 봤습니다.

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 다룬 뉴스입니다.

뉴스저울 →
${url}`,

    // C — minimal, pure curiosity
    `대부분의 사람은 이 뉴스를 보지 못했습니다.

당신은 보셨나요?

뉴스저울 →
${url}`,

    // D — label style, short
    `오늘 가장 침묵한 뉴스

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 보도

뉴스저울 →
${url}`,

    // E — contrast framing
    `이 뉴스를 다룬 언론사는 단 ${n}곳.

나머지 ${silent}곳은 다루지 않았습니다.

뉴스저울 →
${url}`,
  ];

  return templates[idx];
}

// ── Threads API ──────────────────────────────────────────────────
async function createContainer(text) {
  const params = new URLSearchParams({
    media_type: 'TEXT',
    text,
    access_token: THREADS_ACCESS_TOKEN,
  });
  const res = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`,
    { method: 'POST', body: params }
  );
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('컨테이너 생성 실패: ' + JSON.stringify(data));
  return data.id;
}

async function publishPost(containerId) {
  const params = new URLSearchParams({
    creation_id: containerId,
    access_token: THREADS_ACCESS_TOKEN,
  });
  const res = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`,
    { method: 'POST', body: params }
  );
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('게시 실패: ' + JSON.stringify(data));
  return data.id;
}

// ── Handler ──────────────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Manual HTTP calls require admin key; cron invocations have no httpMethod
  if (event.httpMethod) {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const story = await fetchTopSilenceStory();
    const url = `${BASE_URL}/story/${story.id}`;
    const text = buildPost(story, url);
    const templateIdx = Math.floor(Date.now() / 86400000) % 5;
    const templateLabel = ['A','B','C','D','E'][templateIdx];

    console.log('포스팅 내용:\n', text);

    // dry=true → 실제 게시 없이 미리보기만 반환 (Threads 환경변수 불필요)
    const isDry = event.queryStringParameters?.dry === 'true';
    if (isDry) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          dry: true,
          template: templateLabel,
          title: story.title,
          reportCount: story.reportCount,
          url,
          text,
        }),
      };
    }

    if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }),
      };
    }

    const containerId = await createContainer(text);
    // Threads API 권장: 컨테이너 생성 후 최소 30초 대기
    await new Promise(r => setTimeout(r, 30000));
    const postId = await publishPost(containerId);

    console.log('Threads 게시 완료:', postId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        postId,
        template: templateLabel,
        title: story.title,
        reportCount: story.reportCount,
        url,
      }),
    };
  } catch (e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
