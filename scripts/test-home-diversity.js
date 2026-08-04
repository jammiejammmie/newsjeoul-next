// 홈 다양성 회귀 테스트 — 실행: node scripts/test-home-diversity.js
//
// PM 지시 2026-08-04로 고친 세 가지를 고정한다:
//  (1) 사이드 카드(홈 2·3번째)가 rest.slice(0,2)로 고정돼 Hero가 바뀌어도 그대로였다
//  (2) 오늘의 무게 인덱스에 같은 사안 파편이 도배됐다(실측: 상위 41건 중 이란 관련 10건)
//  (3) 오늘의 발견이 항상 상위 [0]번만 써서 트럼프가 계속 나왔다
//
// lib/topics.ts를 정식 트랜스파일해 불러온다(scripts/lib/load-topics-module.js) — 예전에는
// 정규식으로 순수 함수 구간을 잘라 썼는데 두 번 깨졌다(추출 범위에 DB 함수 삽입, 타입 표기 제거 오류).
const { loadTopicsModule } = require('./lib/load-topics-module');
const {
  pickHeroTopic, pickSideTopics, diversifyForIndex, groupByTopicCluster,
  HOME_DIVERSITY_TUNING, HERO_TUNING,
} = loadTopicsModule();

const results = [];
const check = (label, pass) => { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); };

const NOW = Date.parse('2026-08-04T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
function topic(name, category, score, { weightAgeH = 1, recencyBonus = 40 } = {}) {
  return {
    name, category, slug: name.replace(/\s/g, '-'), importance_score: score,
    weight: { computed_at: hoursAgo(weightAgeH), components: { recency_bonus: recencyBonus } },
  };
}

// 실측 데이터를 그대로 옮긴 시나리오(상위권이 이란/트럼프 파편으로 도배된 상태)
const IRAN_CLUSTER = [
  topic('트럼프 이란 보복 예고', 'Society', 518),
  topic('미-이란 군사 갈등 상황', 'Society', 510),
  topic('미국-이란 무력 충돌', 'Society', 507),
  topic('이란 전쟁 국제 정세', 'Society', 506),
  topic('이란 유조선 공격 및 전쟁 우려', 'Society', 495),
  topic('트럼프 이란 공격 취소', 'Society', 488),
  topic('미·이스라엘 이란 공습 계획', 'Society', 478),
  topic('이란-트럼프 중동 정세', 'Society', 468),
];
const OTHERS = [
  topic('한-아르헨 정상회담 원유 협력', 'Economy', 546),
  topic('일본 구마모토 강진 피해', 'Society', 540),
  topic('폭염 및 열대야 지속', 'Science', 511),
  topic('폭염으로 인한 사망 사고 증가', 'Health', 484),
  topic('롯데카드 고객정보 유출 사건', 'Business', 460),
  topic('KT 펨토셀 해킹 및 불법 소액결제 사건', 'Technology', 455),
  topic('바둑 AI 대결', 'Entertainment', 416),
  topic('AI 패권 경쟁', 'Technology', 440),
  topic('현대차·기아 실적 발표', 'Automobile', 392),
];
const ALL = [...IRAN_CLUSTER, ...OTHERS].sort((a, b) => b.importance_score - a.importance_score);

// ── 1. 인덱스 클러스터 제한 ──
{
  const out = diversifyForIndex(ALL, { size: 12 });
  const iranCount = out.filter((t) => /이란/.test(t.name)).length;
  check(`1) 이란 파편 8건이 최대 ${HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER}건으로 제한(실제 ${iranCount}건)`,
    iranCount <= HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER);

  const groups = groupByTopicCluster(out);
  const over = groups.filter((g) => g.items.length > HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER);
  if (over.length) over.forEach((g) => console.log(`   초과: [${g.label}] ${g.items.map((x) => x.name).join(' / ')}`));
  check('1b) 어떤 클러스터도 상한을 넘지 않음(검증도 같은 판정 사용)', over.length === 0);

  const cats = new Set(out.map((t) => t.category));
  check(`1c) 여러 카테고리가 노출됨(${cats.size}종)`, cats.size >= 5);
}
// 조사가 붙은 같은 주제도 묶이는지 — "폭염"과 "폭염으로"
{
  const only = [topic('폭염 및 열대야 지속', 'Science', 511), topic('폭염으로 인한 사망 사고 증가', 'Health', 484), topic('극한 폭염 기록 경신', 'Science', 474)];
  const out = diversifyForIndex(only, { size: 10 });
  check('1d) 조사 차이(폭염 / 폭염으로)도 같은 클러스터로 묶여 상한 적용', out.length === HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER);
}
// 상한이 목록 길이보다 우선하는지 — 걸러낸 항목을 다시 채워 넣으면 상한이 무력화된다.
// (처음 구현이 그랬고, 이 테스트가 이란 파편 3건 노출을 잡아냈다)
{
  const out = diversifyForIndex(IRAN_CLUSTER, { size: 6 });
  check(
    `1e) 같은 클러스터뿐이면 목표(6)보다 짧아도 상한(${HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER})을 지킨다(실제 ${out.length}건)`,
    out.length === HOME_DIVERSITY_TUNING.INDEX_MAX_PER_CLUSTER
  );
}
// Hero를 seed로 넘기면 Hero 주제도 상한에 계산되는지
{
  const hero = topic('트럼프 이란 보복 예고', 'Society', 518);
  const pool = ALL.filter((t) => t.slug !== hero.slug);
  const withSeed = diversifyForIndex(pool, { size: 12, seed: [hero] });
  const withoutSeed = diversifyForIndex(pool, { size: 12 });
  const iranWith = withSeed.filter((t) => /이란/.test(t.name)).length;
  const iranWithout = withoutSeed.filter((t) => /이란/.test(t.name)).length;
  check(`1f) Hero를 seed로 넘기면 Hero 주제가 상한에 포함됨(seed 있음 ${iranWith} < 없음 ${iranWithout})`, iranWith < iranWithout);
}

// ── 2. 사이드 카드 ──
{
  const hero = pickHeroTopic(ALL, NOW);
  const sides = pickSideTopics(ALL, hero, NOW);
  check(`2) 사이드 카드가 ${HOME_DIVERSITY_TUNING.SIDE_CARD_COUNT}개 선정됨`, sides.length === HOME_DIVERSITY_TUNING.SIDE_CARD_COUNT);
  check('2b) Hero 자신은 사이드에 들어가지 않음', !sides.some((s) => s.slug === hero.slug));
  check('2c) Hero와 같은 카테고리를 피함', sides.every((s) => s.category !== hero.category));
  check('2d) 사이드끼리도 카테고리가 겹치지 않음', new Set(sides.map((s) => s.category)).size === sides.length);
  const heroSideGroups = groupByTopicCluster([hero, ...sides]);
  check('2e) Hero와 사이드가 서로 다른 주제 클러스터', heroSideGroups.length === 1 + sides.length);
}
// 회전 — 시간이 지나면 사이드도 바뀐다(이번 지시의 핵심)
{
  const H = HERO_TUNING.HERO_ROTATION_HOURS;
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const now = NOW + i * H * 3600000;
    pickSideTopics(ALL, pickHeroTopic(ALL, now), now).forEach((s) => seen.add(s.slug));
  }
  check(`2f) ${H}시간 회전으로 24시간 동안 사이드에 ${seen.size}종이 노출(고정 아님)`, seen.size >= 4);

  const a = pickSideTopics(ALL, pickHeroTopic(ALL, NOW), NOW).map((s) => s.slug).join(',');
  const b = pickSideTopics(ALL, pickHeroTopic(ALL, NOW + 60 * 60000), NOW + 60 * 60000).map((s) => s.slug).join(',');
  check('2g) 같은 회전 구간 안에서는 사이드가 유지됨(ISR 캐시 안정성)', a === b);
}
// 후보가 극단적으로 적을 때도 죽지 않는지
{
  const tiny = [topic('단일 토픽', 'Society', 500)];
  check('2h) 후보가 Hero 1개뿐이면 사이드는 빈 배열(예외 없음)', pickSideTopics(tiny, tiny[0], NOW).length === 0);
  check('2i) 빈 배열 입력에도 예외 없음', pickSideTopics([], null, NOW).length === 0);
}

// ── 3. 클러스터 판별 자체 ──
{
  const groups = groupByTopicCluster(IRAN_CLUSTER);
  check(`3) 이란 파편 8건이 하나의 클러스터로 묶임(${groups.length}개 그룹)`, groups.length === 1);
}
{
  // 과거 실패: 토큰 누적 병합으로 41건 중 26건이 한 덩어리가 됐다(협력→브라질→이란→사망→폭염).
  // 서로 무관한 주제가 합쳐지지 않아야 한다.
  const unrelated = [
    topic('한-아르헨 정상회담 원유 협력', 'Economy', 546),
    topic('일본 구마모토 강진 피해', 'Society', 540),
    topic('롯데카드 고객정보 유출 사건', 'Business', 460),
    topic('바둑 AI 대결', 'Entertainment', 416),
  ];
  check('3b) 서로 무관한 4건은 4개 클러스터(전이 연쇄로 합쳐지지 않음)', groupByTopicCluster(unrelated).length === 4);
}
{
  // 역할어로 묶이면 안 된다 — "대통령/방문"은 주제를 구분하지 못한다.
  const roleWords = [
    topic('인도네시아 대통령 한국 방문', 'Society', 505),
    topic('이재명 대통령 브라질 방문', 'Society', 493),
  ];
  check('3c) 역할어(대통령/방문)만 겹치는 서로 다른 사안은 묶이지 않음', groupByTopicCluster(roleWords).length === 2);
}

const failCount = results.filter((r) => !r.pass).length;
console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
process.exitCode = failCount === 0 ? 0 : 1;
