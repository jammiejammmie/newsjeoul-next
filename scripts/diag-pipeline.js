// 일회성 진단 스크립트 — 파이프라인 전체 상태 실측(2026-08-03).
// .env.local을 직접 읽어 키를 로드한다(키 값은 출력하지 않는다).
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
});

const URL = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };

console.log('URL:', URL);
console.log('KEY type:', env.SUPABASE_SERVICE_KEY ? 'service' : 'anon');
console.log('');

async function count(table, qs = '') {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id${qs}`, {
    method: 'HEAD',
    headers: { ...H, Prefer: 'count=exact' },
  });
  if (!res.ok) return `ERR ${res.status}`;
  const range = res.headers.get('content-range');
  return range ? range.split('/')[1] : '?';
}

async function get(table, qs) {
  const res = await fetch(`${URL}/rest/v1/${table}?${qs}`, { headers: H });
  if (!res.ok) return { err: res.status, body: (await res.text()).slice(0, 300) };
  return { rows: await res.json() };
}

(async () => {
  // ── 1. 로그 테이블 3종 존재 여부 ──
  console.log('=== 로그 테이블 존재 여부 ===');
  for (const t of ['hero_history', 'distribution_skip_log', 'distribution_run_log', 'threads_posts']) {
    const r = await get(t, 'select=*&limit=1');
    console.log(`${t}: ${r.err ? `ERR ${r.err} — ${r.body}` : `OK (rows=${r.rows.length}, cols=${r.rows[0] ? Object.keys(r.rows[0]).join(',') : 'n/a'})`}`);
  }

  // ── 2. distribution_run_log 최근 기록 ──
  console.log('\n=== distribution_run_log 최근 10건 ===');
  const rl = await get('distribution_run_log', 'select=*&order=run_at.desc&limit=10');
  console.log(rl.err ? `ERR ${rl.err} ${rl.body}` : JSON.stringify(rl.rows, null, 1));

  // ── 3. skip_log 사유 분포(최근 200건) ──
  console.log('\n=== distribution_skip_log 최근 200건 사유 분포 ===');
  const sl = await get('distribution_skip_log', 'select=reason,run_at,category,editorial_score,distribution_score&order=run_at.desc&limit=200');
  if (sl.err) console.log(`ERR ${sl.err} ${sl.body}`);
  else {
    const by = {};
    sl.rows.forEach((r) => { by[r.reason] = (by[r.reason] || 0) + 1; });
    console.log(by, '| 최신:', sl.rows[0]?.run_at, '| 최고령:', sl.rows[sl.rows.length - 1]?.run_at);
  }

  // ── 4. threads_posts 실제 게시 이력 ──
  console.log('\n=== threads_posts 최근 15건 ===');
  const tp = await get('threads_posts', 'select=*&order=created_at.desc&limit=15');
  if (tp.err) console.log(`ERR ${tp.err} ${tp.body}`);
  else tp.rows.forEach((r) => console.log(` ${r.created_at} | ${r.status} | post=${r.post_id} | ed=${JSON.stringify(r.editors)} | ds=${r.distribution_score} es=${r.editorial_score}`));

  // ── 5. 생산 파이프라인 총량 ──
  console.log('\n=== 생산 총량 ===');
  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const d1 = new Date(Date.now() - 86400000).toISOString();
  const d7 = new Date(Date.now() - 7 * 86400000).toISOString();
  console.log('articles 전체:', await count('articles'));
  console.log('articles 오늘:', await count('articles', `&created_at=gte.${encodeURIComponent(today)}`));
  console.log('articles 최근24h:', await count('articles', `&created_at=gte.${encodeURIComponent(d1)}`));
  console.log('topics 전체:', await count('topics'));
  console.log('topics active:', await count('topics', '&status=eq.active'));
  console.log('topics published:', await count('topics', '&status=eq.active&editorial_status=eq.published'));
  console.log('topics published 오늘:', await count('topics', `&status=eq.active&editorial_status=eq.published&created_at=gte.${encodeURIComponent(today)}`));
  console.log('topics published 최근7d:', await count('topics', `&status=eq.active&editorial_status=eq.published&created_at=gte.${encodeURIComponent(d7)}`));

  // ── 6. Threads 게시 완료 topic 수 / 후보 풀 ──
  console.log('\n=== Threads 배급 상태 ===');
  console.log('threads posted 전체:', await count('topics', '&status=eq.active&ai_context->threads->>posted_at=not.is.null'));
  console.log('threads posted 오늘:', await count('topics', `&status=eq.active&ai_context->threads->>posted_at=gte.${encodeURIComponent(today)}`));
  console.log('미게시 후보(published):', await count('topics', '&status=eq.active&editorial_status=eq.published&ai_context->threads->>posted_at=is.null'));

  // ── 7. 카테고리 다양성: 생산 vs 게시 ──
  console.log('\n=== 카테고리 다양성 ===');
  const prod7 = await get('topics', `select=category&status=eq.active&editorial_status=eq.published&created_at=gte.${encodeURIComponent(d7)}&limit=2000`);
  if (!prod7.err) {
    const by = {};
    prod7.rows.forEach((r) => { by[r.category || 'null'] = (by[r.category || 'null'] || 0) + 1; });
    console.log('생산(최근7d):', Object.entries(by).sort((a, b) => b[1] - a[1]));
  }
  const posted = await get('topics', 'select=category,ai_context&status=eq.active&ai_context->threads->>posted_at=not.is.null&limit=500');
  if (!posted.err) {
    const by = {};
    posted.rows.forEach((r) => { by[r.category || 'null'] = (by[r.category || 'null'] || 0) + 1; });
    console.log('Threads 게시(전체):', Object.entries(by).sort((a, b) => b[1] - a[1]));
    const seq = posted.rows
      .sort((a, b) => (b.ai_context?.threads?.posted_at || '').localeCompare(a.ai_context?.threads?.posted_at || ''))
      .slice(0, 20)
      .map((r) => `${(r.ai_context?.threads?.posted_at || '').slice(5, 16)}:${r.category}`);
    console.log('최근 게시 순서(20):', seq);
  }

  // ── 8. 에디터 배정 현황 ──
  console.log('\n=== 에디터 배정 ===');
  const ed = await get('topics', `select=id,name,category,ai_context&status=eq.active&editorial_status=eq.published&created_at=gte.${encodeURIComponent(d7)}&limit=2000`);
  if (ed.err) console.log(`ERR ${ed.err} ${ed.body}`);
  else {
    let none = 0;
    const byEditor = {};
    ed.rows.forEach((r) => {
      const eds = r.ai_context?.plan?.editors_assigned || [];
      if (!eds.length) none++;
      eds.forEach((e) => { byEditor[e.name] = (byEditor[e.name] || 0) + 1; });
    });
    console.log(`최근7d published ${ed.rows.length}건 중 에디터 미배정: ${none}건 (${Math.round((none / (ed.rows.length || 1)) * 100)}%)`);
    console.log('에디터별 배정수 상위 20:', Object.entries(byEditor).sort((a, b) => b[1] - a[1]).slice(0, 20));
    console.log('배정된 서로 다른 에디터 수:', Object.keys(byEditor).length);
  }

  // ── 9. 미게시 후보 풀의 품질 게이트 통과 여부(실제 후보 30개 실측) ──
  console.log('\n=== 후보 풀 30개 품질 실측 ===');
  const pool = await get('topics', 'select=id,name,category,gate_status,importance_score,updated_at,ai_context&status=eq.active&editorial_status=eq.published&ai_context->threads->>posted_at=is.null&order=importance_score.desc&limit=30');
  if (pool.err) console.log(`ERR ${pool.err} ${pool.body}`);
  else {
    pool.rows.forEach((t) => {
      const d = t.ai_context?.draft || {};
      const bodyLen = (d.blocks || []).reduce((s, b) => s + (b.content || '').length, 0);
      const hasSrc = (t.ai_context?.evidence?.sources || []).some((s) => s.url);
      console.log(` ${String(t.importance_score).padStart(4)} | ${t.category} | body=${String(bodyLen).padStart(5)} | blocks=${(d.blocks || []).length} | lead=${(d.lead || '').length} | src=${hasSrc} | gate=${t.gate_status} | ${t.name?.slice(0, 40)}`);
    });
  }
})();
