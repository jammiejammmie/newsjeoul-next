// Threads 자동 포스팅 — 오늘의 침묵지수 TOP1
// Copy template rotates A→O(15종) daily so the Threads profile never looks repetitive.
// 발행 빈도는 하루 1회 그대로 유지한다 — 매시간 발행은 비용/리스크 항목으로 별도 승인 전까지 보류.
// 템플릿 배열을 늘리기만 하면 30~50개까지 확장 가능한 구조.

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

// Node 중심 전환: 이 story가 속한 Topic이 있으면 Topic 링크를 우선 사용한다.
// 침묵지수 카피는 그대로 유지한다 — 대기업이 못 오는 유일한 틈새이자 핵심 신뢰 트리거.
async function findConnectedTopic(storyId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topic_stories?story_id=eq.${storyId}&select=topics(slug,name)&order=relevance_score.desc&limit=1`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0]?.topics || null;
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

// ── Copy templates A–O (15종) ─────────────────────────────────────
// 원칙: 호기심 우선 / 사용자 중심 / 3~4문장 이내 / 첫 문장에서 시선 확보
// 전부 뉴스저울 내부 Topic/Story 링크로 유입시킨다.
function buildPost(story, url) {
  const n = story.reportCount;
  const silent = TOTAL_OUTLETS - n;
  const templates = TEMPLATES(story, url, n, silent);
  const idx = Math.floor(Date.now() / 86400000) % templates.length;
  return templates[idx];
}

function TEMPLATES(story, url, n, silent) {
  return [
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

    // F — "오늘 사람들이 놓친 뉴스" 브랜드 콘텐츠
    `오늘 사람들이 놓친 뉴스.

"${story.title}"

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 다뤘습니다.

뉴스저울 →
${url}`,

    // G — 오늘의 시그널
    `오늘의 시그널.

${silent}개 언론사가 조용히 지나간 뉴스가 있습니다.

뉴스저울 →
${url}`,

    // H — 숫자로 보는 오늘
    `숫자로 보는 오늘.

${n} / ${TOTAL_OUTLETS}.

이 비율이 무엇을 의미하는지, 뉴스저울에서 확인하세요.

${url}`,

    // I — 5초 브리핑
    `5초 브리핑.

"${story.title}"

이 뉴스, 오늘 ${n}곳만 다뤘습니다.

뉴스저울 →
${url}`,

    // J — 오해하기 쉬운 뉴스
    `오늘 오해하기 쉬운 뉴스가 있습니다.

${TOTAL_OUTLETS}개 언론사 중 ${n}곳만 보도해서, 대부분 놓쳤을 가능성이 높습니다.

뉴스저울 →
${url}`,

    // K — 짧은 질문형
    `오늘, 이 뉴스 보셨나요?

${n}/${TOTAL_OUTLETS}개 언론사만 다뤘습니다.

${url}`,

    // L — 데이터 관찰자 톤
    `뉴스저울이 오늘 관찰한 것.

"${story.title}" — 보도한 언론사 ${n}곳.

나머지는 왜 조용했을까요?

${url}`,

    // M — 놓친 뉴스 직접 지목
    `당신이 오늘 놓쳤을 가능성이 높은 뉴스.

${TOTAL_OUTLETS}개 중 ${n}개 언론사만 보도.

뉴스저울 →
${url}`,

    // N — 궁금증 유발형
    `왜 이 뉴스는 ${silent}개 언론사가 다루지 않았을까요?

궁금하다면, 뉴스저울에서 맥락을 확인하세요.

${url}`,

    // O — 짧고 임팩트 있는 한 줄
    `오늘의 침묵: ${n}/${TOTAL_OUTLETS}.

"${story.title}"

${url}`,
  ]
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

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const story = await fetchTopSilenceStory();
    const connectedTopic = await findConnectedTopic(story.id).catch(() => null);
    const baseUrl = connectedTopic ? `${BASE_URL}/topic/${connectedTopic.slug}` : `${BASE_URL}/story/${story.id}`;

    // 템플릿은 baseUrl 기준으로 고른다 (템플릿 개수는 url 내용과 무관하게 고정이므로 순서 영향 없음)
    const templateCount = TEMPLATES(story, baseUrl, story.reportCount, TOTAL_OUTLETS - story.reportCount).length;
    const templateIdx = Math.floor(Date.now() / 86400000) % templateCount;
    const templateLabel = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[templateIdx] || `#${templateIdx}`;

    // UTM 부착 — 내부 로그/분석용. 게시 빈도·로직에는 영향 없음.
    const url = `${baseUrl}?utm_source=threads&utm_medium=social&utm_campaign=${templateLabel}`;
    const text = buildPost(story, url);

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
