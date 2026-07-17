// generate-updates.js
// 새로 생긴 topic_stories 연결마다 Timeline 이벤트 + Update 문장 생성
// Step 7(품질 자동 검증) + Step 8(자동 수정 1회 재시도)까지 이 함수 안에서 처리한다.
// Autonomy-First: 기준 미달이면 사람 큐에 쌓지 않고 is_published=false로 조용히 묻는다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const TIMELINE_STAGES = ['발단', '후속', '논란', '해명', '판결', '출시', '확정', '루머'];
const UPDATE_TYPES = ['new_fact', 'rumor', 'confirmed', 'correction', 'timeline', 'followup'];
const QUALITY_THRESHOLD = 60;
const BATCH_SIZE = 5; // 한 번 호출에 최대 5개 topic-story 연결만 처리 (게이트웨이 타임아웃 방지, 나머지는 다음 스케줄에서 이어서 처리)

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabasePost(table, data, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase POST ${table} error: ` + await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function claudeCall(prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function generateUpdateContent(topicName, storyTitle) {
  const prompt = `다음은 "${topicName}"라는 이슈에 새로 추가된 뉴스다.
아래 두 가지를 생성해라. 설명 없이 JSON만 반환해라.

뉴스 제목: "${storyTitle}"

1. timeline: 이 뉴스가 이슈의 어느 단계인지 (${TIMELINE_STAGES.join('/')} 중 하나로 title에 반영), event_summary(1문장, 객관적 사실 기록)
2. update: 사용자가 "오늘 새로 바뀐 것"으로 읽을 1~2문장. update_type은 (${UPDATE_TYPES.join('/')}) 중 하나. 확정되지 않은 정보면 반드시 rumor로 표기해라.

반환 형식:
{
  "timeline_title": "...",
  "timeline_summary": "...",
  "importance_score": 50,
  "update_type": "new_fact",
  "update_title": "...",
  "update_summary": "..."
}`;
  const text = await claudeCall(prompt, 600);
  return extractJson(text);
}

async function scoreQuality(text) {
  const prompt = `다음 문장의 품질을 0~100점으로 채점해라. 기준: (1) 사실처럼 보이는 과장/낚시성 표현이 없는가 (2) 문장이 자연스럽고 구체적인가(예: "A는 B와 관련이 있습니다" 같은 밋밋한 문장은 낮은 점수) (3) 미확인 정보를 확정처럼 말하지 않는가.
설명 없이 숫자만 반환해라.

문장: "${text}"`;
  const raw = await claudeCall(prompt, 20);
  const n = parseInt(raw.match(/\d+/)?.[0] || '0', 10);
  return Number.isFinite(n) ? n : 0;
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    // 아직 timeline/update가 없는 topic_stories 연결을 찾는다
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentLinks = await supabaseGet(
      'topic_stories',
      `?created_at=gte.${since}&select=topic_id,story_id,topics(name),stories(title,published_at,created_at)&order=created_at.desc&limit=100`
    );
    if (!recentLinks.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    const existingEvents = await supabaseGet('topic_timeline_events', '?select=topic_id,source_story_id');
    const doneKey = new Set(existingEvents.map(e => `${e.topic_id}:${e.source_story_id}`));
    const unprocessed = recentLinks.filter(l => l.topics && l.stories && !doneKey.has(`${l.topic_id}:${l.story_id}`)).slice(0, BATCH_SIZE);
    if (!unprocessed.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    let created = 0;
    let published = 0;
    let suppressed = 0;
    const results = [];

    for (const link of unprocessed) {
      try {
        let content = await generateUpdateContent(link.topics.name, link.stories.title);
        if (!content) continue;

        let quality = await scoreQuality(content.update_summary || content.update_title || '');

        // Step 8: 자동 수정 — 기준 미달이면 1회만 재생성 시도
        if (quality < QUALITY_THRESHOLD) {
          const retry = await generateUpdateContent(link.topics.name, link.stories.title);
          if (retry) {
            const retryQuality = await scoreQuality(retry.update_summary || retry.update_title || '');
            if (retryQuality > quality) { content = retry; quality = retryQuality; }
          }
        }

        const isPublished = quality >= QUALITY_THRESHOLD;

        if (isDry) {
          results.push({ topic_id: link.topic_id, story_id: link.story_id, content, quality, isPublished, dry: true });
          continue;
        }

        await supabasePost('topic_timeline_events', {
          topic_id: link.topic_id,
          event_date: link.stories.published_at || link.stories.created_at,
          title: content.timeline_title || link.stories.title,
          summary: content.timeline_summary || null,
          source_story_id: link.story_id,
          importance_score: content.importance_score || 50,
        }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});

        await supabasePost('topic_updates', {
          topic_id: link.topic_id,
          update_type: UPDATE_TYPES.includes(content.update_type) ? content.update_type : 'new_fact',
          title: content.update_title || link.stories.title,
          summary: content.update_summary || null,
          source_story_id: link.story_id,
          quality_score: quality,
          is_published: isPublished,
        });

        created++;
        if (isPublished) published++; else suppressed++;
        results.push({ topic_id: link.topic_id, story_id: link.story_id, quality, isPublished });
      } catch (e) {
        console.error('generate-updates 링크 처리 오류:', link.topic_id, link.story_id, e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dry: isDry, created, published, suppressed, results: isDry ? results : undefined }),
    };
  } catch (e) {
    console.error('generate-updates 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
