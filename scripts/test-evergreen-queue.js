// 에버그린 갱신 큐 — 감지·정규화 로직 테스트.
//
// 검증 대상은 "동작하는가"가 아니라 "쓰레기가 통과하는가"다. 이 파이프라인은 사람 승인 없이
// 페이지를 만들어 게시하므로, 게이트가 뚫리면 잘못된 허브가 색인에 들어간다.

const path = require('path')
const assert = require('assert')

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log(`  ok   ${name}`) }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`) }
}

const detect = require(path.join(__dirname, '..', 'netlify', 'functions', 'detect-evergreen-candidates-background.js'))._testUtils
const gen = require(path.join(__dirname, '..', 'netlify', 'functions', 'generate-evergreen-hub-background.js'))._testUtils
const docs = require(path.join(__dirname, '..', 'netlify', 'functions', 'generate-hub-documents-background.js'))._testUtils

const topic = (name, score, extra = {}) => ({
  id: 'id-' + name, name, category: 'Technology', importance_score: score,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extra,
})

const { normalizeSlug, dedupeKey } = detect

console.log('\n① normalizeSlug — URL 규칙')

// 슬러그는 모델이 만들고 코드가 검증한다. 원래는 한글→영문 하드코딩 사전으로 만들었는데
// 실측(2026-08-05)에서 감지 39건 중 37건이 슬러그를 못 만들어 탈락했고, 살아남은 2건이
// '2026'(연도)과 'fifa'였다. 즉 감지 파이프라인이 사실상 작동하지 않았다.

t('1. ★ 연도를 제거한다 (§6.1 — 연도가 붙으면 해마다 URL이 갈려 색인 자산이 리셋된다)', () => {
  assert.strictEqual(normalizeSlug('tax-reform-2026'), 'tax-reform')
  assert.strictEqual(normalizeSlug('2026-tax-reform'), 'tax-reform')
  assert.strictEqual(normalizeSlug('ev-subsidy-2025-2026'), 'ev-subsidy')
  assert.strictEqual(normalizeSlug('galaxy-1999-fold'), 'galaxy-fold')
})

t("2. ★ 숫자만인 슬러그를 거부한다 ('2026' 사건)", () => {
  for (const bad of ['2026', '2026-2027', '123', '--2026--']) {
    assert.strictEqual(normalizeSlug(bad), null, `${bad}가 통과했다`)
  }
})

t('3. 정상 슬러그는 그대로 통과한다 (제품 모델 숫자는 연도가 아니므로 남는다)', () => {
  assert.strictEqual(normalizeSlug('galaxy-z-fold8'), 'galaxy-z-fold8')
  assert.strictEqual(normalizeSlug('youth-monthly-rent'), 'youth-monthly-rent')
  assert.strictEqual(normalizeSlug('iphone17-pro'), 'iphone17-pro')
})

t('4. 한글이 남은 값은 거부하고, 공백·기호는 정규화한다', () => {
  assert.strictEqual(normalizeSlug('청년월세'), null, '한글이 슬러그로 통과했다')
  assert.strictEqual(normalizeSlug('Youth Monthly Rent'), 'youth-monthly-rent')
  assert.strictEqual(normalizeSlug('  --ev--subsidy--  '), 'ev-subsidy')
  assert.strictEqual(normalizeSlug('ab'), null, '너무 짧은 슬러그가 통과했다')
  assert.strictEqual(normalizeSlug(''), null)
  assert.strictEqual(normalizeSlug(null), null)
})

t('4b. dedupeKey로 같은 이름을 한 번만 판정한다 (매 3시간 재판정·재과금 방지)', () => {
  assert.strictEqual(dedupeKey('갤럭시 Z 폴드8'), dedupeKey('갤럭시Z폴드8'))
  assert.strictEqual(dedupeKey('Tax Reform'), dedupeKey('taxreform'))
  assert.notStrictEqual(dedupeKey('전기차 보조금'), dedupeKey('청년월세'))
})

console.log('\n② tokensOf — 불용어 제거')

t('5. 뉴스 문장 상용어를 실체로 오인하지 않는다', () => {
  const toks = detect.tokensOf('트럼프 이란 보복 예고 논의 확대')
  for (const bad of ['예고', '논의', '확대', '이란']) {
    assert.ok(!toks.includes(bad), `불용어 '${bad}'가 남았다: ${JSON.stringify(toks)}`)
  }
})

t('6. 조사를 떼어 같은 실체를 하나로 본다', () => {
  assert.ok(detect.tokensOf('폴드8의 가격').includes('폴드8'), JSON.stringify(detect.tokensOf('폴드8의 가격')))
  assert.ok(detect.tokensOf('폴드8은 출시').includes('폴드8'))
})

t('7. 숫자만 있는 조각과 한 글자는 버린다', () => {
  const toks = detect.tokensOf('2026 년 A 제품 512')
  assert.ok(!toks.includes('2026') && !toks.includes('512'), JSON.stringify(toks))
  assert.ok(!toks.some((x) => x.length < 2), JSON.stringify(toks))
})

console.log('\n③ 감지 규칙')

t(`8. keyword_cluster는 ${detect.CLUSTER_MIN_TOPICS}건 미만이면 잡지 않는다`, () => {
  const two = [topic('폴드8 사전판매', 300), topic('폴드8 가격 공개', 280)]
  assert.strictEqual(detect.detectKeywordClusters(two).filter((c) => c.name === '폴드8').length, 0)
  const three = [...two, topic('폴드8 출시일 확정', 260)]
  const hit = detect.detectKeywordClusters(three).filter((c) => c.name === '폴드8')
  assert.strictEqual(hit.length, 1, '3건이면 잡아야 한다')
  assert.ok(hit[0].trigger_detail.includes('3건'), hit[0].trigger_detail)
})

t('9. 모든 감지 결과에 근거(trigger_detail)가 있다', () => {
  const list = [
    ...detect.detectKeywordClusters([topic('폴드8 A', 500), topic('폴드8 B', 400), topic('폴드8 C', 300)]),
    ...detect.detectHighScore([topic('청년월세 지원 확대', 600)], []),
    ...detect.detectRepeatSurge([topic('Q9 출시', 400), topic('Q9 가격', 300)]),
  ]
  assert.ok(list.length >= 3)
  for (const c of list) {
    assert.ok(c.trigger_detail && c.trigger_detail.length > 10, `근거 없음: ${JSON.stringify(c)}`)
    assert.ok(c.trigger_reason, '사유 없음')
    assert.ok(Number.isFinite(c.priority), 'priority 없음')
  }
})

t(`10. high_score_no_hub은 뉴스성 카테고리에서 ${detect.HIGH_SCORE_MIN}g 미만을 잡지 않는다`, () => {
  const news = (score) => topic('무거운 이슈', score, { category: '정치/국제' })
  assert.strictEqual(detect.detectHighScore([news(detect.HIGH_SCORE_MIN - 1)], []).length, 0)
  assert.strictEqual(detect.detectHighScore([news(detect.HIGH_SCORE_MIN)], []).length, 1)
})

// ── 2026-08-06 감지 0건 사고 회귀 테스트 ────────────────────────────────────
// 감지가 28시간 동안 0건이었던 두 원인을 각각 고정한다. 하나라도 되돌아가면 여기서 걸린다.

t('10-a. ★ 카테고리 성향 판정 — 복합 카테고리를 조각으로 읽는다', () => {
  const { categoryStance } = detect
  for (const c of ['Technology', 'IT/보안', '산업/기술', '경제/기업', 'Lifestyle', 'Automobile', 'Health'])
    assert.strictEqual(categoryStance(c), 'evergreen', `${c}가 에버그린으로 안 잡혔다`)
  for (const c of ['정치', '정치/국제', '국제/중동', '사회/사건사고', '북한/안보', '스포츠', 'Society'])
    assert.strictEqual(categoryStance(c), 'news', `${c}가 뉴스로 안 잡혔다`)
  // 뉴스 조각이 같거나 많으면 뉴스로 본다 — 정치 맥락의 경제 기사는 허브 후보가 아니다.
  assert.strictEqual(categoryStance('정치/경제'), 'news')
  assert.strictEqual(categoryStance('국제/경제'), 'news')
  assert.strictEqual(categoryStance(null), 'neutral')
  assert.strictEqual(categoryStance('처음보는분류'), 'neutral')
})

t('10-b. ★ IT·소비재·생활 카테고리는 완화된 무게 기준으로 통과한다', () => {
  // 실제 사고: 감쇠 도입 후 상위 토픽이 398g까지 내려가 500g 기준이 도달 불가능해졌다.
  const score = 300 // 500g 미만이지만 실제 상위권인 무게
  for (const cat of ['Technology', 'Lifestyle', 'Automobile', '산업/기술']) {
    assert.strictEqual(
      detect.detectHighScore([topic('신제품 출시', score, { category: cat })], []).length, 1,
      `${cat} ${score}g이 감지되지 않았다 — 완화 기준이 안 먹었다`
    )
  }
  // 뉴스성 카테고리는 완화하지 않는다.
  assert.strictEqual(
    detect.detectHighScore([topic('공방 격화', score, { category: '정치/국제' })], []).length, 0,
    '뉴스성 카테고리에 완화 기준이 잘못 적용됐다'
  )
})

t('10-c. ★ 무게 산식이 또 바뀌어도 감지가 죽지 않는다 (상대 기준)', () => {
  // 전체 무게가 절대 기준보다 훨씬 낮게 내려간 상황을 만든다.
  const decayed = Array.from({ length: 20 }, (_, i) => topic(`이슈${i}`, 200 - i * 5))
  const bars = detect.computeScoreBars(decayed)
  assert.ok(bars.evergreen <= 200, `상대 기준이 안 내려갔다: ${JSON.stringify(bars)}`)
  assert.ok(bars.evergreen >= detect.HIGH_SCORE_FLOOR, `바닥(${detect.HIGH_SCORE_FLOOR}) 밑으로 내려갔다`)
  const hits = detect.detectHighScore(decayed, [], bars)
  assert.ok(hits.length > 0, '전체 무게가 낮아지자 감지가 0건이 됐다 — 사고 재발')
  // 뉴스성 기준은 상대 기준으로도 완화되지 않는다.
  assert.strictEqual(bars.news, detect.HIGH_SCORE_MIN)
})

t('10-d. ★ 판정 예산이 뉴스성 후보에 먼저 가지 않는다 (우선순위 보정)', () => {
  const W = detect.PRIORITY_WEIGHT
  // 같은 무게라면 에버그린 성향이 앞선다.
  assert.ok(500 * W.evergreen > 500 * W.news, '에버그린 후보가 뉴스 후보를 못 앞선다')
  // 무게가 2배 높은 뉴스 후보보다도 앞서야 12칸 독식이 풀린다.
  assert.ok(400 * W.evergreen > 800 * W.news, '뉴스 후보가 여전히 판정 예산을 독식한다')
})

t('11. ★ 이미 허브가 있는 키워드는 다시 감지하지 않는다 (중복 허브 방지)', () => {
  const t1 = topic('전기차 구매 보조금 단가 인상', 700)
  assert.strictEqual(detect.detectHighScore([t1], ['전기차 구매 보조금']).length, 0, '기존 허브 키워드가 재감지됐다')
  assert.strictEqual(detect.detectHighScore([t1], ['엑셀']).length, 1)
})

t('12. repeat_surge는 24시간 밖 토픽을 세지 않는다', () => {
  const old = new Date(Date.now() - 40 * 3600000).toISOString()
  const stale = [topic('Q9 출시', 400, { created_at: old, updated_at: old }),
                 topic('Q9 가격', 300, { created_at: old, updated_at: old })]
  assert.strictEqual(detect.detectRepeatSurge(stale).filter((c) => c.name === 'Q9').length, 0)
})

console.log('\n④ normalizeConfig — 생성물 정규화')

const item = { hub_slug: 'galaxy-test', suggested_title: '테스트 제품', category: '모바일', kind: 'product' }
const full = {
  definition: '정의 문장', trackingNote: '추적', verdict: '판단',
  stats: [{ label: '가격', value: '100만원' }],
  specs: [{ label: '화면', value: '7인치' }],
  faq: [{ q: '질문1', a: '답1' }, { q: '질문2', a: '답2' }],
  timeline: [{ date: '2026-08-01', title: '공개' }],
  evergreen: {
    howto: { items: [{ title: 'A' }, { title: 'B' }] },
    troubleshoot: { items: [{ title: 'C' }] },
    compare: { items: [{ title: 'D' }] },
    buying: { items: [{ title: 'E' }] },
  },
  newsKeywords: ['테스트'], tags: ['태그'], schema: { brand: '삼성' },
}

t('13. ★ 자동 생성 허브에는 제휴 링크를 절대 붙이지 않는다', () => {
  const c = gen.normalizeConfig({ ...full }, item, '2026-08-05')
  assert.strictEqual(c.affiliate.allowed, false, '자동 생성물에 제휴 링크가 허용됐다 — 수익 판단을 모델이 했다')
  assert.ok(c.affiliate.reason, '금지 사유가 없다')
})

t('14. ★ 가격·출시일을 구조화 데이터로 만들지 않는다 (틀린 값이 퍼진다)', () => {
  const c = gen.normalizeConfig({ ...full, schema: { brand: '삼성', price: 2400000, releaseDate: '2026-09-01' } }, item, '2026-08-05')
  assert.strictEqual(c.schema.price, undefined, '추측 가격이 Offer로 나간다')
  assert.strictEqual(c.schema.releaseDate, undefined, '추측 출시일이 구조화 데이터로 나간다')
  assert.strictEqual(c.schema.brand, '삼성', 'brand는 유지돼야 한다')
})

t('15. ★ 추이(trend)를 자동 생성하지 않는다 (시계열은 실측이어야 한다)', () => {
  const c = gen.normalizeConfig({ ...full, trend: { title: '가격 추이', points: [{ date: '2026-08-01', value: 100 }] } }, item, '2026-08-05')
  assert.strictEqual(c.trend, undefined, '모델이 만든 가격 추이 그래프가 붙었다')
})

t('16. editor가 HubEditor 필수 키(name/beat/statement)를 갖는다', () => {
  const c = gen.normalizeConfig({ ...full }, item, '2026-08-05')
  for (const k of ['name', 'beat', 'statement']) {
    assert.ok(typeof c.editor[k] === 'string' && c.editor[k].length > 0, `editor.${k} 없음 — Person 스키마에 undefined가 나간다`)
  }
})

t('17. 자동 생성물임을 editor.statement에 밝힌다', () => {
  const c = gen.normalizeConfig({ ...full }, item, '2026-08-05')
  assert.ok(/자동 생성|검수/.test(c.editor.statement), c.editor.statement)
})

t('18. 날짜 형식이 어긋난 timeline 항목은 버린다', () => {
  const c = gen.normalizeConfig({
    ...full,
    timeline: [{ date: '2026년 여름', title: 'X' }, { date: '2026-08-01', title: 'Y' }, { date: '', title: 'Z' }],
  }, item, '2026-08-05')
  assert.strictEqual(c.timeline.length, 1)
  assert.strictEqual(c.timeline[0].title, 'Y')
})

t('19. 모델이 항목을 빠뜨려도 페이지가 깨지지 않는 형태를 만든다', () => {
  const c = gen.normalizeConfig({}, item, '2026-08-05')
  assert.ok(Array.isArray(c.stats) && Array.isArray(c.specs) && Array.isArray(c.faq) && Array.isArray(c.timeline))
  assert.ok(Array.isArray(c.tags) && Array.isArray(c.related))
  for (const k of ['howto', 'troubleshoot', 'compare', 'buying']) {
    assert.ok(c.evergreen[k] && typeof c.evergreen[k].label === 'string' && Array.isArray(c.evergreen[k].items), `evergreen.${k} 형태 불량`)
  }
  assert.ok(c.definition && c.verdict && c.specsTitle, '필수 문구 폴백이 없다')
})

t('20. kind별로 에버그린 라벨이 달라진다(§3.3)', () => {
  const p = gen.normalizeConfig({}, { ...item, kind: 'policy' }, '2026-08-05')
  const g = gen.normalizeConfig({}, { ...item, kind: 'program' }, '2026-08-05')
  assert.strictEqual(p.evergreen.howto.label, '신청 방법')
  assert.strictEqual(g.evergreen.howto.label, '사용법·단축키')
  assert.notStrictEqual(p.evergreen.troubleshoot.label, g.evergreen.troubleshoot.label)
})

t('21. 알 수 없는 kind는 product로 정규화된다', () => {
  const c = gen.normalizeConfig({}, { ...item, kind: 'weird' }, '2026-08-05')
  assert.strictEqual(c.kind, 'product')
})

t('22. 길이 상한을 넘긴 값을 잘라 저장한다', () => {
  const c = gen.normalizeConfig({
    ...full, definition: '가'.repeat(2000), verdict: '나'.repeat(2000),
    faq: [{ q: '다'.repeat(500), a: '라'.repeat(3000) }, { q: 'q', a: 'a' }],
  }, item, '2026-08-05')
  assert.ok(c.definition.length <= 600, c.definition.length)
  assert.ok(c.verdict.length <= 400, c.verdict.length)
  assert.ok(c.faq[0].a.length <= 900, c.faq[0].a.length)
})

console.log('\n⑤ docSlug — 문서 URL')

t('23. 같은 제목은 항상 같은 슬러그를 만든다 (생성·조회가 어긋나면 링크가 죽는다)', () => {
  const a = docs.docSlug('청년월세 소득 기준 계산법', 'howto')
  const b = docs.docSlug('청년월세 소득 기준 계산법', 'howto')
  assert.strictEqual(a, b)
})

t('24. 서로 다른 제목은 다른 슬러그가 된다', () => {
  const seen = new Set()
  const titles = [
    '청년월세 소득 기준 계산법', '청년월세 신청 서류 준비', '엑셀 VLOOKUP #N/A 오류 해결',
    '엑셀 VLOOKUP 오류 해결', '폴드8 배터리 절약 설정', '폴드8 배터리 설정',
  ]
  for (const t2 of titles) {
    const s = docs.docSlug(t2, 'howto')
    assert.ok(!seen.has(s), `충돌: ${t2} → ${s}`)
    seen.add(s)
  }
})

t('25. 한글 제목도 URL로 쓸 수 있는 슬러그가 된다', () => {
  const s = docs.docSlug('청년월세 소득 기준 계산법', 'howto')
  assert.ok(/^[a-z0-9-]+$/.test(s), s)
  assert.ok(s.length >= 3 && s.length <= 60, s.length)
})

t('26. 4포맷 키가 HubEvergreen과 일치한다', () => {
  assert.deepStrictEqual(docs.FORMATS.slice().sort(), ['buying', 'compare', 'howto', 'troubleshoot'])
  for (const f of docs.FORMATS) {
    assert.ok(docs.FORMAT_INTENT[f], `${f} 문서 성격 정의 없음`)
    assert.ok(gen.EVERGREEN_LABELS.product[f], `${f} 라벨 없음`)
  }
})

console.log('\n⑤ 문서 생성 배분·구제 — 2026-08-06 빈 허브 사고 회귀 테스트')

// 사고: 파일럿 5개 중 excel 0건 · ev-subsidy 2건인 채로 32시간이 지났다.
// 원인은 남은 목록을 앞에서부터 잘라 쓴 것(앞 허브가 다 찰 때까지 뒤 허브는 0건).
const mkTodo = (pairs) => pairs.flatMap(([hub, n]) =>
  Array.from({ length: n }, (_, i) => ({ hubSlug: hub, title: `${hub}-${i}`, format: 'howto' })))

t('27. ★ 문서가 가장 적은 허브부터 채운다 (빈 허브 방치 방지)', () => {
  const todo = mkTodo([['galaxy', 16], ['audi', 16], ['excel', 16], ['ev', 14]])
  const counts = new Map([['galaxy', 16], ['audi', 16], ['excel', 0], ['ev', 2]])
  const batch = docs.balanceByHub(todo, counts).slice(0, 8)
  const byHub = batch.reduce((a, t2) => ({ ...a, [t2.hubSlug]: (a[t2.hubSlug] || 0) + 1 }), {})
  assert.ok(!byHub.galaxy && !byHub.audi, `이미 찬 허브가 또 배정됐다: ${JSON.stringify(byHub)}`)
  assert.ok((byHub.excel || 0) >= 4, `빈 허브가 우선 배정되지 않았다: ${JSON.stringify(byHub)}`)
  assert.strictEqual(batch.length, 8)
})

t('28. 어느 허브도 굶지 않는다 (수평이 맞으면 번갈아 배정)', () => {
  const todo = mkTodo([['a', 10], ['b', 10], ['c', 10]])
  const batch = docs.balanceByHub(todo, new Map([['a', 5], ['b', 5], ['c', 5]])).slice(0, 9)
  const byHub = batch.reduce((a, t2) => ({ ...a, [t2.hubSlug]: (a[t2.hubSlug] || 0) + 1 }), {})
  assert.deepStrictEqual(byHub, { a: 3, b: 3, c: 3 }, JSON.stringify(byHub))
})

t('29. 같은 입력이면 같은 순서가 나온다 (재현 가능)', () => {
  const mk = () => mkTodo([['b', 3], ['a', 3]])
  const one = docs.balanceByHub(mk(), new Map()).map((x) => x.title).join(',')
  const two = docs.balanceByHub(mk(), new Map()).map((x) => x.title).join(',')
  assert.strictEqual(one, two)
})

t('30. ★ 응답이 잘려도 완결된 블록은 살린다 (생성 슬롯 낭비 방지)', () => {
  // max_tokens로 마지막 블록이 끊긴 실제 형태.
  const truncated = '{"lead":"이 문서는 무엇을 해결한다","blocks":[' +
    '{"heading":"첫 단계","content":"본문 하나입니다."},' +
    '{"heading":"둘째 단계","content":"본문 둘입니다."},' +
    '{"heading":"셋째 단계","content":"본문이 여기서 끊'
  const parsed = docs.parseDocumentJson(truncated, 'max_tokens')
  assert.strictEqual(parsed.blocks.length, 2, JSON.stringify(parsed.blocks))
  assert.strictEqual(parsed.lead, '이 문서는 무엇을 해결한다')
  assert.ok(parsed.blocks.every((b) => b.heading && b.content))
})

t('31. 정상 JSON은 그대로 파싱한다', () => {
  const ok = JSON.stringify({ lead: 'L', blocks: [{ heading: 'H', content: 'C' }], sourceNote: 'S' })
  assert.deepStrictEqual(docs.parseDocumentJson(ok, 'end_turn').blocks, [{ heading: 'H', content: 'C' }])
})

t('32. 건질 게 없으면 실패로 남긴다 (빈 문서를 저장하지 않는다)', () => {
  assert.throws(() => docs.parseDocumentJson('완전히 망가진 응답', 'max_tokens'))
})

t('33. 토큰 상한이 한국어 장문을 감당할 만큼 올라가 있다', () => {
  assert.ok(docs.MAX_TOKENS >= 8000, `max_tokens=${docs.MAX_TOKENS} — 3500에서 다시 내려갔다`)
})

console.log('\n⑥ 캘린더 중복 — 2026-08-06 홈 6칸 중 3칸 중복 사고 회귀 테스트')

const upcoming = require(path.join(__dirname, '..', 'netlify', 'functions', 'extract-upcoming-events-background.js'))._testUtils

t('34. ★ 표현이 조금 다른 같은 사건을 같은 것으로 본다', () => {
  assert.ok(upcoming.isSameEvent('수도권 신규 주택 5만 호 공급안 발표', '수도권 신규 5만 호 공급안 발표'))
  assert.ok(upcoming.isSameEvent('2차 부처 업무보고 재개', '2차 부처 업무보고 재개'))
})

t('35. 다른 사건을 잘못 합치지 않는다', () => {
  assert.ok(!upcoming.isSameEvent('수도권 신규 주택 공급안 발표', '전기차 보조금 신청 마감'))
  assert.ok(!upcoming.isSameEvent('청년월세 신청 마감', '청년내일저축 신청 시작'))
})

t('36. ★ 실제 사고 데이터가 1건으로 접힌다', () => {
  const rows = [
    { event_date: '2026-08-12', title: '수도권 신규 주택 5만 호 공급안 발표' },
    { event_date: '2026-08-12', title: '수도권 신규 5만 호 공급안 발표' },
    { event_date: '2026-08-13', title: '수도권 신규 주택 5만 호 공급안 발표' },
    { event_date: '2026-08-09', title: '2차 부처 업무보고 재개' },
  ]
  const { kept } = upcoming.dropDuplicates(rows, [])
  assert.strictEqual(kept.length, 2, JSON.stringify(kept.map((k) => k.title)))
})

t('37. 이미 저장된 일정과 겹치면 다시 넣지 않는다', () => {
  const existing = [{ event_date: '2026-08-12', title: '수도권 신규 주택 5만 호 공급안 발표' }]
  const { kept } = upcoming.dropDuplicates(
    [{ event_date: '2026-08-13', title: '수도권 신규 5만 호 공급안 발표' }], existing)
  assert.strictEqual(kept.length, 0)
})

t('38. 날짜가 멀면 같은 제목이라도 별개 일정으로 둔다 (반복 일정 보존)', () => {
  const { kept } = upcoming.dropDuplicates([
    { event_date: '2026-08-12', title: '청년월세 신청 마감' },
    { event_date: '2026-11-30', title: '청년월세 신청 마감' },
  ], [])
  assert.strictEqual(kept.length, 2)
})

console.log(`\n총 ${pass + fail}건 · 통과 ${pass} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
