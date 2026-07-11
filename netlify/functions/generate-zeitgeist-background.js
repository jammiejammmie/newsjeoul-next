// generate-zeitgeist-background.js — Editorial Engine Layer 0
// 근거: docs/newsjeoul-editorial-engine-architecture.md §5, DEC-001
// 오늘 활성 토픽 전체를 훑어 "오늘의 화두" 태그를 하루 1번만 생성한다. 이벤트(토픽)마다
// 반복 추출하지 않고, generate-editorial-plan-background.js가 이 값을 참조만 하도록 분리했다.
//
// Background Function(2026-07-11): 365일 무인 운영 목표에 맞춰 Cron 자동 호출 전제로 전환
// (운영은 자동, 관리자 버튼은 개발·검증용). 호출 자체는 가벼워 26초 캡과는 무관했지만,
// 나머지 두 함수와 같은 실행 방식·전제를 맞추기 위해 함께 전환했다.

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

async function supabaseUpsert(table, data, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} error: ` + await res.text());
}

async function claudeExtractZeitgeist(topics) {
  const list = topics.map((t) => `- [${t.category || '미분류'}] ${t.name}: ${t.summary || ''}`).join('\n');
  const prompt = `아래는 오늘 뉴스저울에서 활성 상태인 이슈(Topic) 목록이다. 이 목록 전체를 보고
"오늘 반복적으로 등장하는 화두" 5~10개를 뽑아라. 개별 이슈 제목을 그대로 베끼지 말고, 여러 이슈를
관통하는 더 상위의 키워드/흐름으로 추출해라(예: 여러 이슈에 전동화·가격논쟁·AI규제 얘기가 겹치면
"전동화", "가격논쟁", "AI규제"처럼). 설명 없이 JSON 배열만 반환해라.

오늘의 활성 이슈:
${list}

반환 형식: ["태그1", "태그2", ...]`;

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
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
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

  try {
    const topics = await supabaseGet('topics', '?status=eq.active&select=name,summary,category&order=updated_at.desc&limit=60');
    if (!topics.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, tags: [], note: '활성 토픽 없음' }) };
    }

    const tags = await claudeExtractZeitgeist(topics);
    const today = new Date().toISOString().slice(0, 10); // UTC 기준 YYYY-MM-DD

    await supabaseUpsert('daily_zeitgeist', {
      date: today,
      tags,
      generated_at: new Date().toISOString(),
    }, 'date');

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, date: today, tags }) };
  } catch (e) {
    console.error('generate-zeitgeist 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
