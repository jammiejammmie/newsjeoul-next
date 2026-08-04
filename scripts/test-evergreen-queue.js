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

console.log('\n① toSlug — URL 규칙')

t('1. 연도·날짜를 URL에 넣지 않는다(§6.1)', () => {
  // 입력에 연도가 있어도 슬러그에 남으면 해마다 URL이 갈린다.
  const s = detect.toSlug('갤럭시 Z 폴드8')
  assert.ok(!/20\d\d/.test(s), `연도가 남았다: ${s}`)
})

t('2. 한글 이름도 영문 슬러그로 변환된다', () => {
  assert.ok(detect.toSlug('갤럭시 Z 폴드8').includes('galaxy'), detect.toSlug('갤럭시 Z 폴드8'))
  assert.ok(detect.toSlug('전기차 보조금').includes('subsidy'), detect.toSlug('전기차 보조금'))
  assert.ok(detect.toSlug('청년 월세').includes('youth'), detect.toSlug('청년 월세'))
})

t('3. 슬러그에 한글·공백·특수문자가 남지 않는다', () => {
  for (const n of ['알 수 없는 제품명', '가나다 라마바', 'A/B 테스트!! (신형)', '트럼프 이란 보복']) {
    const s = detect.toSlug(n)
    assert.ok(!/[가-힣\s]/.test(s), `${n} → ${s}`)
    assert.ok(/^[a-z0-9-]*$/.test(s), `${n} → ${s}`)
  }
})

t('4. 슬러그를 만들 수 없는 이름은 빈 문자열이 된다 (버려질 수 있게)', () => {
  // 전부 한글인 이름은 영문 매핑에 없으면 슬러그가 비어야 한다 — 억지로 만들면 URL이 의미불명이 된다.
  assert.strictEqual(detect.toSlug('가나다'), '')
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

t(`10. high_score_no_hub은 ${detect.HIGH_SCORE_MIN}g 미만을 잡지 않는다`, () => {
  assert.strictEqual(detect.detectHighScore([topic('무거운 이슈', detect.HIGH_SCORE_MIN - 1)], []).length, 0)
  assert.strictEqual(detect.detectHighScore([topic('무거운 이슈', detect.HIGH_SCORE_MIN)], []).length, 1)
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

console.log(`\n총 ${pass + fail}건 · 통과 ${pass} · 실패 ${fail}`)
process.exit(fail ? 1 : 0)
