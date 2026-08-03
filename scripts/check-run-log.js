// distribution_run_log가 실제로 적재되기 시작했는지 확인(마이그레이션 적용 후 첫 행 검증).
const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };
(async () => {
  for (const t of ['distribution_run_log', 'distribution_skip_log']) {
    const rows = await fetch(`${U}/rest/v1/${t}?select=*&order=run_at.desc&limit=5`, { headers: H }).then((r) => r.json());
    console.log(`=== ${t}: ${rows.length}건(최신 5) ===`);
    rows.forEach((r) => console.log(' ', JSON.stringify(r)));
  }
})();
