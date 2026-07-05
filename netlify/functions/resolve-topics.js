// resolve-topics.js
// story → 기존 Topic 매칭 또는 신규 Topic 생성 → topic_stories 연결 → topic_entities 집계 갱신
// manual(source_type='manual')로 만들어진 Topic도 매칭 후보에 포함된다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

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

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error(`Supabase PATCH ${table} 실패:`, await res.text());
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `topic-${Date.now()}`;
}

async function claudeResolveTopic(storyTitle, candidateTopics) {
  const candidateList = candidateTopics.length
    ? candidateTopics.map((t, i) => `${i}. [${t.id}] ${t.name} — ${t.summary || t.description || '(요약 없음)'}`).join('\n')
    : '(후보 없음)';

  const prompt = `다음은 새로 생성된 뉴스 스토리 제목과, 기존에 운영 중인 이슈(Topic) 후보 목록이다.
이 스토리가 기존 Topic 중 하나와 같은 이슈를 다루면 그 Topic에 매칭하고, 어느 것과도 다른 새로운 이슈라면 신규 Topic을 제안해라.
여러 Topic에 동시에 해당되면 여러 개를 배열로 반환해도 된다. 설명 없이 JSON만 반환해라.

스토리 제목: "${storyTitle}"

기존 Topic 후보:
${candidateList}

반환 형식 (배열):
[{"action": "match", "topic_id": "기존 topic id"}]
또는
[{"action": "new", "name": "이슈 이름", "slug_en": "kebab-case-english", "description": "1문장 설명", "summary": "AI 검색이 그대로 인용할 수 있는 자기완결형 2~3문장 요약 (주어·수치·날짜 명시)", "category": "느슨한 카테고리 텍스트"}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod) {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentStories = await supabaseGet('stories', `?created_at=gte.${since}&select=id,title&order=created_at.desc&limit=100`);
    if (!recentStories.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    const existingLinks = await supabaseGet('topic_stories', '?select=story_id');
    const processedIds = new Set(existingLinks.map(l => l.story_id));
    const unprocessed = recentStories.filter(s => !processedIds.has(s.id));
    if (!unprocessed.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    // 후보 Topic: 최근 14일 내 active/dormant 상태, source_type 무관(manual 포함)
    const candidateSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const candidateTopics = await supabaseGet(
      'topics',
      `?status=in.(active,dormant)&updated_at=gte.${candidateSince}&select=id,name,summary,description&order=updated_at.desc&limit=20`
    );

    const results = [];
    let topicsCreated = 0;
    let linksCreated = 0;

    for (const story of unprocessed) {
      try {
        const decisions = await claudeResolveTopic(story.title, candidateTopics);
        const storyResult = { story_id: story.id, title: story.title, topics: [] };

        for (const d of decisions) {
          if (isDry) {
            storyResult.topics.push({ ...d, dry: true });
            continue;
          }

          let topicId = d.topic_id;
          if (d.action === 'new') {
            const slug = (d.slug_en && /^[a-z0-9-]+$/.test(d.slug_en)) ? d.slug_en : slugify(d.name);
            const [created] = await supabasePost('topics', {
              name: d.name,
              slug,
              description: d.description || null,
              summary: d.summary || d.description || null,
              category: d.category || null,
              source_type: 'ai',
            });
            if (!created) continue;
            topicId = created.id;
            topicsCreated++;
            candidateTopics.push({ id: topicId, name: d.name, summary: d.description });
          }
          if (!topicId) continue;

          await supabasePost('topic_stories', {
            topic_id: topicId,
            story_id: story.id,
            relevance_score: 100,
          }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
          linksCreated++;

          // topic_entities 집계 갱신: 이 story에 연결된 entity들을 topic과 이어준다
          const storyEntities = await supabaseGet('entity_stories', `?story_id=eq.${story.id}&select=entity_id`);
          for (const se of storyEntities) {
            const existing = await supabaseGet('topic_entities', `?topic_id=eq.${topicId}&entity_id=eq.${se.entity_id}&select=id,strength_score`);
            if (existing.length) {
              await supabasePatch('topic_entities', `?id=eq.${existing[0].id}`, {
                strength_score: Math.min(100, (existing[0].strength_score || 50) + 5),
                updated_at: new Date().toISOString(),
              });
            } else {
              await supabasePost('topic_entities', {
                topic_id: topicId,
                entity_id: se.entity_id,
                relation_type: 'mentioned_in',
                strength_score: 50,
              }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
            }
          }

          // 마지막 확인 시각 갱신 (topics.last_checked_at)
          await supabasePatch('topics', `?id=eq.${topicId}`, { last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() });

          storyResult.topics.push({ ...d, topic_id: topicId });
        }
        results.push(storyResult);
      } catch (e) {
        console.error('resolve-topics story 처리 오류:', story.id, e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dry: isDry, storiesProcessed: results.length, topicsCreated, linksCreated, results: isDry ? results : undefined }),
    };
  } catch (e) {
    console.error('resolve-topics 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
