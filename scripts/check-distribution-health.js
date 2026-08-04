// Threads 배급 건강도 실측 — run_log(건수)와 skip_log(사유)를 함께 본다.
// 하드 실패 사유가 skip_log에 남기 시작했으므로(2026-08-03), 게시가 0건인 실행의 원인을
// Netlify 함수 로그 없이 여기서 특정할 수 있다.
const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };
const g = (t, q) => fetch(`${U}/rest/v1/${t}?${q}`, { headers: H }).then((r) => r.json());
const HARD = ['claude_failed', 'compose_failed', 'threads_api_failed', 'dedup_save_failed'];

(async () => {
  const runs = await g('distribution_run_log', 'select=*&order=run_at.desc&limit=12');
  console.log('=== 실행 이력(최근 12) ===');
  runs.forEach((r) => console.log(` ${r.run_at.slice(5, 19)} | 목표 ${String(r.daily_target).padStart(2)} | 시도 ${r.posts_attempted} 성공 ${r.posts_succeeded} | 누적 ${r.posted_after_run}${r.posts_succeeded === 0 ? '   ← 게시 0건' : ''}`));

  const skips = await g('distribution_skip_log', 'select=*&order=run_at.desc&limit=200');
  const by = {};
  skips.forEach((s) => { by[s.reason] = (by[s.reason] || 0) + 1; });
  console.log('\n=== skip_log 사유 분포(최근 200) ===');
  console.log(by);

  const hard = skips.filter((s) => HARD.includes(s.reason));
  console.log(`\n=== 하드 실패 ${hard.length}건(원인 특정용) ===`);
  if (!hard.length) console.log(' 없음 — 게시 0건 실행은 후보 부족/품질 미달 등 정상 Skip이었다는 뜻.');
  hard.forEach((s) => console.log(` ${s.run_at.slice(5, 19)} | ${s.reason} | ${s.topic_name} | ${JSON.stringify(s.detail).slice(0, 220)}`));

  const today = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const posted = await g('topics', `select=category,ai_context&status=eq.active&ai_context->threads->>posted_at=gte.${encodeURIComponent(today)}&limit=100`);
  const cat = {};
  posted.forEach((p) => { cat[p.category] = (cat[p.category] || 0) + 1; });
  console.log(`\n=== 오늘(UTC) 게시 ${posted.length}건 카테고리 ===`);
  console.log(cat);
})();
