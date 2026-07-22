// check-pipeline-health.js — 파이프라인 정체 자동 감지 + Slack 알림
// 근거: PM 지시(2026-07-22, Editorial Plan~Expansion 22시간 정체 사고 이후 — "운영자는 장애를
// 발견하는 사람이 아니라 시스템이 먼저 알려주는 구조여야 한다").
//
// 각 단계의 마지막 성공 시각(topics.ai_context의 각 stage 타임스탬프, articles/stories/topics의
// created_at)을 확인해 기대 주기(3시간)를 크게 넘겼거나 Editorial 백로그(pending/planned)가
// 과도하게 쌓였으면 Slack Webhook으로 알린다. SLACK_WEBHOOK_URL이 없으면 조용히 콘솔 로그만
// 남기고 끝난다(설정 전에도 배포에 문제 없도록).
//
// 자주(15~30분) 돌아도 가벼운 읽기 전용 쿼리뿐이라 동기 함수로 충분 — Background 불필요.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

// 단계별 "이 시간이 지나면 이상"으로 볼 기준(분). 3시간 주기 + 여유(1.5배)를 기본으로 하되,
// Weight/수집 체인처럼 사고가 실제로 났던 단계는 조금 더 타이트하게 잡는다.
const STALE_THRESHOLD_MIN = {
  articles: 270,        // 3시간 주기 + 50%
  stories: 270,
  topics_created: 270,
  editorial_plan: 300,
  gate: 300,
  draft: 300,
  weight: 300,
  expansion: 300,
};
const BACKLOG_ALERT_THRESHOLD = { pending: 40, planned: 60 }; // 정상 운영 중 관찰된 규모 대비 과도한 적체

async function countHead(url) {
  const r = await fetch(url, { method: 'HEAD', headers: { ...HEADERS, Prefer: 'count=exact' } });
  if (!r.ok) return null;
  return parseInt((r.headers.get('content-range') || '/0').split('/')[1], 10) || 0;
}

async function latestOf(table, col) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${col}&order=${col}.desc&limit=1`, { headers: HEADERS });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.[col] || null;
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

async function sendSlackAlert(problems, context) {
  console.error('PIPELINE_HEALTH_ALERT:', JSON.stringify({ problems, context }));
  if (!SLACK_WEBHOOK_URL) {
    console.error('PIPELINE_HEALTH_ALERT: SLACK_WEBHOOK_URL 미설정 — 콘솔 로그로만 남김');
    return;
  }
  const text = [
    '🚨 *뉴스저울 파이프라인 이상 감지*',
    ...problems.map((p) => `• ${p}`),
    `(확인 시각: ${new Date().toISOString()})`,
  ].join('\n');
  try {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (e) {
    console.error('PIPELINE_HEALTH_ALERT: Slack 전송 실패:', e.message);
  }
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const [articlesAt, storiesAt, topicsCreatedAt, pendingCount, plannedCount, topicsForStages] = await Promise.all([
      latestOf('articles', 'created_at'),
      latestOf('stories', 'created_at'),
      latestOf('topics', 'created_at'),
      countHead(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&editorial_status=eq.pending`),
      countHead(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&editorial_status=eq.planned`),
      fetch(`${SUPABASE_URL}/rest/v1/topics?select=ai_context&status=eq.active&limit=1000`, { headers: HEADERS }).then((r) => r.json()),
    ]);

    const maxOf = (arr) => arr.length ? arr.reduce((m, v) => (v && v > m ? v : m), arr[0]) : null;
    const planAt = maxOf(topicsForStages.map((t) => t.ai_context?.plan?.generated_at).filter(Boolean));
    const gateAt = maxOf(topicsForStages.map((t) => t.ai_context?.gate?.evaluated_at).filter(Boolean));
    const draftAt = maxOf(topicsForStages.map((t) => t.ai_context?.draft?.generated_at).filter(Boolean));
    const weightAt = maxOf(topicsForStages.map((t) => t.ai_context?.weight?.computed_at).filter(Boolean));
    const expansionAt = maxOf(topicsForStages.flatMap((t) => (t.ai_context?.expansion_drafts || []).map((d) => d.generated_at)).filter(Boolean));

    const checks = [
      ['articles', articlesAt, STALE_THRESHOLD_MIN.articles],
      ['stories', storiesAt, STALE_THRESHOLD_MIN.stories],
      ['topics(생성)', topicsCreatedAt, STALE_THRESHOLD_MIN.topics_created],
      ['editorial plan', planAt, STALE_THRESHOLD_MIN.editorial_plan],
      ['gate', gateAt, STALE_THRESHOLD_MIN.gate],
      ['draft', draftAt, STALE_THRESHOLD_MIN.draft],
      ['weight', weightAt, STALE_THRESHOLD_MIN.weight],
      ['expansion', expansionAt, STALE_THRESHOLD_MIN.expansion],
    ];

    const problems = [];
    checks.forEach(([label, at, threshold]) => {
      const mins = minutesSince(at);
      if (mins > threshold) {
        problems.push(`${label}: 마지막 성공 ${at || '(기록 없음)'} — ${Math.round(mins)}분째 정체(기준 ${threshold}분)`);
      }
    });
    if (pendingCount !== null && pendingCount > BACKLOG_ALERT_THRESHOLD.pending) {
      problems.push(`Editorial Plan 대기(pending) 백로그 ${pendingCount}건 — 기준(${BACKLOG_ALERT_THRESHOLD.pending}) 초과`);
    }
    if (plannedCount !== null && plannedCount > BACKLOG_ALERT_THRESHOLD.planned) {
      problems.push(`Gate/장문 대기(planned) 백로그 ${plannedCount}건 — 기준(${BACKLOG_ALERT_THRESHOLD.planned}) 초과`);
    }

    if (problems.length) {
      await sendSlackAlert(problems, { pendingCount, plannedCount });
    } else {
      console.log('PIPELINE_HEALTH_OK:', new Date().toISOString());
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, problems, pendingCount, plannedCount }) };
  } catch (e) {
    console.error('check-pipeline-health 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
