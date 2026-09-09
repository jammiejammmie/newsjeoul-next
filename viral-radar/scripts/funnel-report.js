#!/usr/bin/env node
// viral-radar/scripts/funnel-report.js
//
// 2026-09-09 PM 지시 §7 — "각 플랫폼마다: 수집 후보 수 / 시간조건 통과 수 / 실제 숏폼 확인 수 /
// 장르분류 후 수 / 최종 TOP 수를 보고한다"를 위한 집계 스크립트. provider funnel 로그
// (data/funnel-log.jsonl, collect.js가 기록) + 최종 랭킹(data/rankings/*.json)을 합쳐서
// 플랫폼별 한 장짜리 표로 뽑는다.
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

function loadFunnelLog(dateStr) {
  const file = path.join(__dirname, '..', 'data', 'funnel-log.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((e) => e.date === dateStr);
}

function main() {
  const dateStr = db.todayKst();
  const funnelLog = loadFunnelLog(dateStr);
  const ranking = db.loadRanking(dateStr);
  if (!ranking) {
    console.error('오늘자 랭킹이 없음 — 먼저 scripts/rank-run.js를 실행할 것');
    return;
  }

  console.log(`=== VIRAL RADAR 플랫폼별 퍼널 리포트 — ${dateStr} ===\n`);

  for (const [platform, data] of Object.entries(ranking.platforms)) {
    const providerFunnels = funnelLog.filter((f) => f.provider.includes(platform.split('_')[0]));
    console.log(`## ${platform}`);
    if (providerFunnels.length) {
      for (const f of providerFunnels) {
        const { date, provider, logged_at, ...rest } = f;
        console.log(`  [${provider}] ${JSON.stringify(rest)}`);
      }
    }
    console.log(`  수집 후보(dedupe 전, provider 합산): ${data.meta.total_candidates_in}`);
    console.log(`  유효(조회수>0, source_status=ok): ${data.meta.valid_after_freshness_filter}`);
    console.log(`  검토대기(안전/광고/정치 필터): ${data.meta.needs_review_count}`);
    console.log(`  승인(중복제거 전): ${data.meta.approved_count}`);
    console.log(`  최종 클러스터(중복제거 후, 장르분류 대상): ${data.meta.clusters_count}`);
    console.log(`  장르별 최종 TOP:`);
    for (const [genre, g] of Object.entries(data.genres)) {
      console.log(`    ${genre}: ${g.filled}/${g.target}${g.is_full ? '' : ' (부족)'}`);
    }
    console.log('');
  }
}

if (require.main === module) main();
module.exports = { main };
