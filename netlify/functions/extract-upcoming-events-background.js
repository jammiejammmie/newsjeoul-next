// extract-upcoming-events-background.js
// 홈 2a "출시·마감 캘린더"를 자동으로 채우는 추출 함수.
//
// 왜 필요한가: topic_timeline_events는 "일어난 일"의 기록이다(실측 746건 전부 과거·현재).
// 파이프라인이 보도된 사실을 적는 표라 구조적으로 미래 일정이 들어오지 않는다.
// 캘린더는 "앞으로 일어날 일"이 필요하므로, 본문에 명시된 미래 날짜를 뽑아 upcoming_events에 쌓는다.
//
// 설계 원칙:
//  · 근거 없는 일정은 만들지 않는다 — 추출한 날짜마다 원문 문장(source_quote)을 함께 저장하고,
//    화면은 source_quote가 없는 행을 표시하지 않는다. 모델이 날짜를 상상해 넣는 것을 막는 장치다.
//  · 추론하지 않는다 — "다음 달", "곧" 같은 표현은 버린다. 본문에 명시된 날짜만 받는다.
//  · 과거 날짜는 버린다 — 캘린더의 목적이 앞으로의 일정이다.
//  · 재실행 안전 — (topic_id, event_date, title) unique로 중복 적재를 DB가 막는다.
//
// Background Function(15분 예산) — Claude 호출이 batch당 최대 BATCH_SIZE회다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// 한 번에 볼 Topic 수. 건당 Claude 1회이므로 비용·시간과 직결된다.
const BATCH_SIZE = 12;
// 추출 대상 — 최근 갱신된 published Topic. 오래된 이슈에서 미래 일정이 나올 확률은 낮다.
const LOOKBACK_HOURS = 72;
// 너무 먼 미래는 신뢰도가 낮고 캘린더에도 쓸모가 없다.
const MAX_DAYS_AHEAD = 180;
const VALID_KINDS = ['release', 'deadline', 'announcement', 'other'];

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} 실패: ` + await res.text());
  return res.json();
}

async function supabaseUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      // unique 제약 충돌은 정상 상황(같은 일정을 다시 추출) — 조용히 무시한다.
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} 실패: ` + await res.text());
}

function bodyTextOf(topic) {
  const d = topic.ai_context?.draft || {};
  const blocks = (d.blocks || []).map((b) => b.content || '').join('\n');
  return [topic.name, topic.summary || '', d.lead || '', blocks].filter(Boolean).join('\n').slice(0, 6000);
}

async function extractEvents(topic, todayIso) {
  const prompt = `아래 기사 본문에서 **앞으로 일어날 일정**만 뽑아라. 오늘은 ${todayIso}다.

규칙(어기면 안 된다):
1. 본문에 **명시된 날짜**만 뽑는다. "다음 달", "곧", "연내"처럼 날짜가 특정되지 않은 표현은 버린다.
2. 날짜를 추측하거나 계산해서 만들지 마라. 본문에 없으면 뽑지 않는다.
3. 오늘(${todayIso}) 이전 날짜는 버린다. 이미 지난 일은 일정이 아니다.
4. 각 항목마다 그 날짜가 적힌 **본문 문장을 그대로** source_quote에 넣어라. 요약하지 마라.
   문장을 그대로 옮길 수 없으면 그 항목을 아예 넣지 마라.
5. 해당하는 일정이 없으면 빈 배열을 반환한다. 억지로 채우지 마라.

kind는 다음 중 하나:
- release: 출시·오픈·판매 시작·물량 공개
- deadline: 신청·접수 마감, 제도 종료
- announcement: 발표·공개·심사 결과 예정
- other: 위에 없는 예정 일정

제목: ${topic.name}
본문:
${bodyTextOf(topic)}

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{"events":[{"date":"YYYY-MM-DD","title":"일정 이름(20자 내)","kind":"release","source_quote":"본문 문장 그대로"}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`파싱 실패(응답구조 ${JSON.stringify({ stop: data.stop_reason, blocks: (data.content || []).map((b) => b.type), len: raw.length })})`);
  const parsed = JSON.parse(m[0]);
  return Array.isArray(parsed.events) ? parsed.events : [];
}

// 모델 출력을 그대로 믿지 않는다. 규칙 위반을 코드가 다시 걸러낸다 —
// 프롬프트로 "하지 마라"고 적는 것과 실제로 못 하게 막는 것은 다르다.
function validateEvents(events, topic, todayIso) {
  const today = Date.parse(todayIso + 'T00:00:00Z');
  const maxDate = today + MAX_DAYS_AHEAD * 86400000;
  const body = bodyTextOf(topic);
  const out = [];
  const rejected = [];

  for (const e of events) {
    const date = typeof e?.date === 'string' ? e.date.trim() : '';
    const title = typeof e?.title === 'string' ? e.title.trim() : '';
    const quote = typeof e?.source_quote === 'string' ? e.source_quote.trim() : '';
    const kind = VALID_KINDS.includes(e?.kind) ? e.kind : 'other';

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { rejected.push(`날짜형식(${date})`); continue; }
    const ts = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(ts)) { rejected.push(`날짜파싱(${date})`); continue; }
    if (ts < today) { rejected.push(`과거(${date})`); continue; }
    if (ts > maxDate) { rejected.push(`너무먼미래(${date})`); continue; }
    if (!title) { rejected.push('제목없음'); continue; }
    if (!quote) { rejected.push(`근거없음(${date})`); continue; }

    // ★ 핵심 검증: source_quote가 실제로 본문에 있는 문장인지 확인한다.
    // 모델이 문장을 지어내면 여기서 걸린다. 공백·따옴표 차이는 무시하고 비교한다.
    const norm = (s) => s.replace(/[\s"'"'「」]/g, '');
    if (!norm(body).includes(norm(quote).slice(0, 40))) {
      rejected.push(`본문불일치(${date})`);
      continue;
    }

    out.push({
      topic_id: topic.id,
      event_date: date,
      title: title.slice(0, 80),
      kind,
      source_quote: quote.slice(0, 400),
    });
  }
  return { valid: out, rejected };
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled/pg_cron 호출은 x-admin-key로 온다(2026-07-17 확인된 패턴).
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const todayIso = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
    const topics = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.published&updated_at=gte.${encodeURIComponent(since)}` +
      `&select=id,name,summary,ai_context&order=importance_score.desc&limit=${BATCH_SIZE}`
    );

    const stats = { considered: topics.length, extracted: 0, saved: 0, failed: 0 };
    const rejectReasons = {};
    const samples = [];
    const rows = [];

    for (const t of topics) {
      try {
        const raw = await extractEvents(t, todayIso);
        const { valid, rejected } = validateEvents(raw, t, todayIso);
        stats.extracted += raw.length;
        rejected.forEach((r) => {
          const key = r.replace(/\(.*\)/, '');
          rejectReasons[key] = (rejectReasons[key] || 0) + 1;
        });
        rows.push(...valid);
        if (valid.length && samples.length < 5) {
          samples.push({ topic: t.name, events: valid.map((v) => `${v.event_date} ${v.title}`) });
        }
      } catch (e) {
        stats.failed++;
        console.error(`UPCOMING_EXTRACT_FAILED: ${t.id} (${t.name}):`, e.message);
      }
    }

    if (rows.length && !isDry) {
      await supabaseUpsert('upcoming_events', rows);
      stats.saved = rows.length;
    }

    console.log(
      `UPCOMING_EXTRACT_DONE${isDry ? '[dry]' : ''}: 대상 ${stats.considered} → 모델추출 ${stats.extracted}` +
      ` → 검증통과 ${rows.length} → 저장 ${stats.saved}, 실패 ${stats.failed}` +
      ` | 반려 ${JSON.stringify(rejectReasons)}`
    );

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dry: isDry, ...stats, validated: rows.length, rejectReasons, samples }),
    };
  } catch (e) {
    console.error('UPCOMING_EXTRACT_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports._testUtils = { validateEvents, VALID_KINDS, MAX_DAYS_AHEAD };
