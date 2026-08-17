// test-category-quota.js — 카테고리 하드 상한이 실제로 편중을 막는지 검증
// 실행: node scripts/test-category-quota.js
//
// 배경(2026-08-17): 실측에서 정치/국제가 매일 42~65%를 먹고 있었다(상한 20%의 2~3배).
// 원인은 쿼터를 발행 파이프라인에만 걸고 배급(Threads/Instagram)에는 안 건 것이었다.
// 이 테스트는 "배급 단계에서 하드 상한이 걸리는가"를 고정한다.

const { QUOTA_PLAN, bucketOf, applyCategoryQuota, countBuckets } = require('../netlify/functions/buzz-engine');

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS - ' + label); }
  else { fail++; console.log('FAIL - ' + label + (detail ? '\n        ' + detail : '')); }
}

const DAILY_TARGET = 20;

// ── 1) 쿼터 산술: 반올림 손실이 없어야 한다 ────────────────────────────────
{
  const caps = QUOTA_PLAN.map((q) => ({ label: q.label, cap: Math.max(1, Math.floor(q.cap * DAILY_TARGET)) }));
  const sum = caps.reduce((a, c) => a + c.cap, 0);
  check(
    `1) 목표 ${DAILY_TARGET}건에서 카테고리 상한 합계가 정확히 ${DAILY_TARGET}건`,
    sum === DAILY_TARGET,
    caps.map((c) => `${c.label} ${c.cap}`).join(' / ') + ` = ${sum}`
  );
  check('1b) 모든 카테고리가 최소 2건 확보', caps.every((c) => c.cap >= 2), caps.map((c) => `${c.label} ${c.cap}`).join(' / '));
}

// ── 2) 정치 상한 15% 반영 ──────────────────────────────────────────────────
{
  const politics = QUOTA_PLAN.find((q) => q.bucket === 'politics_intl');
  check('2) 정치/국제 상한이 15%', politics && Math.abs(politics.cap - 0.15) < 1e-9, `현재 ${politics && politics.cap}`);
  const total = QUOTA_PLAN.reduce((a, q) => a + q.cap, 0);
  check('2b) 전체 비율 합계가 100%', Math.abs(total - 1) < 1e-9, `현재 ${(total * 100).toFixed(0)}%`);
}

// ── 3) 정치 독점 시나리오 — 실제 관측된 편중(64%)을 재현해 막히는지 본다 ──
{
  const items = [];
  // 정치 후보가 buzz 최상위를 싹쓸이한 상태(실제로 8/16이 이랬다)
  for (let i = 0; i < 30; i++) items.push({ id: `pol-${i}`, category: 'Society', buzz_score: 200 - i });
  for (let i = 0; i < 10; i++) items.push({ id: `eco-${i}`, category: 'Economy', buzz_score: 100 - i });
  for (let i = 0; i < 10; i++) items.push({ id: `tec-${i}`, category: 'Technology', buzz_score: 95 - i });
  for (let i = 0; i < 10; i++) items.push({ id: `spo-${i}`, category: 'Sports', buzz_score: 90 - i });
  for (let i = 0; i < 10; i++) items.push({ id: `ent-${i}`, category: 'Entertainment', buzz_score: 85 - i });
  for (let i = 0; i < 5; i++) items.push({ id: `lif-${i}`, category: 'Lifestyle', buzz_score: 80 - i });
  for (let i = 0; i < 5; i++) items.push({ id: `hea-${i}`, category: 'Health', buzz_score: 75 - i });

  const noQuota = [...items].sort((a, b) => b.buzz_score - a.buzz_score).slice(0, DAILY_TARGET);
  const noQuotaShare = countBuckets(noQuota).politics_intl / noQuota.length;

  const { selected } = applyCategoryQuota(items, DAILY_TARGET, {});
  const dist = countBuckets(selected);
  const share = dist.politics_intl / selected.length;

  console.log(`\n  쿼터 없음 → 정치 ${(noQuotaShare * 100).toFixed(0)}%  |  쿼터 적용 → 정치 ${(share * 100).toFixed(0)}%`);
  console.log('  적용 후 분포:', JSON.stringify(dist), '\n');

  check('3) 쿼터 없으면 정치가 독점(재현 확인)', noQuotaShare >= 0.9, `${(noQuotaShare * 100).toFixed(0)}%`);
  check('3b) ★ 쿼터 적용 시 정치가 15% 이하', share <= 0.15 + 1e-9, `${(share * 100).toFixed(1)}%`);
  check('3c) 7개 버킷이 모두 선택됨(한 곳도 굶지 않음)', QUOTA_PLAN.every((q) => (dist[q.bucket] || 0) > 0), JSON.stringify(dist));
  check('3d) 각 버킷 안에서는 buzz 상위가 뽑힘',
    selected.filter((s) => s.category === 'Society').every((s) => s.buzz_score >= 200 - 3),
    selected.filter((s) => s.category === 'Society').map((s) => s.buzz_score).join(','));
}

// ── 4) 누적 창 반영 — 오늘 이미 정치를 상한까지 쓴 경우 ────────────────────
{
  const items = [];
  for (let i = 0; i < 20; i++) items.push({ id: `pol-${i}`, category: 'Society', buzz_score: 200 - i });
  for (let i = 0; i < 10; i++) items.push({ id: `eco-${i}`, category: 'Economy', buzz_score: 100 - i });
  const already = { politics_intl: 3, economy: 0, tech_ai: 0, sports: 0, entertainment: 0, product_consumer: 0, etc: 0 };
  const { selected } = applyCategoryQuota(items, 5, already);
  const politicsAdded = countBuckets(selected).politics_intl;
  check('4) 이미 상한을 채운 카테고리는 추가 선택 0건', politicsAdded === 0, `추가 ${politicsAdded}건`);
}

// ── 5) 후보가 한 카테고리뿐이면 배급이 멈추지 않는다 ──────────────────────
{
  const onlyPolitics = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, category: 'Society', buzz_score: 100 - i }));
  const { selected } = applyCategoryQuota(onlyPolitics, DAILY_TARGET, {});
  check('5) 한 카테고리만 있어도 0건이 되지 않음(overflow 허용)', selected.length > 0, `${selected.length}건`);
}

console.log(`\n${fail === 0 ? '전체 통과' : '일부 실패'}(${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
