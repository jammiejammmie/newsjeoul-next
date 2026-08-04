// pg_cron이 실제로 Netlify 함수를 호출했는지 외부(anon key)에서 검증한다.
// 판별 근거: pg_cron은 cron 표현식 시각에 정확히 쏘고(update-topic-weight = 매시 :05),
// GitHub Actions는 throttling으로 불규칙하게 지연된다. 따라서 weight.computed_at이
// 특정 분(:05~:07)에 몰려 있으면 pg_cron이 쏜 것이다.
const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

(async () => {
  const rows = await fetch(`${U}/rest/v1/topics?select=ai_context&status=eq.active&limit=1000`, { headers: H }).then((r) => r.json());
  const times = rows.map((r) => r.ai_context?.weight?.computed_at).filter(Boolean).map((t) => new Date(t));
  const byMinute = {};
  const now = Date.now();
  times.forEach((t) => {
    if (now - t > 90 * 60 * 1000) return; // 최근 90분만
    const k = t.toISOString().slice(11, 16);
    byMinute[k] = (byMinute[k] || 0) + 1;
  });
  const entries = Object.entries(byMinute).sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`최근 90분 내 무게 재계산 시각 분포 (총 ${entries.reduce((s, e) => s + e[1], 0)}건)`);
  entries.forEach(([m, n]) => console.log(`  ${m} UTC : ${n}건 ${n >= 20 ? '← 배치 실행' : ''}`));
  if (!entries.length) console.log('  (최근 90분 내 재계산 없음)');
})();
