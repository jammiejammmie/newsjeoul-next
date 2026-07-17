// extract-entities.js
// story → Entity 추출 → entity_aliases 정규화 → entity_stories 연결
// Autonomy-First: 사람 개입 없이 매 파이프라인 실행마다 자동으로 돈다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const ENTITY_TYPES = ['company', 'person', 'organization', 'country', 'product', 'technology', 'market', 'policy'];
const BATCH_SIZE = 5; // 한 번 호출에 최대 5개 story만 처리 (게이트웨이 타임아웃 방지, 나머지는 다음 스케줄에서 이어서 처리)

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

// Hangul을 보존하는 slugify — 로마자 표기 없이도 라우팅 가능한 slug를 만든다.
function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `entity-${Date.now()}`;
}

async function claudeExtractEntities(storyTitle) {
  const prompt = `다음 뉴스 제목에서 등장하는 실체(Entity)를 추출해라.
유형은 반드시 다음 중 하나: ${ENTITY_TYPES.join(', ')}.
사건/이슈 자체는 추출하지 마라(그건 Entity가 아니라 Topic이다). 기업/인물/기관/국가/제품/기술/시장/정책만 추출해라.
설명 없이 JSON 배열만 반환해라. 확실하지 않으면 빈 배열을 반환해라.

제목: "${storyTitle}"

반환 형식:
[{"name": "삼성전자", "type": "company", "slug_en": "samsung-electronics"}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
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
    const parsed = JSON.parse(match[0]);
    return parsed.filter(e => e.name && ENTITY_TYPES.includes(e.type));
  } catch {
    return [];
  }
}

async function resolveEntity(name, type, slugEn, entityCache) {
  const lowerName = name.trim().toLowerCase();
  if (entityCache.has(lowerName)) return entityCache.get(lowerName);

  // alias로 기존 entity 조회
  const aliasMatch = await supabaseGet('entity_aliases', `?alias=ilike.${encodeURIComponent(name.trim())}&select=entity_id&limit=1`);
  if (aliasMatch.length) {
    const entityId = aliasMatch[0].entity_id;
    entityCache.set(lowerName, entityId);
    return entityId;
  }

  // 이름 직접 매칭
  const nameMatch = await supabaseGet('entities', `?name=ilike.${encodeURIComponent(name.trim())}&select=id&limit=1`);
  if (nameMatch.length) {
    const entityId = nameMatch[0].id;
    await supabasePost('entity_aliases', { entity_id: entityId, alias: name.trim() }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
    entityCache.set(lowerName, entityId);
    return entityId;
  }

  // 신규 생성
  const slug = (slugEn && /^[a-z0-9-]+$/.test(slugEn)) ? slugEn : slugify(name);
  const [created] = await supabasePost('entities', { name: name.trim(), type, slug });
  if (!created) return null;
  await supabasePost('entity_aliases', { entity_id: created.id, alias: name.trim() }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
  entityCache.set(lowerName, created.id);
  return created.id;
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
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentStories = await supabaseGet('stories', `?created_at=gte.${since}&select=id,title&order=created_at.desc&limit=100`);

    if (!recentStories.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    const existingLinks = await supabaseGet('entity_stories', '?select=story_id');
    const processedIds = new Set(existingLinks.map(l => l.story_id));
    const unprocessed = recentStories.filter(s => !processedIds.has(s.id)).slice(0, BATCH_SIZE);

    if (!unprocessed.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    const entityCache = new Map();
    const results = [];
    let linksCreated = 0;

    for (const story of unprocessed) {
      try {
        const candidates = await claudeExtractEntities(story.title);
        const storyResult = { story_id: story.id, title: story.title, entities: [] };

        for (const c of candidates) {
          if (isDry) {
            storyResult.entities.push({ name: c.name, type: c.type, dry: true });
            continue;
          }
          const entityId = await resolveEntity(c.name, c.type, c.slug_en, entityCache);
          if (!entityId) continue;
          await supabasePost('entity_stories', {
            entity_id: entityId,
            story_id: story.id,
            relevance_score: 100,
          }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
          storyResult.entities.push({ name: c.name, type: c.type, entity_id: entityId });
          linksCreated++;
        }
        results.push(storyResult);
      } catch (e) {
        console.error('extract-entities story 처리 오류:', story.id, e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dry: isDry, storiesProcessed: results.length, linksCreated, results: isDry ? results : undefined }),
    };
  } catch (e) {
    console.error('extract-entities 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
