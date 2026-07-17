// Threads 자동 포스팅 — 발행된 Topic 중 가장 무게가 무거운(importance_score) 미게시 건.
// 근거: PM 지시(2026-07-17, "Threads 자동 게시 장애 정정 및 복구") — 기존엔 "오늘 생성된 stories"
// 중에서만 골라 하루 중 신규 story가 없으면 예외를 던져 GitHub Actions가 "실패"로 오인했다(정상
// Skip이어야 할 상황이 장애 메일로 잘못 보고됨). 이제는 published Topic 풀(오늘 국한 아님, 최근
// 24시간 내 이미 게시된 것만 제외)에서 고른다 — 후보가 없으면 예외 대신 null을 반환해 핸들러가
// 정상 Skip(200)으로 처리한다.
//
// 하루 여러 차례 게시 지원: 매번 "최근 24시간 내 미게시" 후보 중 최상위를 고르므로, 이미 게시한
// Topic은 자동으로 후순위가 되어 같은 회차에 반복 게시되지 않는다(예전엔 story_id 단위로 결정론적
// 단일 후보만 있어 하루 여러 번 호출해도 항상 같은 것만 나왔다).
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const BASE_URL = 'https://newsjeoul.co.kr';

// ── Data ─────────────────────────────────────────────────────────
// 후보 Topic 선정 — 반환값 null이면 "지금 게시할 만한 게 없다"는 정상 상태(오류 아님).
async function fetchCandidateTopic() {
  const since = new Date(Date.now() - 86400000).toISOString();
  const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

  const recentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts?select=topic_id&posted_at=gte.${encodeURIComponent(since)}&topic_id=not.is.null`,
    { headers }
  );
  if (!recentRes.ok) throw new Error('threads_posts 조회 실패: ' + await recentRes.text());
  const recentIds = (await recentRes.json()).map((r) => r.topic_id).filter(Boolean);
  const excludeFilter = recentIds.length ? `&id=not.in.(${recentIds.join(',')})` : '';

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,slug,name,summary,importance_score,ai_context&status=eq.active&editorial_status=eq.published${excludeFilter}&order=importance_score.desc&limit=5`,
    { headers }
  );
  if (!res.ok) throw new Error('topics 조회 실패: ' + await res.text());
  const rows = await res.json();
  return rows[0] || null;
}

// ── Post log ──────────────────────────────────────────────────────
async function savePostLog(fields) {
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
      body: JSON.stringify(fields),
    }
  );
  if (!res.ok) console.error('게시 로그 저장 실패:', await res.text());
}

// ── Hook 기반 Threads 문구 생성(PM 지시 2026-07-17) ─────────────────
// 목표: 내용을 전부 알려주는 게 아니라 "못 본 절반"을 확인하고 싶게 만드는 것.
// 구조: 강한 첫 문장 → 사람들이 놓친 지점 → 답을 다 말하지 않는 정보 격차 → 뉴스저울 유도.
// 금지: 사실과 다른 과장, 본문에 없는 결론, 공포 조장, 무조건적 낚시, "충격"/"소름"/"난리 났다" 같은
// 상투어, 링크를 눌러도 답이 없는 문구.
async function generateHookCopy(topic, url) {
  const draft = topic.ai_context?.draft;
  const keywords = draft?.display_keywords || [];
  const perspectives = draft?.perspective_markers || [];

  const prompt = `너는 뉴스저울의 Threads 카피라이터다. 아래 글을 바탕으로 Threads에 올릴 짧은 문구를 만들어라.
목표: 제목만 봐서는 알 수 없는 "못 본 절반"을 확인하고 싶게 만드는 것 — 본문 내용을 전부 요약하지 마라.

문구 구조(반드시 이 순서, 줄바꿈으로 구분):
1. 강한 첫 문장(대비·의외성·질문 중 하나)
2. 사람들이 놓친 지점
3. 답을 다 말하지 않는 정보 격차(궁금증은 남기되 거짓·과장 없이)
4. 뉴스저울 유도 문장 1줄(URL은 쓰지 마라 — 별도로 붙인다)

허용: 강한 대비, 의외성, 질문, 구체적인 숫자·인물·기업·정책명, "제목만 보면 놓치는 부분", "정작 중요한 건 따로 있다"는 정보 격차.
금지: 사실과 다른 과장, 본문에 없는 결론, 공포 조장, 무조건적 낚시, "충격"·"소름"·"난리 났다" 같은 저품질 상투어 반복, 링크를 눌러도 답이 없는 문구.

제목: ${topic.name}
요약: ${topic.summary || ''}
핵심 키워드: ${keywords.join(', ') || '(없음)'}
리드: ${draft?.lead || ''}
엇갈리는 시각: ${perspectives.map((p) => `[${p.perspective}] ${p.claim}`).join(' / ') || '(없음)'}

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "hook_type": "대비 또는 의외성 또는 질문 또는 정보격차 중 하나",
  "text": "Threads에 올릴 실제 문구(1~4번 구조, 줄바꿈 포함, URL 제외)"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Hook 카피 파싱 실패: ' + rawText.slice(0, 200));
  const parsed = JSON.parse(match[0]);
  const hookType = ['대비', '의외성', '질문', '정보격차'].includes(parsed.hook_type) ? parsed.hook_type : '정보격차';
  return { hookType, text: `${parsed.text}\n\n뉴스저울 →\n${url}` };
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

  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const topic = await fetchCandidateTopic();

    // 후보 없음 = 정상 Skip(오류 아님) — PM 지시: "정상 Skip은 GitHub Actions 실패로 처리하지 않음"
    if (!topic) {
      console.log('게시 가능한 신규 Topic 없음 — 정상 Skip');
      if (!isDry) await savePostLog({ status: 'skipped', failure_reason: '게시 가능한 신규 Topic 없음' });
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: '게시 가능한 신규 Topic 없음' }) };
    }

    const plan = topic.ai_context?.plan;
    const editors = (plan?.editors_assigned || []).map((e) => e.name);
    const { hookType, text: hookBody } = await generateHookCopy(topic, `${BASE_URL}/topic/${topic.slug}`);
    const url = `${BASE_URL}/topic/${topic.slug}?utm_source=threads&utm_medium=social&utm_campaign=organic_threads&utm_content=${topic.id}_${hookType}`;
    const text = hookBody.replace(`${BASE_URL}/topic/${topic.slug}`, url); // 유도 문장 안 URL에도 UTM 반영

    console.log('포스팅 내용:\n', text);

    if (isDry) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ dry: true, topicId: topic.id, hookType, editors, title: topic.name, url, text }),
      };
    }

    if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
      await savePostLog({ topic_id: topic.id, hook_type: hookType, editors, status: 'failed', failure_reason: 'THREADS_USER_ID/THREADS_ACCESS_TOKEN 환경변수 없음', source_url: url });
      return {
        statusCode: 500, headers,
        body: JSON.stringify({ error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }),
      };
    }

    let postId;
    try {
      const containerId = await createContainer(text);
      await new Promise((r) => setTimeout(r, 3000));
      postId = await publishPost(containerId);
    } catch (postErr) {
      await savePostLog({ topic_id: topic.id, hook_type: hookType, editors, status: 'failed', failure_reason: postErr.message, source_url: url });
      throw postErr;
    }

    await savePostLog({ topic_id: topic.id, post_id: postId, hook_type: hookType, editors, status: 'success', source_url: url });

    console.log('Threads 게시 완료:', postId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, postId, topicId: topic.id, hookType, editors, title: topic.name, url }),
    };
  } catch (e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
