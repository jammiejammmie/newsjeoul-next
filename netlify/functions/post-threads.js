// Threads 자동 포스팅 — 발행된 Topic 중 가장 무게가 무거운(importance_score) 미게시 건.
// 근거: PM 지시(2026-07-17 "Threads 자동 게시 장애 정정 및 복구", 2026-07-19 "Threads 즉시 정상화").
//
// 2026-07-19 재작성 — 핵심 변경: 중복 방지·후보 선정을 threads_posts의 신규 컬럼(topic_id 등,
// 미적용 Migration)에 의존하지 않게 바꿨다. 기존 실제 오류 로그로 확인된 문제:
//   "threads_posts 조회 실패: column threads_posts.topic_id does not exist" (2026-07-19 04:17 UTC)
// 이제는 topics.ai_context.threads(기존에 이미 존재하는 jsonb 컬럼)만으로 핵심 동작이 전부 된다.
// threads_posts에 대한 상세 로그 INSERT는 best-effort로 남기되, 실패해도 핵심 동작(중복방지·게시)에는
// 영향이 없다 — 단, 이 실패는 더 이상 조용히 삼키지 않고 명확히 표시한다(아래 savePostLog 참고).
//
// 순서(비용 보호): 자격증명 확인 → 후보 선정(+중복 확인) → (dry면 여기서 미리보기 반환) →
// Claude 문구 생성 → Threads 게시 → 성공 기록. 자격증명이 없거나 후보가 없으면 Claude를 호출하지 않는다.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const BASE_URL = 'https://newsjeoul.co.kr';
const REQUEST_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

// ── Data ─────────────────────────────────────────────────────────
// 후보 Topic 선정 — Migration 비의존(topics.ai_context.threads만 사용). 반환값 null이면 정상 상태(오류 아님).
// 선정 기준: 발행 완료 + 완성된 draft(lead+blocks) + 원문 출처 URL 존재 + 24시간 내 미게시 +
// 무게(importance_score) 높은 순. 2026-07-19: 이미지 우선순위 제거(텍스트 중심 개편 — Threads 게시는
// 원래도 TEXT 전용이라 이미지 유무는 선정 기준에서 의미가 없었다).
async function fetchCandidateTopic() {
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,slug,name,summary,importance_score,ai_context` +
    `&status=eq.active&editorial_status=eq.published` +
    `&or=(ai_context->threads->>posted_at.is.null,ai_context->threads->>posted_at.lt.${encodeURIComponent(cutoff)})` +
    `&order=importance_score.desc&limit=10`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) throw new Error('topics 조회 실패: ' + await res.text());
  const rows = await res.json();

  // 완성도 확인 — 원문 기사 URL 확인을 위해 evidence.sources도 같이 체크
  const complete = rows.filter((t) => {
    const draft = t.ai_context?.draft;
    const evidence = t.ai_context?.evidence;
    return draft && draft.lead && Array.isArray(draft.blocks) && draft.blocks.length > 0
      && evidence?.sources?.some((s) => s.url);
  });
  return complete[0] || null;
}

// ── Post log(상세, best-effort) ──────────────────────────────────
// 실패해도 핵심 동작(dedup은 이미 ai_context.threads에 기록된 뒤이므로 안전)에 영향 없지만,
// 더 이상 조용히 삼키지 않는다 — 호출부에서 성공/실패를 구분해 반환값에 반영한다.
async function savePostLog(fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/threads_posts`, {
    method: 'POST',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error('THREADS_LOG_SAVE_FAILED(핵심 동작에는 영향 없음, 상세 로그만 누락):', detail);
    return { ok: false, detail };
  }
  return { ok: true };
}

// 핵심 dedup 기록 — 기존 ai_context merge 패턴 재사용, 이 프로젝트 전체에서 이미 검증된 방식.
async function markTopicPosted(topic, postId, hookType) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topic.id}`, {
    method: 'PATCH',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      ai_context: { ...(topic.ai_context || {}), threads: { posted_at: new Date().toISOString(), post_id: postId, hook_type: hookType } },
    }),
  });
  if (!res.ok) throw new Error('핵심 dedup 기록 실패(topics.ai_context.threads): ' + await res.text());
}

// ── Hook 기반 Threads 문구 생성(PM 지시 2026-07-17) ─────────────────
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
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
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
  const params = new URLSearchParams({ media_type: 'TEXT', text, access_token: THREADS_ACCESS_TOKEN });
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('createContainer 실패: ' + JSON.stringify(data));
  return data.id;
}

async function publishPost(containerId) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: THREADS_ACCESS_TOKEN });
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('publishPost 실패: ' + JSON.stringify(data));
  return data.id;
}

// ── Handler ──────────────────────────────────────────────────────
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 이 조건이 없으면 자동 스케줄 호출이
  // 전부 401로 조용히 거부된다. 단, 이 함수는 GitHub Actions만을 유일한 트리거로 쓰기로 결정했으므로
  // (netlify.toml의 자체 schedule 제거, Threads Final Design §1) 실제로는 이 분기를 안 타야 정상이다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const isDry = event.queryStringParameters?.dry === 'true';

  // 1. 자격증명 확인 — Claude 호출보다 반드시 먼저(비용 보호)
  if (!isDry && (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN)) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }) };
  }

  try {
    // 2. 후보 선정(+중복 확인 포함)
    const topic = await fetchCandidateTopic();
    if (!topic) {
      console.log('게시 가능한 신규 Topic 없음 — 정상 Skip');
      return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: '게시 가능한 신규 Topic 없음' }) };
    }

    const plan = topic.ai_context?.plan;
    const editors = (plan?.editors_assigned || []).map((e) => e.name);
    const baseUrl = `${BASE_URL}/topic/${topic.slug}`;

    // 3. Claude 문구 생성(여기부터 비용 발생)
    const { hookType, text: hookBody } = await generateHookCopy(topic, baseUrl);
    const url = `${baseUrl}?utm_source=threads&utm_medium=social&utm_campaign=organic_threads&utm_content=${topic.id}_${hookType}`;
    const text = hookBody.replace(baseUrl, url);

    console.log('포스팅 내용:\n', text);

    if (isDry) {
      return { statusCode: 200, headers, body: JSON.stringify({ dry: true, topicId: topic.id, hookType, editors, title: topic.name, url, text }) };
    }

    // 4. Threads 게시
    let postId;
    try {
      const containerId = await createContainer(text);
      await new Promise((r) => setTimeout(r, 3000));
      postId = await publishPost(containerId);
    } catch (postErr) {
      console.error('THREADS_POST_FAILED_AFTER_CLAUDE_CALL(Claude 비용은 이미 발생):', postErr.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: postErr.message, note: 'Claude 호출 이후 게시 단계에서 실패 — 비용은 이미 발생했을 수 있음' }) };
    }

    // 5. 핵심 dedup 기록(반드시 성공해야 함 — 실패 시 다음 실행에서 중복 게시 위험이 있으므로 예외를 던진다)
    await markTopicPosted(topic, postId, hookType);

    // 6. 상세 로그(best-effort) — 실패해도 위 핵심 기록은 이미 끝난 뒤이므로 안전
    const logResult = await savePostLog({ topic_id: topic.id, post_id: postId, hook_type: hookType, editors, status: 'success', source_url: url });

    console.log('Threads 게시 완료:', postId);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, postId, topicId: topic.id, hookType, editors, title: topic.name, url, detailLogSaved: logResult.ok }),
    };
  } catch (e) {
    console.error(e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
