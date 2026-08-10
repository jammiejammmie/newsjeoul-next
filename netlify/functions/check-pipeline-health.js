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

// 배급(Threads) 연속 실패 감지 기준. 2026-08-10 신설.
// 계기: THREADS_ACCESS_TOKEN이 08-09 05:40 PDT에 만료돼 25회 실행 47건이 전부 실패했는데,
// 이 함수가 생산 단계(articles~expansion)만 보고 배급은 안 보고 있어서 24시간 동안 아무도
// 몰랐다. 생산이 멀쩡해도 배급이 죽으면 독자에게 도달하는 양은 0이다.
// "시도는 하는데 전부 실패"를 잡는다 — 후보가 없어 조용한 시간대(시도 0)는 정상이므로 제외.
const DISTRIBUTION_FAIL_WINDOW = 10;  // 최근 실행 10회(≈5시간) 표본
const DISTRIBUTION_MIN_ATTEMPTS = 5;  // 이만큼 시도했는데 0건 성공이면 이상
const TOKEN_EXPIRY_WARN_DAYS = 14;    // 자동 갱신 주기가 30일이라, 여기 닿으면 2회 연속 실패한 것

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

// 배급 채널이 "시도는 하는데 전부 실패"하고 있으면 사유까지 붙여서 문제로 올린다.
// 사유(distribution_skip_log.detail.error)를 함께 보내야 알림만 보고 바로 대응할 수 있다 —
// 토큰 만료인지 Claude 실패인지에 따라 조치가 완전히 다르다.
async function checkDistribution(channel) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/distribution_run_log` +
    `?select=run_at,posts_attempted,posts_succeeded&channel=eq.${channel}` +
    `&order=run_at.desc&limit=${DISTRIBUTION_FAIL_WINDOW}`,
    { headers: HEADERS }
  );
  if (!r.ok) return null;
  const runs = await r.json();
  if (!Array.isArray(runs) || !runs.length) return null;

  const attempted = runs.reduce((s, v) => s + (v.posts_attempted || 0), 0);
  const succeeded = runs.reduce((s, v) => s + (v.posts_succeeded || 0), 0);
  if (succeeded > 0 || attempted < DISTRIBUTION_MIN_ATTEMPTS) return null;

  let why = '';
  try {
    const f = await fetch(
      `${SUPABASE_URL}/rest/v1/distribution_skip_log` +
      `?select=reason,detail&channel=eq.${channel}&reason=neq.distribution_threshold` +
      `&order=run_at.desc&limit=1`,
      { headers: HEADERS }
    );
    if (f.ok) {
      const [last] = await f.json();
      if (last) why = ` — 최근 사유 ${last.reason}: ${String(last.detail?.error || '').slice(0, 200)}`;
    }
  } catch { /* 사유 조회 실패는 알림 자체를 막지 않는다 */ }

  return `배급(${channel}): 최근 ${runs.length}회 실행에서 ${attempted}건 시도 전부 실패(성공 0)${why}`;
}

// 토큰이 끊기기 "전에" 부른다. 연속 실패 감지는 이미 터진 뒤라 최소 몇 시간을 잃는다.
// 만료된 토큰은 갱신이 불가능하므로(재발급만 가능) 남은 기간이 줄어드는 것 자체가 사고 신호다.
async function checkThreadsToken() {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_credentials?select=expires_at,last_refreshed_at,refresh_error&id=eq.threads&limit=1`,
    { headers: HEADERS }
  );
  if (!r.ok) return null;           // 테이블 도입 전에는 조용히 넘어간다
  const [row] = await r.json();
  if (!row) return null;

  const out = [];
  if (row.refresh_error) {
    out.push(`Threads 토큰 자동 갱신 실패 — ${String(row.refresh_error).slice(0, 200)}`);
  }
  if (row.expires_at) {
    const daysLeft = (new Date(row.expires_at).getTime() - Date.now()) / 86400000;
    // 갱신 주기가 30일이라 두 번 연속 실패해야 이 선에 닿는다. 여기 닿으면 사람이 봐야 한다.
    if (daysLeft <= TOKEN_EXPIRY_WARN_DAYS) {
      out.push(`Threads 토큰 만료 ${Math.floor(daysLeft)}일 전(${row.expires_at}) — 자동 갱신이 밀리고 있다`);
    }
  }
  return out.length ? out : null;
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

    const distributionProblem = await checkDistribution('threads');
    if (distributionProblem) problems.push(distributionProblem);

    const tokenProblems = await checkThreadsToken();
    if (tokenProblems) problems.push(...tokenProblems);

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
