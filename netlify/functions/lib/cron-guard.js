// cron-guard.js — Scheduler/Worker 분리 공용 모듈(PM 지시 2026-07-17, Cron 복구 Phase 2)
//
// 설계 원칙: Scheduler(이 모듈을 쓰는 얇은 함수)는 실제 업무 로직·DB 쓰기·Claude API 호출을 하지
// 않는다. Netlify의 schedule 설정이 가리키는 건 Scheduler뿐이고, Scheduler는 (1) 중복/동시 실행
// 방지, (2) 최소 실행 간격(빈도 제한) 확인, (3) 실제 워커 함수를 서버측 ADMIN_KEY로 호출, (4) 결과를
// 감사 로그에 남기는 일만 한다. 이렇게 하면 Scheduler의 공개 URL이 위조 호출을 당하더라도(x-nf-event
// 헤더는 스푸핑 가능 — 2026-07-17 발견) 실제 피해는 "정상 실행을 한 번 더 요청한 것"으로 제한되고,
// 잠금·빈도 제한 덕분에 그마저도 대부분 정상 Skip으로 흡수된다.
//
// 워커 함수 자체는 반드시 실제 관리자 키(x-admin-key)를 요구해야 한다 — Scheduler가 서버측에서
// process.env.ADMIN_KEY를 그대로 붙여서 호출하므로, 워커의 보안 수준은 오히려 이전보다 높아진다
// (외부에서 워커를 직접 호출하려면 여전히 진짜 관리자 키가 필요 — x-nf-event 우회 없음).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SITE_URL = process.env.URL || 'https://newsjeoul.co.kr';
const ADMIN_KEY = process.env.ADMIN_KEY;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error('Supabase GET 실패: ' + await res.text());
  return res.json();
}

async function supabaseUpsert(table, data, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table} 실패: ` + await res.text());
}

async function logInvocation(stage, source, outcome, detail) {
  await fetch(`${SUPABASE_URL}/rest/v1/cron_invocations`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ stage, source, outcome, detail: detail || null }),
  }).catch((e) => console.error('cron_invocations 기록 실패:', e.message));
}

// stage: 워커 식별자(예: 'collect-news'). workerPath: 실제 워커 함수 경로(예: '/.netlify/functions/collect-news').
// minIntervalMs: 마지막 성공 실행 이후 이만큼 지나지 않았으면 정상 Skip(빈도 제한 — 위조 호출 남발 방지).
async function dispatch(event, { stage, workerPath, minIntervalMs = 60000 }) {
  const source = event.headers?.['x-nf-event'] === 'schedule' ? 'schedule' : (event.headers?.['x-admin-key'] ? 'manual' : 'unknown');

  const [lock] = await supabaseGet('cron_locks', `?stage=eq.${stage}&select=*`);
  const now = Date.now();

  if (lock?.running) {
    await logInvocation(stage, source, 'skipped_locked', '이미 실행 중');
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'already_running' }) };
  }
  if (lock?.last_success_at && now - new Date(lock.last_success_at).getTime() < minIntervalMs) {
    await logInvocation(stage, source, 'skipped_too_soon', `마지막 성공: ${lock.last_success_at}`);
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true, reason: 'too_soon' }) };
  }

  await supabaseUpsert('cron_locks', { stage, running: true, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }, 'stage');

  try {
    const res = await fetch(`${SITE_URL}${workerPath}`, {
      method: 'POST',
      headers: { 'x-admin-key': ADMIN_KEY },
    });
    const ok = res.ok;
    const bodyText = await res.text().catch(() => '');
    await supabaseUpsert(
      'cron_locks',
      { stage, running: false, last_success_at: ok ? new Date().toISOString() : (lock?.last_success_at || null), updated_at: new Date().toISOString() },
      'stage'
    );
    await logInvocation(stage, source, ok ? 'dispatched' : 'worker_error', bodyText.slice(0, 500));
    return { statusCode: ok ? 200 : 502, body: bodyText || JSON.stringify({ ok }) };
  } catch (e) {
    await supabaseUpsert('cron_locks', { stage, running: false, updated_at: new Date().toISOString() }, 'stage').catch(() => {});
    await logInvocation(stage, source, 'worker_error', e.message);
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
}

module.exports = { dispatch };
