// 홈 다양성 실측 — lib/topics.ts의 실제 함수를 실데이터에 적용해 결과를 눈으로 확인한다.
// 실행: node scripts/check-home-diversity.js
const fs = require('fs');
const path = require('path');
const { loadTopicsModule } = require('./lib/load-topics-module');
const { pickHeroTopic, pickSideTopics, diversifyForIndex, groupByTopicCluster, isBriefTopic } = loadTopicsModule();

const env = {};
fs.readFileSync(path.resolve(__dirname, '../.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

(async () => {
  // app/page.tsx의 getHomeCandidates와 동일한 select·정렬·limit
  const sel = 'select=slug,name,category,importance_score,weight:ai_context->weight,promoted:ai_context->draft->promoted_from';
  const cands = await fetch(
    `${U}/rest/v1/topics?${sel}&status=eq.active&order=importance_score.desc,popularity_score.desc&limit=300`,
    { headers: H }
  ).then((r) => r.json());
  console.log(`후보 풀 ${cands.length}건\n`);

  const hero = pickHeroTopic(cands);
  const sides = pickSideTopics(cands, hero);
  console.log('=== 홈 상단 3칸 ===');
  console.log(`  Hero    [${hero?.category}] ${hero?.name}`);
  sides.forEach((s, i) => console.log(`  사이드${i + 1} [${s.category}] ${s.name}`));

  const pool = cands.filter((t) => t.slug !== hero?.slug);
  // Hero를 seed로 넘겨 Hero의 주제·분야도 상한에 계산되게 한다(app/page.tsx와 동일).
  const idx = diversifyForIndex(pool, { seed: hero ? [hero] : [] });
  const rows = [hero, ...idx];
  console.log(`\n=== 오늘의 무게 인덱스 ${rows.length}행 ===`);
  rows.forEach((t, i) => console.log(
    `  ${String(i + 1).padStart(2)}. ${String(t.importance_score).padStart(4)} | ${(t.category || '-').padEnd(13)}` +
    `| ${isBriefTopic(t) ? 'Brief ' : '      '}| ${t.name.slice(0, 38)}`
  ));

  const cat = {};
  rows.forEach((t) => { cat[t.category || '-'] = (cat[t.category || '-'] || 0) + 1; });
  console.log('\n카테고리 분포:', JSON.stringify(cat));

  // 검증도 노출과 같은 판정(groupByTopicCluster)을 쓴다 — 기준이 다르면 "상한을 지켰는지"를 잘못 판정한다.
  const groups = groupByTopicCluster(rows);
  const dup = groups.filter((g) => g.items.length > 1).map((g) => [g.label, g.items.length]).sort((a, b) => b[1] - a[1]);
  console.log('2건 이상 클러스터:', dup.length ? JSON.stringify(dup) : '없음');
  const over = dup.filter(([, n]) => n > 2);
  console.log(over.length ? `★ 상한(2) 초과 클러스터 있음: ${JSON.stringify(over)}` : '상한(2) 초과 없음 ✓');

  console.log('\n=== 4시간 회전(향후 24시간) — 상단 3칸이 실제로 바뀌는지 ===');
  const seenHero = new Set(), seenSide = new Set();
  for (let h = 0; h < 24; h += 4) {
    const now = Date.now() + h * 3600000;
    const he = pickHeroTopic(cands, now);
    const si = pickSideTopics(cands, he, now);
    seenHero.add(he?.slug);
    si.forEach((x) => seenSide.add(x.slug));
    console.log(`  +${String(h).padStart(2)}h  ${(he?.name || '').slice(0, 20).padEnd(22)} | ${si.map((x) => x.name.slice(0, 18)).join(' / ')}`);
  }
  console.log(`\n24시간 동안 Hero ${seenHero.size}종 / 사이드 ${seenSide.size}종 노출`);
})();
