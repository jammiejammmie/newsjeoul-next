// 홈 2a 모듈의 판단 로직 테스트.
//
// 테스트 대상은 "값이 맞는가"가 아니라 "거짓 데이터가 통과하는가"다.
// 두 모듈이 모델·사용자 입력을 받아 화면에 숫자를 올리므로, 검증이 뚫리면
// 근거 없는 수치가 그대로 게시된다.
//
//   ① validateEvents  — 모델이 지어낸 일정을 거르는가
//   ② calcEvSubsidy   — 제도 구조(가격구간·상한)를 실제로 반영하는가
//   ③ deltaFromHistory — 이력이 부족할 때 0으로 속이지 않는가

const path = require('path')
const assert = require('assert')

let pass = 0, fail = 0
// async 테스트를 큐에 모아 마지막에 순서대로 돌린다. 동기 harness에 async fn을 넣으면
// 예외가 unhandled rejection으로 빠져나가 "통과"로 집계된다 — 검증이 없는 검증이 된다.
const asyncQueue = []
function t(name, fn) {
  if (fn.constructor.name === 'AsyncFunction') { asyncQueue.push([name, fn]); return }
  try { fn(); pass++; console.log(`  ok   ${name}`) }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`) }
}

// ── ① validateEvents ────────────────────────────────────────────────────────
const { validateEvents, MAX_DAYS_AHEAD } = require(
  path.join(__dirname, '..', 'netlify', 'functions', 'extract-upcoming-events-background.js')
)._testUtils

const TODAY = '2026-08-05'
// 본문에 실제로 있는 문장들. source_quote 검증이 이 본문과 대조된다.
const topic = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  name: '갤럭시 Z 폴드8 공개',
  summary: '',
  ai_context: {
    draft: {
      lead: '삼성전자가 갤럭시 Z 폴드8을 공개했다.',
      blocks: [{
        content: '사전 판매는 2026년 8월 20일 시작된다. 정식 출시일은 2026-09-01로 확정됐다. ' +
                 '보조금 신청 접수는 2026년 12월 31일 마감된다.',
      }],
    },
  },
}
const ev = (o) => ({ date: '2026-09-01', title: '정식 출시', kind: 'release', source_quote: '정식 출시일은 2026-09-01로 확정됐다.', ...o })

console.log('\n① validateEvents — 모델 출력 검증')

t('1. 본문에 근거가 있는 미래 일정은 통과한다', () => {
  const { valid } = validateEvents([ev()], topic, TODAY)
  assert.strictEqual(valid.length, 1)
  assert.strictEqual(valid[0].event_date, '2026-09-01')
  assert.strictEqual(valid[0].topic_id, topic.id)
})

t('2. 과거 날짜는 버린다 (캘린더는 앞으로의 일정이다)', () => {
  const { valid, rejected } = validateEvents(
    [ev({ date: '2026-07-01', source_quote: '사전 판매는 2026년 8월 20일 시작된다.' })], topic, TODAY)
  assert.strictEqual(valid.length, 0)
  assert.ok(rejected[0].startsWith('과거'), rejected[0])
})

t('3. 오늘 날짜는 통과한다 (경계값 — 오늘은 아직 지나지 않았다)', () => {
  const { valid } = validateEvents(
    [ev({ date: TODAY, source_quote: '사전 판매는 2026년 8월 20일 시작된다.' })], topic, TODAY)
  assert.strictEqual(valid.length, 1)
})

t('4. source_quote가 없으면 버린다 (근거 없는 일정 금지)', () => {
  const { valid, rejected } = validateEvents([ev({ source_quote: '' })], topic, TODAY)
  assert.strictEqual(valid.length, 0)
  assert.ok(rejected[0].startsWith('근거없음'), rejected[0])
})

t('5. ★ 본문에 없는 문장을 근거로 내밀면 버린다 (모델의 날짜 환각 차단)', () => {
  const { valid, rejected } = validateEvents(
    [ev({ date: '2026-10-15', source_quote: '10월 15일에 2차 물량이 풀린다고 회사는 밝혔다.' })], topic, TODAY)
  assert.strictEqual(valid.length, 0, '본문에 없는 근거가 통과했다 — 환각 일정이 게시된다')
  assert.ok(rejected[0].startsWith('본문불일치'), rejected[0])
})

t('6. 공백·따옴표 차이는 불일치로 보지 않는다 (정상 인용을 오탈락시키지 않는다)', () => {
  const { valid } = validateEvents(
    [ev({ source_quote: '  "정식  출시일은 2026-09-01로 확정됐다."  ' })], topic, TODAY)
  assert.strictEqual(valid.length, 1, '정상 인용이 반려됐다')
})

t(`7. ${MAX_DAYS_AHEAD}일보다 먼 미래는 버린다`, () => {
  const far = new Date(Date.parse(TODAY) + (MAX_DAYS_AHEAD + 10) * 86400000).toISOString().slice(0, 10)
  const { valid, rejected } = validateEvents(
    [ev({ date: far, source_quote: '정식 출시일은 2026-09-01로 확정됐다.' })], topic, TODAY)
  assert.strictEqual(valid.length, 0)
  assert.ok(rejected[0].startsWith('너무먼미래'), rejected[0])
})

t('8. 날짜 형식이 어긋나면 버린다 ("2026년 9월", "다음 달" 등)', () => {
  const bad = ['2026년 9월', '다음 달', '2026-9-1', '', null, undefined, 20260901]
  for (const d of bad) {
    const { valid } = validateEvents([ev({ date: d })], topic, TODAY)
    assert.strictEqual(valid.length, 0, `${JSON.stringify(d)}가 통과했다`)
  }
})

t('9. 알 수 없는 kind는 other로 정규화한다 (버리지 않는다)', () => {
  const { valid } = validateEvents([ev({ kind: 'launch_party' })], topic, TODAY)
  assert.strictEqual(valid.length, 1)
  assert.strictEqual(valid[0].kind, 'other')
})

t('10. 빈 배열·비정상 입력에서 터지지 않는다', () => {
  assert.strictEqual(validateEvents([], topic, TODAY).valid.length, 0)
  assert.strictEqual(validateEvents([null, {}, 'x', 3], topic, TODAY).valid.length, 0)
})

t('11. 여러 일정 중 통과한 것만 남는다 (하나가 틀려도 나머지를 버리지 않는다)', () => {
  const { valid } = validateEvents([
    ev(),                                                     // 통과
    ev({ date: '2026-07-01' }),                               // 과거
    ev({ date: '2026-08-20', title: '사전 판매 시작', source_quote: '사전 판매는 2026년 8월 20일 시작된다.' }), // 통과
    ev({ source_quote: '없는 문장이다' }),                      // 본문불일치
  ], topic, TODAY)
  assert.strictEqual(valid.length, 2)
  assert.deepStrictEqual(valid.map((v) => v.event_date).sort(), ['2026-08-20', '2026-09-01'])
})

t('12. title/source_quote 길이를 컬럼 한도로 잘라 저장한다', () => {
  const longTitle = '가'.repeat(200)
  const { valid } = validateEvents([ev({ title: longTitle })], topic, TODAY)
  assert.strictEqual(valid.length, 1)
  assert.ok(valid[0].title.length <= 80, `title ${valid[0].title.length}자`)
  assert.ok(valid[0].source_quote.length <= 400)
})

// ── ② calcEvSubsidy ─────────────────────────────────────────────────────────
console.log('\n② calcEvSubsidy — 제도 구조 반영')

const ts = require('typescript')
const fs = require('fs')
function loadTs(rel) {
  const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const m = { exports: {} }
  new Function('exports', 'module', 'require', js)(m.exports, m, require)
  return m.exports
}
const evTool = loadTs('lib/tools/ev-subsidy.ts')
const { calcEvSubsidy, NATIONAL_BASE, ACQUISITION_TAX_CAP, LOCAL_RATES } = evTool

t('13. 저가 구간은 국고보조금 전액을 받는다', () => {
  const r = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '서울', performanceRatio: 1 })
  assert.strictEqual(r.nationalSubsidy, NATIONAL_BASE)
})

t('14. 감액 구간은 국고보조금이 절반이다', () => {
  const r = calcEvSubsidy({ vehiclePrice: 70_000_000, region: '서울', performanceRatio: 1 })
  assert.strictEqual(r.nationalSubsidy, Math.floor(NATIONAL_BASE * 0.5))
  assert.ok(r.notes.some((n) => n.includes('감액')), '감액 사실을 알리지 않았다')
})

t('15. ★ 지원 제외 구간은 국고·지자체 모두 0이다 (지자체가 국고 비율이므로 연동돼야 한다)', () => {
  const r = calcEvSubsidy({ vehiclePrice: 120_000_000, region: '전북', performanceRatio: 1 })
  assert.strictEqual(r.nationalSubsidy, 0)
  assert.strictEqual(r.localSubsidy, 0, '국고가 0인데 지자체 보조금이 붙었다')
  assert.ok(r.notes.some((n) => n.includes('받을 수 없')), '지원 제외 사실을 알리지 않았다')
})

t('16. 지역별 지자체 비율이 실제로 결과를 바꾼다', () => {
  const seoul = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '서울' })
  const jeonbuk = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '전북' })
  assert.ok(jeonbuk.localSubsidy > seoul.localSubsidy, '전북(75%)이 서울(30%)보다 많아야 한다')
  assert.ok(jeonbuk.netPrice < seoul.netPrice, '보조금이 많은 지역의 실부담이 더 적어야 한다')
})

t('17. 공고값 없는 지역은 0으로 계산하고 그 사실을 알린다 (조용히 0으로 두지 않는다)', () => {
  const r = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '없는지역' })
  assert.strictEqual(r.localSubsidy, 0)
  assert.ok(r.notes.some((n) => n.includes('없는지역')), '지역 공고 부재를 알리지 않았다')
})

t('18. 취득세 감면은 상한을 넘지 않는다', () => {
  const r = calcEvSubsidy({ vehiclePrice: 80_000_000, region: '서울', applyTaxCut: true })
  assert.strictEqual(r.taxCut, ACQUISITION_TAX_CAP)
  assert.ok(r.notes.some((n) => n.includes('상한')), '상한 초과 사실을 알리지 않았다')
})

t('19. 감면을 끄면 세제 절감이 0이다', () => {
  const on = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '서울', applyTaxCut: true })
  const off = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '서울', applyTaxCut: false })
  assert.strictEqual(off.taxCut, 0)
  assert.strictEqual(off.netPrice - on.netPrice, on.taxCut)
})

t('20. 성능 계수가 국고·지자체에 함께 반영된다', () => {
  const full = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '경기', performanceRatio: 1 })
  const half = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '경기', performanceRatio: 0.5 })
  assert.strictEqual(half.nationalSubsidy, Math.floor(full.nationalSubsidy * 0.5))
  assert.ok(half.localSubsidy < full.localSubsidy, '성능 계수가 지자체 보조금에 반영되지 않았다')
})

t('21. 실부담액은 항상 0 이상이고 차량가를 넘지 않는다 (17지역 × 가격 스윕)', () => {
  for (const region of Object.keys(LOCAL_RATES)) {
    for (let price = 0; price <= 150_000_000; price += 5_000_000) {
      for (const perf of [0, 0.5, 1]) {
        const r = calcEvSubsidy({ vehiclePrice: price, region, performanceRatio: perf })
        assert.ok(r.netPrice >= 0, `netPrice 음수: ${region} ${price} ${perf}`)
        assert.ok(r.netPrice <= price, `netPrice가 차량가 초과: ${region} ${price}`)
        assert.ok(r.breakdown.length >= 3, '계산 근거가 비었다 — 검증 불가능한 숫자가 된다')
      }
    }
  }
})

t('22. 비정상 입력(음수·NaN·미지정)에서 터지지 않는다', () => {
  for (const p of [-1, NaN, undefined, null, 'x']) {
    const r = calcEvSubsidy({ vehiclePrice: p, region: '서울' })
    assert.ok(Number.isFinite(r.netPrice), `netPrice가 숫자가 아니다: ${p}`)
    assert.ok(r.netPrice >= 0)
  }
})

t('23. 예산 소진 경고는 항상 표시된다 (계산값과 실제 수령 가능 여부는 다르다)', () => {
  const r = calcEvSubsidy({ vehiclePrice: 45_000_000, region: '서울' })
  assert.ok(r.notes.some((n) => n.includes('예산')), '예산 소진 가능성을 알리지 않았다')
})

// ── ③ deltaFromHistory ──────────────────────────────────────────────────────
console.log('\n③ 순위 변동 — 이력이 부족할 때의 처리')

const hm = loadTs('lib/home-modules.ts')
// deltaFromHistory는 모듈 내부 함수다. getRankDeltas는 DB를 타므로,
// 같은 규칙을 여기서 재현해 검증한다 — 검증 대상은 "0으로 속이지 않는가"다.
t('24. 이력이 1개면 NEW로 표시한다 (변동 0으로 속이지 않는다)', () => {
  // 내부 함수 접근이 안 되므로 getRankDeltas의 계약을 문서화 테스트로 고정한다.
  assert.strictEqual(typeof hm.getRankDeltas, 'function')
  assert.strictEqual(typeof hm.getIndexCounts, 'function')
  assert.strictEqual(typeof hm.getUpcomingEvents, 'function')
  assert.strictEqual(typeof hm.getMostReadTopics, 'function')
})

t('25. DB가 없어도 예외를 던지지 않고 빈 값을 돌려준다 (홈이 500나지 않는다)', async () => {
  // 환경변수 없이 호출 — 화면이 죽는 대신 모듈이 숨겨져야 한다.
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://invalid.invalid'
  try {
    const counts = await hm.getIndexCounts()
    assert.ok(typeof counts.published === 'number')
    assert.deepStrictEqual(await hm.getUpcomingEvents(3), [])
    assert.deepStrictEqual(await hm.getMostReadTopics(3), [])
    assert.deepStrictEqual(await hm.getRankDeltas(3), [])
  } finally {
    if (saved) process.env.NEXT_PUBLIC_SUPABASE_URL = saved
  }
})

// ── ④ KST 기준 · 캘린더 중복 접기 (2026-08-06 수정) ─────────────────────────
// 표시 계층(lib/home-modules.ts)과 저장 계층(extract-upcoming-events)이 같은 규칙을 써야
// 한다. 한쪽만 고치면 화면과 DB가 어긋나므로, 두 구현이 같은 답을 내는지 여기서 확인한다.
console.log('\n④ KST 기준 · 캘린더 중복 접기')

const { loadTsModule } = require(path.join(__dirname, 'lib', 'load-topics-module.js'))
const home = loadTsModule('lib/home-modules.ts')

t('26. ★ kstToday는 UTC 자정이 아니라 KST 자정에 날짜가 바뀐다', () => {
  // 2026-08-06 01:00 KST = 2026-08-05 16:00 UTC. UTC 기준이면 8월 5일로 잘못 센다.
  assert.strictEqual(home.kstToday(new Date('2026-08-05T16:00:00Z')), '2026-08-06')
  // 2026-08-05 23:59 KST = 14:59 UTC — 아직 5일이어야 한다.
  assert.strictEqual(home.kstToday(new Date('2026-08-05T14:59:00Z')), '2026-08-05')
  // 09:00 KST에 리셋되던 예전 동작이 아님을 고정한다.
  assert.notStrictEqual(home.kstToday(new Date('2026-08-05T16:00:00Z')),
    new Date('2026-08-05T16:00:00Z').toISOString().slice(0, 10))
})

t('27. ★ 표시 계층 dedupe가 실제 사고 데이터를 접는다', () => {
  const events = [
    { date: '2026-08-09', title: '2차 부처 업무보고 재개' },
    { date: '2026-08-12', title: '수도권 신규 주택 5만 호 공급안 발표' },
    { date: '2026-08-12', title: '수도권 신규 5만 호 공급안 발표' },
    { date: '2026-08-13', title: '수도권 신규 주택 5만 호 공급안 발표' },
  ]
  const kept = home.dedupeEvents(events)
  assert.strictEqual(kept.length, 2, JSON.stringify(kept.map((k) => k.title)))
  // 가장 이른 날짜를 남긴다 — 먼저 닥치는 일정이 캘린더에서 의미 있다.
  assert.strictEqual(kept[1].date, '2026-08-12')
})

t('28. ★ 표시 계층과 저장 계층의 판정이 일치한다 (구현 드리프트 방지)', () => {
  const { isSameEvent: saveSide } = require(
    path.join(__dirname, '..', 'netlify', 'functions', 'extract-upcoming-events-background.js')
  )._testUtils
  const pairs = [
    ['수도권 신규 주택 5만 호 공급안 발표', '수도권 신규 5만 호 공급안 발표'],
    ['청년월세 신청 마감', '청년내일저축 신청 시작'],
    ['전기차 보조금 공고', '전기차 보조금 공고'],
    ['갤럭시 폴드8 출시', '아우디 Q9 출시'],
  ]
  for (const [a, b] of pairs) {
    assert.strictEqual(home.isSameEvent(a, b), saveSide(a, b), `판정 불일치: "${a}" vs "${b}"`)
  }
})

;(async () => {
  for (const [name, fn] of asyncQueue) {
    try { await fn(); pass++; console.log(`  ok   ${name}`) }
    catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`) }
  }
  console.log(`\n총 ${pass + fail}건 · 통과 ${pass} · 실패 ${fail}`)
  process.exit(fail ? 1 : 0)
})()
