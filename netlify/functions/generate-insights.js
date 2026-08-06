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

async function claudeInsights(topics, categoryCounts) {
  const list = topics.map((t, i) => `${i}. [${t.id}] ${t.name} — ${t.summary || t.description || '(요약 없음)'} (연결된 유형: ${(t.entityTypes || []).join(', ') || '없음'})`).join('\n');
  const categoryLine = categoryCounts.map(c => `${c.category} ${c.count}건`).join(', ') || '(분류 데이터 없음)';

  const prompt = `다음은 뉴스저울이 오늘 실제로 집계한 데이터다. 이 데이터에 근거해서 "발견"처럼 느껴지는 비교/확산형 통찰 문장 3~5개를 만들어라.
반드시 아래 실제 수치나 목록에 근거해서만 말해라(근거 없는 추측 금지). 예시 스타일:
- "오늘 정치보다 경제 관련 이슈가 더 많이 연결되고 있습니다" (카테고리 건수 비교 시에만)
- "OO 이슈가 △△·□□ 등 서로 다른 분야까지 번지고 있습니다" (한 Topic이 여러 타입의 Entity와 연결된 경우만)
기사 요약이 아니라 AI의 해석이어야 한다. 확실하지 않으면 "~로 보입니다"처럼 추측으로 표현해라. 설명 없이 JSON만 반환해라.

오늘 카테고리별 이슈 건수: ${categoryLine}

오늘 주요 이슈와 연결된 실체 유형:
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
      // 2026-08-06: sonnet-5는 thinking 생략 시 adaptive thinking이 켜지고, max_tokens는
      // thinking+텍스트 합계 상한이다(전 파이프라인 공통 수정).
      thinking: { type: 'disabled' },
      max_tokens: 2000,
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
    const topics = await supabaseGet('topics', '?status=eq.active&select=id,name,summary,description&order=importance_score.desc,popularity_score.desc&limit=8');
    if (!topics.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, created: 0 }) };

    // 카테고리별 이슈 건수 — 비교형 인사이트("정치보다 경제")의 실제 근거
    const allActiveTopics = await supabaseGet('topics', '?status=eq.active&select=category').catch(() => []);
    const categoryMap = new Map();
    for (const t of allActiveTopics) {
      const c = (t.category || '').trim();
      if (!c) continue;
      categoryMap.set(c, (categoryMap.get(c) || 0) + 1);
    }
    const categoryCounts = [...categoryMap.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Topic마다 연결된 Entity의 타입 다양성 — 확산형 인사이트("식품·전력·농업까지")의 실제 근거
    const withEntities = await Promise.all(topics.map(async (t) => {
      const rows = await supabaseGet('topic_entities', `?topic_id=eq.${t.id}&select=entities(type)&order=strength_score.desc&limit=10`).catch(() => []);
      const types = [...new Set(rows.map(r => r.entities?.type).filter(Boolean))];
      return { ...t, entityTypes: types };
    }));

    const insights = await claudeInsights(withEntities, categoryCounts);

    if (isDry) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: true, topicsUsed: withEntities.length, categoryCounts, insights }) };
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
