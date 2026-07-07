// refresh-relationships.js
// topic_entities의 공유 관계(co-occurrence)로 topic_relations/entity_relations을 무료로 생성하고,
// 강도 상위 몇 개에만 배치 LLM 호출 1회로 explanation을 채운다. 최소 비용/최소 호출 설계.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const MAX_NEW_RELATIONS = 10; // 타입당 이번 실행에서 새로 만들 관계 상한
const MAX_EXPLANATIONS = 5;   // 이번 실행에서 explanation을 채울 상한 (LLM 호출은 총 1회)

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

function canonicalPair(a, b) {
  return a < b ? [a, b] : [b, a];
}

// entity_id 기준으로 묶인 topic_id들 사이에서, topic_id 기준으로 묶인 entity_id들 사이에서
// 공유 횟수를 세어 관계 후보를 만든다 (LLM 호출 없음, 순수 집계).
function buildCandidates(links, groupKey, pairKey) {
  const groups = new Map(); // groupKey value -> Set(pairKey values)
  for (const l of links) {
    const g = l[groupKey];
    const p = l[pairKey];
    if (!groups.has(g)) groups.set(g, new Set());
    groups.get(g).add(p);
  }
  const counts = new Map(); // "a|b" -> count
  for (const members of groups.values()) {
    const arr = [...members];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const [a, b] = canonicalPair(arr[i], arr[j]);
        const key = `${a}|${b}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return counts;
}

async function claudeExplanations(pairs) {
  if (!pairs.length) return [];
  const list = pairs.map((p, i) => `${i}. ${p.aName} ↔ ${p.bName}`).join('\n');
  const prompt = `다음은 뉴스저울에서 자동으로 발견한 연결 쌍이다. 각 쌍이 왜 연결되는지, 사용자가 다음 클릭을 하고 싶어지는 한 문장으로 설명해라(완결된 답이 아니라 궁금증을 남기는 문장). 설명 없이 JSON 배열만 반환해라.

${list}

반환 형식: [{"index": 0, "explanation": "..."}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch { return []; }
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
    const links = await supabaseGet('topic_entities', '?select=topic_id,entity_id');
    if (!links.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, topicRelations: 0, entityRelations: 0 }) };

    const [existingTopicRel, existingEntityRel] = await Promise.all([
      supabaseGet('topic_relations', '?select=source_topic_id,target_topic_id'),
      supabaseGet('entity_relations', '?select=source_entity_id,target_entity_id'),
    ]);
    const existingTopicKeys = new Set(existingTopicRel.map(r => `${r.source_topic_id}|${r.target_topic_id}`));
    const existingEntityKeys = new Set(existingEntityRel.map(r => `${r.source_entity_id}|${r.target_entity_id}`));

    // topic_relations 후보: 같은 entity를 공유하는 topic 쌍
    const topicCounts = buildCandidates(links, 'entity_id', 'topic_id');
    const topicCandidates = [...topicCounts.entries()]
      .map(([key, count]) => { const [a, b] = key.split('|'); return { a, b, count }; })
      .filter(c => !existingTopicKeys.has(`${c.a}|${c.b}`))
      .sort((x, y) => y.count - x.count)
      .slice(0, MAX_NEW_RELATIONS);

    // entity_relations 후보: 같은 topic에 함께 등장하는 entity 쌍
    const entityCounts = buildCandidates(links, 'topic_id', 'entity_id');
    const entityCandidates = [...entityCounts.entries()]
      .map(([key, count]) => { const [a, b] = key.split('|'); return { a, b, count }; })
      .filter(c => !existingEntityKeys.has(`${c.a}|${c.b}`))
      .sort((x, y) => y.count - x.count)
      .slice(0, MAX_NEW_RELATIONS);

    if (isDry) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ ok: true, dry: true, topicCandidates, entityCandidates }),
      };
    }

    const insertedTopicRels = [];
    for (const c of topicCandidates) {
      const [row] = await supabasePost('topic_relations', {
        source_topic_id: c.a,
        target_topic_id: c.b,
        relation_type: 'related',
        strength_score: Math.min(100, c.count * 20),
      }, 'return=representation,resolution=ignore-duplicates').catch(() => []);
      if (row) insertedTopicRels.push(row);
    }

    const insertedEntityRels = [];
    for (const c of entityCandidates) {
      const [row] = await supabasePost('entity_relations', {
        source_entity_id: c.a,
        target_entity_id: c.b,
        relation_type: 'related',
        strength_score: Math.min(100, c.count * 20),
      }, 'return=representation,resolution=ignore-duplicates').catch(() => []);
      if (row) insertedEntityRels.push(row);
    }

    // 강도 상위 MAX_EXPLANATIONS개(토픽+엔티티 합산)에만 배치 LLM 1회로 explanation 채움
    const toExplain = [...insertedTopicRels, ...insertedEntityRels]
      .sort((a, b) => (b.strength_score || 0) - (a.strength_score || 0))
      .slice(0, MAX_EXPLANATIONS);

    if (toExplain.length) {
      const nameLookupIds = new Set();
      toExplain.forEach(r => {
        if (r.source_topic_id) { nameLookupIds.add(r.source_topic_id); nameLookupIds.add(r.target_topic_id); }
        if (r.source_entity_id) { nameLookupIds.add(r.source_entity_id); nameLookupIds.add(r.target_entity_id); }
      });
      const [topicNames, entityNames] = await Promise.all([
        supabaseGet('topics', `?id=in.(${[...nameLookupIds].join(',')})&select=id,name`).catch(() => []),
        supabaseGet('entities', `?id=in.(${[...nameLookupIds].join(',')})&select=id,name`).catch(() => []),
      ]);
      const nameMap = new Map([...topicNames, ...entityNames].map(n => [n.id, n.name]));

      const pairs = toExplain.map(r => ({
        row: r,
        isTopic: !!r.source_topic_id,
        aName: nameMap.get(r.source_topic_id || r.source_entity_id) || '(알 수 없음)',
        bName: nameMap.get(r.target_topic_id || r.target_entity_id) || '(알 수 없음)',
      }));

      const explanations = await claudeExplanations(pairs).catch(() => []);
      for (const e of explanations) {
        const pair = pairs[e.index];
        if (!pair || !e.explanation) continue;
        const table = pair.isTopic ? 'topic_relations' : 'entity_relations';
        await supabasePatch(table, `?id=eq.${pair.row.id}`, { explanation: e.explanation, updated_at: new Date().toISOString() });
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        topicRelationsCreated: insertedTopicRels.length,
        entityRelationsCreated: insertedEntityRels.length,
        explained: toExplain.length,
      }),
    };
  } catch (e) {
    console.error('refresh-relationships 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
