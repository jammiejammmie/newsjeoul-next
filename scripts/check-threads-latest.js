// 최근 Threads 게시 결과 실측 — Background Function은 HTTP 응답으로 결과를 알려주지 않으므로
// (호출자는 202만 받는다) 실제 게시 여부는 DB로 확인해야 한다. 실행: node scripts/check-threads-latest.js
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };
const g = (t, q) => fetch(`${U}/rest/v1/${t}?${q}`, { headers: H }).then((r) => r.json());

(async () => {
  const tp = await g('threads_posts', 'select=posted_at,post_id,status,editors,source_url,distribution_score&order=posted_at.desc&limit=4');
  console.log('=== threads_posts 최신 4건 ===');
  tp.forEach((r) => console.log(` ${r.posted_at} | ${r.status} | ${r.post_id}\n    url: ${r.source_url}`));

  const rows = await g('topics', 'select=name,slug,ai_context&status=eq.active&ai_context->threads->>posted_at=not.is.null&limit=300');
  rows.sort((a, b) => (b.ai_context?.threads?.posted_at || '').localeCompare(a.ai_context?.threads?.posted_at || ''));
  console.log('\n=== 가장 최근 게시된 Topic 3건(dedup 기록 기준) ===');
  rows.slice(0, 3).forEach((x) => console.log(` ${x.ai_context.threads.posted_at} | post_id=${x.ai_context.threads.post_id} | ${x.name}`));
  console.log(`\n총 게시 완료 Topic: ${rows.length}건`);

  // 로그 테이블이 생겼는지도 함께 확인(마이그레이션 적용 여부 재측정)
  for (const t of ['distribution_run_log', 'distribution_skip_log', 'hero_history']) {
    const r = await fetch(`${U}/rest/v1/${t}?select=*&limit=1`, { headers: H });
    console.log(`${t}: ${r.ok ? '존재함(마이그레이션 적용됨)' : '없음(마이그레이션 미적용)'}`);
  }
})();
