#!/usr/bin/env node
// viral-radar/scripts/rank-run.js
// 분류가 끝난 오늘자 후보로 플랫폼별 장르 TOP10을 만들고 data/rankings/YYYY-MM-DD.json에 저장한다.
const db = require('../lib/db');
const { buildDailyRanking } = require('../lib/rank');
const { buildContentClusters } = require('../lib/cluster');

function main() {
  const dateStr = db.todayKst();
  const all = db.getAllVideos();
  const classified = all.filter((v) => v.primary_genre); // 분류 안 된 건 랭킹에서 제외(§16 — 분류 전엔 순위 불가)

  const ranking = buildDailyRanking(classified, { topN: 10 });
  const clusters = buildContentClusters(classified);

  const output = {
    date: dateStr,
    cutoff_policy: 'CAPTURE_WINDOW', // PLATFORM.md §5 — 이번 MVP는 "포착 기준"을 채택(이유는 PRODUCT.md 감사 문서에 기록)
    generated_at: new Date().toISOString(),
    platforms: ranking.platforms,
    cross_platform_clusters_cross_only: clusters.filter((c) => c.is_cross_platform),
    total_cross_platform_clusters: clusters.filter((c) => c.is_cross_platform).length,
  };

  db.saveRanking(dateStr, output);

  console.log(`=== VIRAL RADAR RANKING — ${dateStr} ===`);
  for (const [platform, data] of Object.entries(ranking.platforms)) {
    console.log(`\n[${platform}] 후보 ${data.meta.total_candidates_in} → 유효 ${data.meta.valid_after_freshness_filter} → 검토대기 ${data.meta.needs_review_count} → 승인 ${data.meta.approved_count} → 중복제거 ${data.meta.duplicate_variants_removed_within_platform} → 최종 클러스터 ${data.meta.clusters_count}`);
    for (const [genre, g] of Object.entries(data.genres)) {
      console.log(`  ${genre}: ${g.filled}/${g.target}${g.is_full ? '' : ' (TOP10 채우지 못함 — 억지로 안 채움)'}`);
    }
  }
  console.log(`\n크로스플랫폼 클러스터: ${output.total_cross_platform_clusters}건 (플랫폼이 하나뿐이라 이번엔 0건이 정상)`);
  console.log(`\n저장 완료: data/rankings/${dateStr}.json`);
}

if (require.main === module) main();
module.exports = { main };
