// Weight Engine 신선도 감쇠 테스트.
//
// 왜 이 테스트가 필요한가: 이 산식이 홈 상단에 무엇이 올라가는지를 결정한다. 감쇠가 없던
// 상태에서 상위 30건 중 24건이 48시간 넘게 기사가 없는 토픽이었고, 홈이 며칠씩 같은
// 얼굴이었다("내용이 안 바뀐다"). 감쇠가 조용히 꺼지거나 반대로 과하게 걸리면 같은 문제가
// 다른 방향으로 재발하므로, 성질을 테스트로 고정한다.

const path = require('path')
const assert = require('assert')

const { computeWeight, DECAY_FREE_HOURS, DECAY_PER_DAY, MAX_DECAY_RATIO } =
  require(path.join(__dirname, '..', 'netlify', 'functions', 'update-topic-weight-background.js'))._testUtils

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`) }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`) }
}

const now = Date.now()
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString()
// 기사 n건, 마지막 기사가 h시간 전
const stories = (h, n = 10, controversy = 30) =>
  Array.from({ length: n }, (_, i) => ({
    published_at: hoursAgo(h + i * 2),
    controversy_score: controversy,
  }))
const entities = (n = 6, strength = 60) =>
  Array.from({ length: n }, () => ({ strength_score: strength }))
const PLAN = { event_type: '규제·정책', requires_dual_perspective: true }
const topicAged = (days) => ({ created_at: hoursAgo(days * 24) })

const w = (staleH, opts = {}) =>
  computeWeight(
    topicAged(opts.ageDays ?? staleH / 24 + 1),
    opts.stories ?? stories(staleH, opts.n ?? 10),
    entities(opts.entities ?? 6),
    opts.plan ?? PLAN
  )

console.log('\n① 감쇠 곡선')

t(`1. ${DECAY_FREE_HOURS}시간 이내는 감쇠가 없다 (수집 공백·주말에 멀쩡한 토픽을 깎지 않는다)`, () => {
  for (const h of [1, 6, 12, 24, DECAY_FREE_HOURS - 1]) {
    assert.strictEqual(w(h).components.staleness_decay, 0, `${h}시간에서 감쇠가 걸렸다`)
  }
})

t('2. 무보도 시간이 길수록 무게가 단조 감소한다', () => {
  const points = [DECAY_FREE_HOURS, 48, 72, 120, 168]
  const grams = points.map((h) => w(h).grams)
  for (let i = 1; i < grams.length; i++) {
    assert.ok(grams[i] < grams[i - 1], `${points[i]}시간(${grams[i]}g)이 ${points[i - 1]}시간(${grams[i - 1]}g)보다 무겁다`)
  }
})

t(`3. 감쇠는 자기 소계의 ${Math.round(MAX_DECAY_RATIO * 100)}%를 넘지 않는다 (과거 사안도 검색 유입이 있다)`, () => {
  // 신선한 토픽과 grams를 직접 비교하면 안 된다 — recency_bonus(40g)가 오래된 쪽에는 없어서
  // 소계 자체가 다르다. 상한은 "그 토픽의 감쇠 전 소계" 대비 비율이므로 그걸로 검증한다.
  for (const h of [24 * 30, 24 * 400, 24 * 5000]) {
    const r = w(h)
    const subtotal = Object.entries(r.components)
      .filter(([k]) => k !== 'staleness_decay')
      .reduce((a, [, v]) => a + v, 0)
    const ratio = Math.abs(r.components.staleness_decay) / subtotal
    // 감쇠는 정수로 반올림되므로 최대 0.5g 오차가 난다(317/528 = 60.04%). 상한은
    // "반올림 오차까지 포함해 60%"가 정확한 표현이다 — 오차를 상한 위반으로 보면 안 된다.
    const tolerance = 0.5 / subtotal + 1e-9
    assert.ok(ratio <= MAX_DECAY_RATIO + tolerance,
      `${h}시간: 감쇠 비율 ${(ratio * 100).toFixed(2)}%가 상한 ${MAX_DECAY_RATIO * 100}%(+반올림)를 넘었다`)
    assert.ok(r.grams > 0, '0 이하로 떨어졌다')
  }
  // 상한에 도달한 뒤에는 더 깎이지 않는다(무한 감쇠 방지).
  assert.strictEqual(w(24 * 400).grams, w(24 * 5000).grams, '상한 이후에도 계속 깎인다')
})

t('4. 무게는 항상 1 이상이다 (하한을 뚫지 않는다)', () => {
  for (const h of [0, 100, 1000, 24 * 1000]) {
    const g = w(h, { n: 1, entities: 0, plan: {} }).grams
    assert.ok(g >= 1, `${h}시간에서 ${g}g`)
  }
})

console.log('\n② 실제로 고치려는 문제')

t('5. ★ 계속 보도되는 오래된 사안은 여전히 무겁다 (나이가 아니라 무보도를 벌한다)', () => {
  // 구마모토 강진처럼 8일 전에 시작됐지만 지금도 기사가 들어오는 사안.
  const stillCovered = w(2, { ageDays: 8 })
  assert.strictEqual(stillCovered.components.staleness_decay, 0,
    '보도가 이어지는 오래된 사안이 감쇠됐다 — 나이를 기준으로 깎고 있다')
})

t('6. ★ 보도가 끊긴 사안은 신규 사안에 자리를 내준다 (홈 정체의 직접 원인)', () => {
  // 감쇠 전 실측: 15일 된 무보도 토픽 507g이 12위, 신규 토픽 최고 516g이 8위였다.
  const stale = w(24 * 7, { n: 12, entities: 8 })       // 일주일 무보도 + 누적 최대
  const fresh = w(3, { n: 2, entities: 2, ageDays: 0.3 }) // 신규 + 기사 적음
  assert.ok(fresh.grams > stale.grams,
    `무보도 누적 토픽(${stale.grams}g)이 신규 토픽(${fresh.grams}g)을 여전히 앞선다 — 정체가 안 풀린다`)
})

t('7. 같은 무보도 시간이면 누적 신호가 많은 쪽이 더 무겁다 (감쇠가 서열을 뒤집지 않는다)', () => {
  const rich = w(72, { n: 12, entities: 8 })
  const poor = w(72, { n: 2, entities: 1 })
  assert.ok(rich.grams > poor.grams, `${rich.grams} vs ${poor.grams}`)
})

console.log('\n③ 근거 기록 (임의 숫자 금지 원칙)')

t('8. 감쇠가 걸리면 reasons에 사유와 비율이 남는다', () => {
  const r = w(120)
  const line = r.reasons.find((x) => x.includes('신선도 감쇠'))
  assert.ok(line, `감쇠 사유가 없다: ${JSON.stringify(r.reasons)}`)
  assert.ok(/\d+시간 경과/.test(line), `경과 시간이 없다: ${line}`)
  assert.ok(/\d+%/.test(line), `감쇠 비율이 없다: ${line}`)
})

t('9. 감쇠가 없으면 사유를 붙이지 않는다 (0g 항목을 설명하지 않는다)', () => {
  assert.ok(!w(1).reasons.some((x) => x.includes('신선도 감쇠')))
})

t('10. components에 staleness_decay가 항상 있고 합이 grams와 일치한다', () => {
  for (const h of [1, 48, 200]) {
    const r = w(h)
    assert.ok('staleness_decay' in r.components, `${h}시간에서 항목 누락`)
    const sum = Object.values(r.components).reduce((a, b) => a + b, 0)
    assert.strictEqual(r.grams, Math.max(1, Math.min(999, Math.round(sum))),
      `${h}시간: components 합 ${sum} ≠ grams ${r.grams} — 근거와 결과가 어긋난다`)
  }
})

console.log('\n④ 경계 조건')

t('11. 기사에 날짜가 하나도 없으면 토픽 생성 시점으로 감쇠한다', () => {
  // 폴백이 없으면 날짜 없는 토픽만 감쇠를 피해 상단에 남는다.
  const noDates = computeWeight(
    topicAged(10),
    [{ published_at: null, controversy_score: 30 }, { controversy_score: 30 }],
    entities(6), PLAN
  )
  assert.ok(noDates.components.staleness_decay < 0,
    '날짜 없는 오래된 토픽이 감쇠를 피했다 — 이 구멍으로 정체가 재발한다')
})

t('12. 기사가 아예 없어도 터지지 않는다', () => {
  const r = computeWeight(topicAged(5), [], [], {})
  assert.ok(Number.isFinite(r.grams) && r.grams >= 1, JSON.stringify(r))
})

t('13. created_at이 없어도 터지지 않는다', () => {
  const r = computeWeight({}, stories(100), entities(4), PLAN)
  assert.ok(Number.isFinite(r.grams) && r.grams >= 1, JSON.stringify(r))
})

t('14. 미래 날짜 기사(시계 오차)가 감쇠를 음수로 만들지 않는다', () => {
  const future = [{ published_at: new Date(now + 5 * 3600000).toISOString(), controversy_score: 30 }]
  const r = computeWeight(topicAged(1), future, entities(4), PLAN)
  assert.strictEqual(r.components.staleness_decay, 0, '미래 날짜로 무게가 부풀려졌다')
})

t(`15. 파라미터가 문서화된 값과 일치한다 (조용히 바뀌면 홈 정체가 재발한다)`, () => {
  assert.strictEqual(DECAY_FREE_HOURS, 30)
  assert.strictEqual(DECAY_PER_DAY, 0.12)
  assert.strictEqual(MAX_DECAY_RATIO, 0.6)
})

console.log(`\n총 ${pass + fail}건 · 통과 ${pass} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
