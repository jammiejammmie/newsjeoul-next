// generate-node-insights의 병합 저장 수정이 실제로 동작하는지 재측정한다.
// 베이스라인(scripts/.node-insights-baseline.json)에 기록된 Topic들이 insights를 받은 뒤에도
// plan/gate/weight를 그대로 갖고 있는지 확인한다 — 수정 전이라면 전부 사라졌을 값들이다.
// 실행: node scripts/verify-node-insights-merge.js
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

const baselinePath = path.join(__dirname, '.node-insights-baseline.json');
if (!fs.existsSync(baselinePath)) { console.error('베이스라인 파일 없음 — 먼저 기록해야 한다.'); process.exit(1); }
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const INSIGHT_KEYS = ['industry_impact', 'historical_comparison', 'international_response', 'watchpoints', 'similar_cases', 'related_issues'];

(async () => {
  const ids = baseline.map((b) => b.id);
  const rows = await fetch(
    `${U}/rest/v1/topics?select=id,name,ai_outlook,ai_context&id=in.(${ids.join(',')})`,
    { headers: H }
  ).then((r) => r.json());

  let processed = 0, lost = 0;
  console.log('=== 병합 저장 검증(베이스라인 5건) ===');
  for (const b of baseline) {
    const now = rows.find((r) => r.id === b.id);
    if (!now) { console.log(` ? ${b.name} — 조회 안 됨`); continue; }
    const keys = Object.keys(now.ai_context || {});
    const gotInsights = INSIGHT_KEYS.some((k) => keys.includes(k));
    const keptAll = b.keys.every((k) => keys.includes(k));
    if (gotInsights) processed++;
    if (gotInsights && !keptAll) lost++;
    const missing = b.keys.filter((k) => !keys.includes(k));
    console.log(
      ` ${gotInsights ? (keptAll ? 'OK  ' : 'LOST') : '대기'} | insights:${gotInsights ? 'Y' : 'N'} | ` +
      `기존키유지:${keptAll ? 'Y' : 'N'}${missing.length ? '(소실: ' + missing.join(',') + ')' : ''} | ${b.name?.slice(0, 34)}`
    );
  }
  console.log(`\ninsights 처리된 Topic: ${processed}/${baseline.length} | 기존 키를 잃은 Topic: ${lost}건`);
  if (processed === 0) console.log('→ 아직 node-insights가 이 Topic들을 처리하지 않았다(배치 대기 중).');
  else if (lost === 0) console.log('→ 병합 저장 정상: insights가 추가됐고 plan/gate/weight가 그대로 남았다.');
  else console.log('→ 실패: 여전히 기존 값이 사라지고 있다. 즉시 확인 필요.');

  // 좀비 Topic 수도 함께 재측정(복구 SQL 적용 여부 확인용)
  const all = await fetch(`${U}/rest/v1/topics?select=editorial_status,ai_context&status=eq.active&limit=1000`, { headers: H }).then((r) => r.json());
  const zombies = all.filter((r) => !r.ai_context?.plan && r.editorial_status !== 'pending');
  console.log(`\nplan 없는 non-pending Topic(좀비): ${zombies.length}건  ← 복구 SQL 실행 후 0이 되어야 한다`);
})();
