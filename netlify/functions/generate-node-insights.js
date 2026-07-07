// generate-node-insights.js
// Topic 페이지의 "향후 전망/반대 시각"(ai_outlook/ai_counter_view)과
// Entity 페이지의 "AI 분석"(ai_analysis)을 채운다. BATCH_SIZE=5, story당 1회 호출.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 5;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
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
  if (!res.ok) throw new Error(`Supabase PATCH ${table} 실패: ` + await res.text());
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
    const topicsToFill = await supabaseGet('topics', `?status=eq.active&ai_outlook=is.null&select=id,name,summary,description&order=importance_score.desc&limit=${BATCH_SIZE}`);
    const entitiesToFill = await supabaseGet('entities', `?status=eq.active&ai_analysis=is.null&select=id,name,type,description&limit=${BATCH_SIZE}`);

    let topicsFilled = 0;
    let entitiesFilled = 0;
    const dryResults = { topics: [], entities: [] };

    for (const t of topicsToFill) {
      const prompt = `다음 이슈에 대해 (1) 향후 전망(outlook) (2) 반대 시각/다른 해석(counter_view)을 각각 2~3문장으로 작성해라. 확정된 사실이 아니라 가능성으로 표현해라. 설명 없이 JSON만 반환해라.

이슈: "${t.name}" — ${t.summary || t.description || ''}

반환 형식: {"outlook": "...", "counter_view": "..."}`;
      const text = await claudeCall(prompt, 500);
      const parsed = extractJson(text);
      if (!parsed) continue;
      if (isDry) { dryResults.topics.push({ id: t.id, name: t.name, ...parsed }); continue; }
      await supabasePatch('topics', `?id=eq.${t.id}`, { ai_outlook: parsed.outlook || null, ai_counter_view: parsed.counter_view || null });
      topicsFilled++;
    }

    for (const e of entitiesToFill) {
      const prompt = `다음 대상에 대해 지금 뉴스에서 왜 주목받는지, 어떤 흐름 속에 있는지 3문장 이내로 분석해라. 확정된 사실이 아니라 가능성으로 표현해라. 설명 없이 JSON만 반환해라.

대상: "${e.name}" (${e.type}) — ${e.description || ''}

반환 형식: {"analysis": "..."}`;
      const text = await claudeCall(prompt, 400);
      const parsed = extractJson(text);
      if (!parsed) continue;
      if (isDry) { dryResults.entities.push({ id: e.id, name: e.name, ...parsed }); continue; }
      await supabasePatch('entities', `?id=eq.${e.id}`, { ai_analysis: parsed.analysis || null });
      entitiesFilled++;
    }

    if (isDry) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: true, ...dryResults }) };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, topicsFilled, entitiesFilled }) };
  } catch (e) {
    console.error('generate-node-insights 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
