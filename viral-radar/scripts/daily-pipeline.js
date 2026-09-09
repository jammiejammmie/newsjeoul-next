#!/usr/bin/env node
// viral-radar/scripts/daily-pipeline.js
//
// COLLECT → CLASSIFY → RANK → (RENDER는 별도 스크립트, Instagram 자산 필요할 때만 실행)
// §29: DRY_RUN 기본값 true. 실제 Instagram 게시 코드는 아직 없다(이 파이프라인의 다음 단계) —
// 지금은 이 스크립트가 하는 일 자체가 전부 "자산·JSON 생성"까지이고 외부로 아무것도 발행하지
// 않으므로 본질적으로 dry-run이다. Instagram publish 함수가 생기면 그 함수에도 동일하게
// INSTAGRAM_PAUSED_BY_DEFAULT=true 패턴(기존 instagram-publish.js와 동일)을 적용할 것.
const DRY_RUN = process.env.DRY_RUN !== 'false'; // 명시적으로 'false'를 주지 않는 한 항상 dry-run

const collect = require('./collect');
const rankRun = require('./rank-run');
const db = require('../lib/db');
const { classify } = require('../lib/classify');

async function classifyAll() {
  const all = db.getAllVideos();
  const unclassified = all.filter((v) => !v.primary_genre);
  console.log(`분류 대상 ${unclassified.length}건 (이미 분류된 ${all.length - unclassified.length}건은 건너뜀)`);

  let manualNeeded = 0, apiClassified = 0, failed = 0;
  for (const v of unclassified) {
    try {
      const result = await classify(v);
      if (result.needsManualClassification) {
        manualNeeded++;
        continue; // ANTHROPIC_API_KEY 없으면 여기서 멈춘다 — 가짜 분류를 만들지 않는다(§apply-classification.js로 별도 수동 처리)
      }
      db.upsertVideo({
        video_id: v.video_id,
        primary_genre: result.primaryGenre,
        secondary_genres: Object.entries(result.genreScores || {})
          .filter(([g, s]) => g !== result.primaryGenre && s >= 0.3).map(([g]) => g),
        genre_scores: result.genreScores,
        genre_confidence: result.confidence,
        summary_ko: result.summaryKo,
        source_status: result.needsReview ? 'needs_review' : 'ok',
        classified_by: 'claude_api_v1',
      });
      apiClassified++;
    } catch (e) {
      console.error(`분류 실패 (전체 중단 안 함): ${v.video_id} — ${e.message}`);
      failed++;
    }
  }
  console.log(`분류 결과: API자동 ${apiClassified}건 / 수동필요 ${manualNeeded}건 / 실패 ${failed}건`);
  if (manualNeeded > 0) {
    console.log('⚠️  ANTHROPIC_API_KEY가 없어 자동분류를 못 한 후보가 있다. scripts/export-for-classify.js + apply-classification.js로 수동 처리하거나 키를 설정할 것.');
  }
}

async function main() {
  console.log(`=== VIRAL RADAR DAILY PIPELINE (DRY_RUN=${DRY_RUN}) ===`);
  await collect.main();
  await classifyAll();
  rankRun.main();
  console.log('=== 완료 — 실제 Instagram 발행은 아직 이 파이프라인에 연결되지 않았다(§29 원칙대로 별도 승인 후 연결) ===');
}

if (require.main === module) {
  main().catch((e) => { console.error('DAILY_PIPELINE 치명적 실패:', e); process.exit(1); });
}
module.exports = { main };
