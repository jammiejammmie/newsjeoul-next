#!/usr/bin/env node
// viral-radar/scripts/test-pipeline.js
// §32 요구사항 중 실제로 코드로 검증 가능한 것들의 최소 회귀 테스트. DB에 손대지 않는다
// (buildDailyRanking/clusterVideos/checkVideo는 순수 함수 — 파일시스템 안 건드림).
const assert = require('assert');
const { buildDailyRanking } = require('../lib/rank');
const { clusterVideos, titleSimilarity } = require('../lib/dedupe');
const { checkVideo } = require('../lib/safety-filter');
const { normalizeVideo } = require('../lib/schema');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ✅ ${name}`); }
  catch (e) { fail++; console.error(`  ❌ ${name}\n     ${e.message}`); }
}

function makeVideo(overrides) {
  return normalizeVideo({
    platform: 'youtube_shorts', platform_post_id: overrides.id || Math.random().toString(36),
    canonical_url: `https://youtube.com/watch?v=${overrides.id || 'x'}`,
    title: overrides.title || 'Test Video', provider: 'test',
    view_count: overrides.view_count, primary_genre: overrides.primary_genre,
    source_status: overrides.source_status || 'ok',
    first_detected_at: overrides.first_detected_at,
    ...overrides,
  });
}

console.log('=== VIRAL RADAR PIPELINE TESTS (§32) ===\n');

test('null/0 조회수는 랭킹에서 제외된다', () => {
  const videos = [
    makeVideo({ id: 'a', view_count: 100, primary_genre: 'FUNNY' }),
    makeVideo({ id: 'b', view_count: 0, primary_genre: 'FUNNY' }),
    makeVideo({ id: 'c', view_count: null, primary_genre: 'FUNNY' }),
  ];
  const r = buildDailyRanking(videos, { topN: 10, platforms: ['youtube_shorts'] });
  const items = r.platforms.youtube_shorts.genres.FUNNY.items;
  assert.strictEqual(items.length, 1, `1건만 남아야 하는데 ${items.length}건`);
  assert.strictEqual(items[0].video_id, 'youtube_shorts:a');
});

test('장르 후보가 10개 미만이면 억지로 채우지 않는다(§19)', () => {
  const videos = [1, 2, 3].map((n) => makeVideo({ id: `g${n}`, title: `Shock video number ${n} unique headline`, view_count: n * 100, primary_genre: 'SHOCK' }));
  const r = buildDailyRanking(videos, { topN: 10, platforms: ['youtube_shorts'] });
  const g = r.platforms.youtube_shorts.genres.SHOCK;
  assert.strictEqual(g.filled, 3);
  assert.strictEqual(g.is_full, false);
});

test('동일 조회수 tie는 first_detected_at 이른 순', () => {
  // 서로 무관한 제목(중복제거에 안 걸리도록) + 동일 조회수로 순수하게 tie-break 로직만 검증한다.
  const videos = [
    makeVideo({ id: 'late', title: 'Magician performs mind bending card tricks on stage', view_count: 500, primary_genre: 'AMAZING', first_detected_at: '2026-09-09T10:00:00Z' }),
    makeVideo({ id: 'early', title: 'Gymnast lands impossible triple backflip routine', view_count: 500, primary_genre: 'AMAZING', first_detected_at: '2026-09-09T01:00:00Z' }),
  ];
  const r = buildDailyRanking(videos, { topN: 10, platforms: ['youtube_shorts'] });
  const items = r.platforms.youtube_shorts.genres.AMAZING.items;
  assert.strictEqual(items[0].video_id, 'youtube_shorts:early');
});

test('중복 클러스터는 대표 1건(최고 조회수)만 랭킹에 남는다', () => {
  const videos = [
    makeVideo({ id: 'v1', title: 'Funny cat falls off table', view_count: 1000, primary_genre: 'FUNNY' }),
    makeVideo({ id: 'v2', title: 'Funny cat falls off the table', view_count: 5000, primary_genre: 'FUNNY' }),
  ];
  const r = buildDailyRanking(videos, { topN: 10, platforms: ['youtube_shorts'] });
  const items = r.platforms.youtube_shorts.genres.FUNNY.items;
  assert.strictEqual(items.length, 1, `중복 제거 후 1건이어야 하는데 ${items.length}건`);
  assert.strictEqual(items[0].video_id, 'youtube_shorts:v2', '조회수 높은 variant가 대표여야 함');
});

test('플랫폼이 섞여 있어도 서로 랭킹에 침범하지 않는다(2026-09-09 개편 핵심)', () => {
  const videos = [
    makeVideo({ id: 't1', platform: 'tiktok', view_count: 10000000, primary_genre: 'FUNNY' }),
    makeVideo({ id: 'y1', platform: 'youtube_shorts', view_count: 100, primary_genre: 'FUNNY' }),
  ];
  const r = buildDailyRanking(videos, { topN: 10 });
  assert.strictEqual(r.platforms.tiktok.genres.FUNNY.items.length, 1);
  assert.strictEqual(r.platforms.youtube_shorts.genres.FUNNY.items.length, 1);
  assert.strictEqual(r.platforms.youtube_shorts.genres.FUNNY.items[0].video_id, 'youtube_shorts:y1',
    'TikTok 1000만뷰가 YouTube Shorts 100뷰를 밀어내면 안 됨(플랫폼별 독립 랭킹)');
});

test('안전 필터: 하드블록 키워드는 BLOCKED', () => {
  const r = checkVideo({ title: 'graphic death caught on camera' });
  assert.strictEqual(r.status, 'BLOCKED');
});

test('안전 필터: 사고/충돌류는 NEEDS_REVIEW(자동승인 아님)', () => {
  const r = checkVideo({ title: '180 Shocking Car Crashes Compilation' });
  assert.strictEqual(r.status, 'NEEDS_REVIEW');
});

test('안전 필터: 정상 제목은 OK', () => {
  const r = checkVideo({ title: 'Funny cat compilation 2026' });
  assert.strictEqual(r.status, 'OK');
});

test('needs_review 처리된 영상은 랭킹에서 빠지되 needs_review_items에 보고된다', () => {
  const videos = [
    makeVideo({ id: 'ok1', view_count: 100, primary_genre: 'ANGER', source_status: 'ok', title: 'Karen moment at the grocery store' }),
    makeVideo({ id: 'rev1', view_count: 999, primary_genre: 'ANGER', source_status: 'needs_review', title: 'Political figure confronted at rally' }),
  ];
  const r = buildDailyRanking(videos, { topN: 10, platforms: ['youtube_shorts'] });
  const platformResult = r.platforms.youtube_shorts;
  const g = platformResult.genres.ANGER;
  assert.strictEqual(g.items.length, 1, '리뷰 대상은 자동으로 TOP10에 안 들어가야 함');
  assert.strictEqual(g.items[0].video_id, 'youtube_shorts:ok1');
  assert.ok(platformResult.meta.needs_review_count >= 1, 'needs_review_count에 반영돼야 함(meta는 플랫폼 레벨)');
});

test('provider 하나가 실패해도 예외를 던지지 않고 계속 진행 가능(collect.js 구조 검증)', () => {
  // collect.js는 각 provider를 try/catch로 감싼다 — 여기선 그 계약만 재확인(정적 확인).
  const collectSrc = require('fs').readFileSync(require('path').join(__dirname, 'collect.js'), 'utf8');
  assert.ok(collectSrc.includes('try {') && collectSrc.includes('catch (e)'),
    'collect.js가 provider별 try/catch로 격리돼 있어야 함');
});

test('titleSimilarity: 완전 무관한 제목은 낮은 유사도', () => {
  const s = titleSimilarity('Funny cat falls off table', 'Government announces new policy today');
  assert.ok(s < 0.3, `무관한 제목인데 유사도 ${s}`);
});

test('회차 번호만 다른 시리즈 제목은 같은 클립으로 오인하지 않는다(실제 발견된 버그, 수정됨)', () => {
  const s = titleSimilarity('Try Not To Laugh Compilation Part 2', 'Try Not To Laugh Compilation Part 3');
  assert.ok(s > 0.6, `사전 조건: 비율 자체는 높아야 함(${s})`);
  const { titlesMatch } = require('../lib/dedupe');
  assert.strictEqual(titlesMatch('Try Not To Laugh Compilation Part 2', 'Try Not To Laugh Compilation Part 3'), false,
    '숫자만 다른 시리즈물은 병합되면 안 됨');
});

test('아웃라이어 점수: 채널 평소보다 10배 조회수면 BREAKOUT', () => {
  const { computeOutlierScore } = require('../lib/outlier');
  const r = computeOutlierScore(1000000, [90000, 100000, 110000, 95000]);
  assert.strictEqual(r.label, 'BREAKOUT');
  assert.ok(r.score >= 10);
});

test('안전 필터: 광고/브랜드 협찬 콘텐츠는 NEEDS_REVIEW(2026-09-09 추가)', () => {
  const r = checkVideo({ title: 'My new routine #ad #samsungpartner' });
  assert.strictEqual(r.status, 'NEEDS_REVIEW');
});

console.log(`\n=== 결과: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
