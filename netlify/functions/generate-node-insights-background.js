// generate-node-insights-background.js
// Topic 페이지의 "향후 전망/반대 시각"(ai_outlook/ai_counter_view)과
// Entity 페이지의 "AI 분석"(ai_analysis)을 채운다. BATCH_SIZE=5, story당 1회 호출.
//
// 2026-08-03: 두 가지를 함께 고쳤다(둘 다 실제 운영 로그/DB 실측으로 확인).
//
// (1) ai_context를 통째로 덮어쓰던 치명적 버그 — 이 파일이 이 저장소에서 유일하게
//     `ai_context: context`로 교체 저장을 하고 있었다(다른 모든 writer는
//     `ai_context: { ...(topic.ai_context || {}), 새필드 }` 형태로 병합한다).
//     ai_context는 plan(에디터 배정)/draft(장문)/evidence(출처)/threads(게시 dedup)/
//     engines(점수 기록)의 SSOT다. 이 함수는 `ai_outlook=is.null` 토픽을 고르는데,
//     에디터 배정(plan)은 draft보다 먼저 기록되므로 "plan은 있고 ai_outlook은 아직 null"인
//     구간이 정상적으로 존재한다 — 그 구간의 토픽을 집으면 plan이 그대로 사라졌다.
//     실측(2026-08-03): 위험 구간에 191건이 대기 중이었고, ai_context에 insights 키만 남은
//     피해 토픽 2건을 확인했다("국민의힘 전당대회 기탁금 논란", "경북 폭우 피해").
//     같은 유형의 버그가 2026-07-11 generate-editorial-plan에서도 발생해 그 파일에는 이미
//     경고 주석이 있다 — 이 파일만 누락돼 있었다.
//
// (2) 동기 함수 26초 하드캡 초과(504 Inactivity Timeout) — 최대 10회 Claude 호출
//     (topic 5건 x 1200토큰 + entity 5건 x 400토큰)이 매번 캡을 넘겨 daily-insights-batch가
//     계속 실패했다. netlify.toml의 timeout=90은 동기 함수에는 적용되지 않는다.
//     저장소의 확립된 패턴(process-stories/resolve-topics/generate-updates)대로
//     Background Function으로 전환했다 — 호출자는 즉시 202를 받고 결과는 함수 로그로 확인한다.

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
    // ai_context를 함께 읽어온다 — 저장할 때 병합해야 하므로 기존 값이 반드시 필요하다(위 (1) 참고).
    const topicsToFill = await supabaseGet('topics', `?status=eq.active&ai_outlook=is.null&select=id,name,summary,description,category,ai_context&order=importance_score.desc&limit=${BATCH_SIZE}`);
    const entitiesToFill = await supabaseGet('entities', `?status=eq.active&ai_analysis=is.null&select=id,name,type,description&limit=${BATCH_SIZE}`);

    let topicsFilled = 0;
    let entitiesFilled = 0;
    const dryResults = { topics: [], entities: [] };

    for (const t of topicsToFill) {
      const prompt = `다음 이슈에 대해 아래 8가지를 작성해라. 확정된 사실이 아니라 가능성으로 표현하고, 근거 없는 단정은 하지 마라. 설명 없이 JSON만 반환해라.

이슈: "${t.name}" (분야: ${t.category || '미분류'}) — ${t.summary || t.description || ''}

1. outlook: 향후 전망 2~3문장
2. counter_view: 반대 시각/다른 해석 2~3문장
3. industry_impact: 이 이슈가 관련 산업에 미치는 영향 2~3문장
4. historical_comparison: 최근 1~2년 내 비슷한 성격의 사건과 비교 2~3문장 (구체적 사례가 떠오르지 않으면 "뚜렷한 선례를 찾기 어렵다"고 써라)
5. international_response: 해외에서는 유사 사안에 어떻게 대응했는지 2~3문장 (모르면 위와 동일하게 솔직히 써라)
6. watchpoints: 앞으로 주목해야 할 변화 3가지 (배열, 각 항목 1문장)
7. similar_cases: 구조가 비슷한 다른 사건 1~2개 (배열, 각 항목 1문장, 없으면 빈 배열)
8. related_issues: 이 이슈를 이해하면 함께 이해되는 다른 이슈 1~2개 (배열, 각 항목 1문장, 없으면 빈 배열)

반환 형식: {"outlook": "...", "counter_view": "...", "industry_impact": "...", "historical_comparison": "...", "international_response": "...", "watchpoints": ["...", "...", "..."], "similar_cases": ["..."], "related_issues": ["..."]}`;
      const text = await claudeCall(prompt, 1200);
      const parsed = extractJson(text);
      if (!parsed) continue;
      const { outlook, counter_view, ...context } = parsed;
      if (isDry) { dryResults.topics.push({ id: t.id, name: t.name, outlook, counter_view, context }); continue; }
      // 반드시 병합 저장 — 교체하면 plan/draft/evidence/threads/engines가 전부 사라진다.
      // (story 페이지가 aiContext.industry_impact / historical_comparison 등을 최상위에서
      //  읽으므로 insights 키는 지금처럼 최상위에 둔다 — 위치는 바꾸지 않고 병합만 추가했다.)
      await supabasePatch('topics', `?id=eq.${t.id}`, {
        ai_outlook: outlook || null,
        ai_counter_view: counter_view || null,
        ai_context: { ...(t.ai_context || {}), ...context },
      });
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
