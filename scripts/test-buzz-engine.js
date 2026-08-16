// test-buzz-engine.js — buzz-engine의 실피드 동작 검증(외부 API만 사용, DB/키 불필요)
// 실행: node scripts/test-buzz-engine.js
//
// 검증 항목
//  1) 9개 피드(Top Stories + 섹션 7 + 트렌드) 수집 성공 여부
//  2) 실제 제목에 대한 buzz 점수와 근거가 납득 가능한지
//  3) 카테고리 쿼터가 단일 이슈 독점을 실제로 막는지(트럼프 시나리오)

const {
  fetchBuzzIndex, scoreTitle, applyCategoryQuota, QUOTA_PLAN,
  parseTraffic, titleSimilarity, bucketOf, countBuckets,
} = require('../netlify/functions/buzz-engine');

function line(t) { console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70)); }

async function main() {
  line('1. 피드 수집');
  const t0 = Date.now();
  const index = await fetchBuzzIndex();
  const elapsed = Date.now() - t0;
  console.log(`소요 ${elapsed}ms`);
  console.log('stats:', JSON.stringify(index.stats));
  console.log(`Top Stories ${index.top.length}건`);
  for (const [k, v] of Object.entries(index.sections)) console.log(`  ${k}: ${v.length}건`);
  console.log(`트렌드 ${index.trends.length}건, 최대 검색량 ${index.maxTraffic}`);

  console.log('\n[Top Stories 상위 5]');
  index.top.slice(0, 5).forEach((i) => console.log(`  ${i.rank}. ${i.title} — ${i.source_name}`));
  console.log('\n[트렌드 상위 5]');
  index.trends.slice(0, 5).forEach((t) => console.log(`  ${t.keyword} (${t.traffic_raw} = ${t.traffic}) 관련기사 ${t.news_items.length}건`));

  line('2. 점수 산정 — 실제 Top Stories 제목 재투입(자기 자신은 높게 나와야 정상)');
  for (const item of index.top.slice(0, 5)) {
    const r = scoreTitle(item.title, index, { publishedAt: item.published_at });
    console.log(`\n  "${item.title}"`);
    console.log(`   score=${r.score} bucket_hint=${r.bucket_hint}`);
    r.reasons.forEach((x) => console.log(`     - ${x}`));
  }

  line('3. 점수 산정 — 화제와 무관한 제목(낮게 나와야 정상)');
  const controls = [
    '지역 도서관 신간 안내 3월 셋째 주',
    '오늘의 운세 무료로 확인하는 방법',
    '중소기업 회계 실무 교육과정 수강생 모집',
  ];
  for (const c of controls) {
    const r = scoreTitle(c, index, { publishedAt: new Date().toISOString() });
    console.log(`  score=${String(r.score).padStart(3)} matched=${r.matched}  "${c}"`);
  }

  line('4. 유닛 검증 — parseTraffic / titleSimilarity / bucketOf');
  const cases = [
    ['200+', 200], ['1,000+', 1000], ['1만+', 10000], ['2만+', 20000], ['', 0],
  ];
  let unitFail = 0;
  for (const [raw, want] of cases) {
    const got = parseTraffic(raw);
    const ok = got === want;
    if (!ok) unitFail++;
    console.log(`  parseTraffic(${JSON.stringify(raw)}) = ${got} ${ok ? 'OK' : 'FAIL(기대 ' + want + ')'}`);
  }
  const simPairs = [
    // 같은 사건, 다른 표기(㎜/mm, 조사 차이) — 반드시 매칭돼야 한다
    ['거제 시간당 100㎜ 물폭탄…거제 전역에 긴급 대피 요청', '경남 거제에 시간당 100mm 이상 집중호우, 침수 주의', true],
    ['최태원 노소영 재산분할 9440억 확정', '노소영, 최태원에 “현금으로” 재산분할 9440억원', true],
    // 서로 무관 — 매칭되면 오탐(쿼터/우선순위가 통째로 오염된다)
    ['김민석 연승…민주당 대표 유력', '삼성전자 3분기 영업이익 발표', false],
    ['그린벨트 풀어 10만 가구 공급 대책 발표', '손흥민 결승골로 토트넘 승리', false],
    ['한국은행 기준금리 동결 결정', '한국 영화 관객수 1000만 돌파', false],
  ];
  for (const [a, b, shouldMatch] of simPairs) {
    const sim = titleSimilarity(a, b);
    const ok = (sim >= 0.42) === shouldMatch;
    if (!ok) unitFail++;
    console.log(`  sim=${sim.toFixed(3)} 기대매칭=${shouldMatch} ${ok ? 'OK' : 'FAIL'}`);
  }
  const bucketCases = [['Society', 'politics_intl'], ['Business', 'economy'], ['Sports', 'sports'], ['Health', 'etc'], [null, 'etc']];
  for (const [cat, want] of bucketCases) {
    const got = bucketOf(cat, null);
    const ok = got === want;
    if (!ok) unitFail++;
    console.log(`  bucketOf(${cat}) = ${got} ${ok ? 'OK' : 'FAIL(기대 ' + want + ')'}`);
  }

  line('5. 카테고리 쿼터 — "트럼프 단일 이슈 독점" 시나리오');
  // 정치/국제 30건이 buzz 최상위를 싹쓸이한 상태에서 20건을 발행하려 한다.
  const flood = [];
  for (let i = 0; i < 30; i++) flood.push({ id: `pol-${i}`, name: `트럼프 관세 관련 이슈 ${i}`, category: 'Society', buzz_score: 200 - i });
  for (let i = 0; i < 10; i++) flood.push({ id: `eco-${i}`, name: `경제 이슈 ${i}`, category: 'Economy', buzz_score: 100 - i });
  for (let i = 0; i < 10; i++) flood.push({ id: `tec-${i}`, name: `테크 이슈 ${i}`, category: 'Technology', buzz_score: 90 - i });
  for (let i = 0; i < 10; i++) flood.push({ id: `spo-${i}`, name: `스포츠 이슈 ${i}`, category: 'Sports', buzz_score: 80 - i });
  for (let i = 0; i < 10; i++) flood.push({ id: `ent-${i}`, name: `연예 이슈 ${i}`, category: 'Entertainment', buzz_score: 70 - i });
  for (let i = 0; i < 5; i++) flood.push({ id: `lif-${i}`, name: `신제품 이슈 ${i}`, category: 'Lifestyle', buzz_score: 60 - i });
  for (let i = 0; i < 5; i++) flood.push({ id: `hea-${i}`, name: `건강 이슈 ${i}`, category: 'Health', buzz_score: 50 - i });

  const noQuota = [...flood].sort((a, b) => b.buzz_score - a.buzz_score).slice(0, 20);
  console.log('\n  [쿼터 없음] 상위 20건 버킷 분포:');
  console.log('   ', JSON.stringify(countBuckets(noQuota)));

  const { selected, deferred, report } = applyCategoryQuota(flood, 20, {});
  console.log('\n  [쿼터 적용] 선택 20건 버킷 분포:');
  console.log('   ', JSON.stringify(countBuckets(selected)));
  console.log('    상한:', JSON.stringify(report.capOf));
  console.log(`    보류 ${deferred.length}건 (사유 예: ${deferred.slice(0, 3).map((d) => d.defer_reason).join(', ')})`);

  const polShare = countBuckets(selected).politics_intl / selected.length;
  const quotaOk = polShare <= 0.20 + 1e-9;
  console.log(`\n  정치/국제 비중 ${(polShare * 100).toFixed(1)}% (상한 20%) → ${quotaOk ? 'PASS' : 'FAIL'}`);

  line('6. 누적 창 반영 — 이미 정치가 상한을 채운 상태');
  const already = { politics_intl: 20, economy: 5, tech_ai: 0, sports: 0, entertainment: 0, product_consumer: 0, etc: 0 };
  const r2 = applyCategoryQuota(flood, 10, already);
  console.log('  선택 분포:', JSON.stringify(countBuckets(r2.selected)));
  const pol2 = countBuckets(r2.selected).politics_intl;
  console.log(`  정치/국제 추가 선택 ${pol2}건 → ${pol2 === 0 ? 'PASS(이미 상한 초과라 0건이 정상)' : 'CHECK'}`);

  line('결과 요약');
  const feedsOk = index.stats.feeds_ok === 8 && index.stats.trends_ok;
  console.log(`  피드 8/8 + 트렌드: ${feedsOk ? 'PASS' : 'FAIL(ok=' + index.stats.feeds_ok + ', trends=' + index.stats.trends_ok + ')'}`);
  console.log(`  유닛 검증: ${unitFail === 0 ? 'PASS' : 'FAIL ' + unitFail + '건'}`);
  console.log(`  쿼터 집행: ${quotaOk ? 'PASS' : 'FAIL'}`);
  console.log(`  수집 소요: ${elapsed}ms ${elapsed < 10000 ? '(26초 캡 여유 있음)' : '(주의: 캡 압박)'}`);
  process.exit(feedsOk && quotaOk && unitFail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('테스트 실패:', e); process.exit(1); });
