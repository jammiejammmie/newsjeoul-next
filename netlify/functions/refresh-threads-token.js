// refresh-threads-token.js — Threads 장기 토큰을 만료 전에 자동 연장한다.
//
// 계기(2026-08-10): 토큰이 08-09에 만료되면서 Threads 발행이 24시간 전면 중단됐다.
// Threads 장기 토큰은 60일짜리이고, "24시간 이상 지났고 아직 만료되지 않은" 동안에만
// GET /refresh_access_token 으로 다시 60일을 받을 수 있다. 만료된 뒤에는 갱신이 불가능해
// 사람이 재발급해야 하므로, 만료 전에 도는 것이 이 함수의 전부다.
//
// 30일 주기로 부른다(pg_cron: nj-refresh-threads-token). 한 번 실패해도 만료까지 30일이
// 남아 있어 다음 회차에서 회복할 수 있다. 실패는 threads_credentials.refresh_error에
// 남고, check-pipeline-health가 그 값을 보고 Slack으로 알린다.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

const TOKEN_TTL_DAYS = 60;      // Threads가 주는 유효기간
const MIN_AGE_HOURS = 24;       // 이보다 어린 토큰은 Threads가 갱신을 거부한다

async function loadRow() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/threads_credentials?select=*&id=eq.threads&limit=1`, { headers: HEADERS });
  if (!r.ok) throw new Error(`threads_credentials 조회 실패(${r.status})`);
  const [row] = await r.json();
  return row || null;
}

async function saveResult(patch) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/threads_credentials?id=eq.threads`, {
    method: 'PATCH',
    headers: { ...HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`threads_credentials 갱신 실패(${r.status}): ${await r.text()}`);
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const row = await loadRow();
    if (!row?.access_token) {
      // 아직 최초 토큰이 안 들어간 상태. 실패로 시끄럽게 굴 일은 아니다.
      console.error('THREADS_TOKEN_REFRESH: threads_credentials에 토큰이 없음 — 최초 1회 수동 등록 필요');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'no_token' }) };
    }

    // 만료된 뒤에는 갱신 API가 통하지 않는다. 헛되이 부르지 말고 사람을 부른다.
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      const msg = `토큰이 이미 만료됨(${row.expires_at}) — 갱신 불가, 재발급 필요`;
      console.error('THREADS_TOKEN_REFRESH:', msg);
      await saveResult({ refresh_error: msg });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: false, reason: 'expired', error: msg }) };
    }

    // 발급 직후 24시간 안에는 Threads가 갱신을 거부한다.
    const refreshedAt = row.last_refreshed_at ? new Date(row.last_refreshed_at).getTime() : 0;
    const ageHours = (Date.now() - refreshedAt) / 3600000;
    if (refreshedAt && ageHours < MIN_AGE_HOURS) {
      console.log(`THREADS_TOKEN_REFRESH: 토큰이 ${ageHours.toFixed(1)}시간짜리 — ${MIN_AGE_HOURS}시간 미만이라 건너뜀`);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: 'too_young' }) };
    }

    const url = new URL('https://graph.threads.net/refresh_access_token');
    url.searchParams.set('grant_type', 'th_refresh_token');
    url.searchParams.set('access_token', row.access_token);

    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      // 응답에 토큰이 그대로 실릴 일은 없지만, 혹시 모를 유출을 막으려 사유만 남긴다.
      const msg = `refresh_access_token 실패(${res.status}): ${JSON.stringify(data?.error || data).slice(0, 300)}`;
      console.error('THREADS_TOKEN_REFRESH:', msg);
      await saveResult({ refresh_error: msg });
      return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: msg }) };
    }

    // Threads가 expires_in(초)을 주면 그 값을 쓰고, 없으면 60일로 본다.
    const ttlSec = Number(data.expires_in) > 0 ? Number(data.expires_in) : TOKEN_TTL_DAYS * 86400;
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    await saveResult({
      access_token: data.access_token,
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      refresh_error: null,
    });

    console.log(`THREADS_TOKEN_REFRESH: 성공 — 다음 만료 ${expiresAt}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, expiresAt }) };
  } catch (e) {
    console.error('THREADS_TOKEN_REFRESH 에러:', e.message);
    try { await saveResult({ refresh_error: e.message.slice(0, 300) }); } catch { /* 기록 실패는 삼킨다 */ }
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
