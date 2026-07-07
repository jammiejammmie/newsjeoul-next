// generate-insights.js
// 홈 "뉴스저울 Insight" 섹션용 — 오늘의 주요 Topic들을 묶어 1회 배치 LLM 호출로
// "왜 A인데 B인가" 형태의 인사이트 3~5개를 생성해 daily_insights에 저장한다.

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

async function claudeInsights(topics) {
  const list = topics.map((t, i) => `${i}. [${t.id}] ${t.name} — ${t.summary || t.description || '(요약 없음)'} (관련: ${(t.entityNames || []).join(', ') || '없음'})`).join('\n');
  const prompt = `다음은 뉴스저울이 오늘 추적 중인 주요 이슈 목록이다.
이 중 서로 연결되거나 인과관계가 있어 보이는 것들을 골라, "왜 A인데 B인가" 같은 통찰 문장 3~5개를 만들어라.
기사 요약이 아니라 AI의 해석/의견이어야 한다. 확실하지 않으면 추측이라고 표현해라. 설명 없이 JSON만 반환해라.

이슈 목록:
${list}

반환 형식:
[{"insight_text": "...", "topic_indices": [0, 3]}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
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
    const topics = await supabaseGet('topics', '?status=eq.active&select=id,name,summary,description&order=importance_score.desc,popularity_score.desc&limit=8');
    if (!topics.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, created: 0 }) };

    const withEntities = await Promise.all(topics.map(async (t) => {
      const rows = await supabaseGet('topic_entities', `?topic_id=eq.${t.id}&select=entities(name)&order=strength_score.desc&limit=3`).catch(() => []);
      return { ...t, entityNames: rows.map(r => r.entities?.name).filter(Boolean) };
    }));

    const insights = await claudeInsights(withEntities);

    if (isDry) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: true, topicsUsed: withEntities.length, insights }) };
    }

    let created = 0;
    for (const ins of insights) {
      if (!ins.insight_text) continue;
      const topicIds = (ins.topic_indices || []).map(i => withEntities[i]?.id).filter(Boolean);
      await supabasePost('daily_insights', {
        insight_text: ins.insight_text,
        topic_ids: topicIds,
      }, 'return=minimal');
      created++;
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, created }) };
  } catch (e) {
    console.error('generate-insights 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
