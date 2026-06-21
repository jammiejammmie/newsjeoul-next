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
  // KST 오늘 00:00 → UTC 변환 (KST = UTC+9)
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + kstOffset);
  const todayKST = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()));
  const todayStart = new Date(todayKST.getTime() - kstOffset).toISOString();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/stories?select=id,title,silence_score,story_articles(article_id)&created_at=gte.${encodeURIComponent(todayStart)}&order=silence_score.desc,created_at.desc&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    }
  );
  if (!res.ok) throw new Error('Supabase 조회 실패: ' + await res.text());
  const rows = await res.json();
  if (!rows.length) throw new Error('오늘 스토리 없음');
  const story = rows[0];
  story.reportCount = (story.story_articles || []).length;
  return story;
}

// ── Duplicate check ───────────────────────────────────────────────
async function getRecentPost(storyId) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts?story_id=eq.${storyId}&posted_at=gte.${encodeURIComponent(since)}&limit=1`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      },
    }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] || null;
}

// ── Post log ──────────────────────────────────────────────────────
async function savePostLog(storyId, postId, template) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts`,
    {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ story_id: storyId, post_id: postId, template }),
    }
  );
  if (!res.ok) console.error('게시 로그 저장 실패:', await res.text());
}

// ── Copy templates A–E ───────────────────────────────────────────
// 원칙: 호기심 우선 / 사용자 중심 / 3~4문장 이내 / 첫 문장에서 시선 확보
function buildPost(story, url) {
  const n = story.reportCount;
  const silent = TOTAL_OUTLETS - n;
  const idx = Math.floor(Date.now() / 86400000) % 5;

  const templates = [
    // A — 질문 먼저, 숫자로 증명
    `당신은 이 뉴스를 보셨나요?

${TOTAL_OUTLETS}개 언론사 중 단 ${n}곳만 보도했습니다.

뉴스저울 →
${url}`,

    // B — 1인칭 발화 + 의문
    `저는 오늘 처음 봤습니다.

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 다룬 뉴스입니다.

왜 이 뉴스는 묻혔을까요?

뉴스저울 →
${url}`,

    // C — 사용자 중심, 놓친 정보 강조
    `대부분의 사람은 이 뉴스를 모릅니다.

${TOTAL_OUTLETS}개 언론사 중 단 ${n}곳만 보도했기 때문입니다.

당신은 보셨나요?

뉴스저울 →
${url}`,

    // D — 짧고 강렬, 침묵 대신 의문
    `오늘 가장 많이 침묵당한 뉴스.

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 보도.

나머지 ${silent}곳은 왜 다루지 않았을까요?

뉴스저울 →
${url}`,

    // E — 사용자 관점 + 언론 침묵 의문
    `대부분의 사람은 이 뉴스를 보지 못했습니다.

${TOTAL_OUTLETS}개 언론사 중 단 ${n}곳만 보도했습니다.

왜 ${silent}개 언론사는 이 뉴스를 다루지 않았을까요?

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
  if (!res.ok || !data.id) throw new Error('createContainer 실패: ' + JSON.stringify(data));
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
  if (!res.ok || !data.id) throw new Error('publishPost 실패: ' + JSON.stringify(data));
  return data.id;
}

// ── Handler ──────────────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

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
    const templateLabel = ['A', 'B', 'C', 'D', 'E'][templateIdx];

    console.log('포스팅 내용:\n', text);

    // dry=true → 실제 게시 없이 미리보기만 반환
    const isDry = event.queryStringParameters?.dry === 'true';
    if (isDry) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ dry: true, template: templateLabel, title: story.title, reportCount: story.reportCount, url, text }),
      };
    }

    if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }),
      };
    }

    // 중복 게시 방지 — 24시간 내 동일 Story 재게시 차단
    const recent = await getRecentPost(story.id);
    if (recent) {
      console.log('중복 게시 차단:', story.id, '/ 마지막 게시:', recent.posted_at);
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          skipped: true,
          reason: '24시간 내 동일 기사 이미 게시됨',
          storyId: story.id,
          lastPostedAt: recent.posted_at,
          lastPostId: recent.post_id,
        }),
      };
    }

    const containerId = await createContainer(text);
    await new Promise(r => setTimeout(r, 3000));
    const postId = await publishPost(containerId);

    // 게시 로그 저장
    await savePostLog(story.id, postId, templateLabel);

    console.log('Threads 게시 완료:', postId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, postId, template: templateLabel, title: story.title, reportCount: story.reportCount, url }),
    };
  } catch (e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
