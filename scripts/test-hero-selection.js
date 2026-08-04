// Hero(홈 헤드) 선정 회귀 테스트 — 실행: node scripts/test-hero-selection.js
//
// 사고(2026-08-04): 홈 헤드가 며칠째 같은 토픽에 고정됐다. 원인이 두 겹이었고 둘 다 여기서 고정한다.
//   1) 무게 엔진이 Hero를 재계산 대상에서 빠뜨려 점수가 80시간 낡은 값이었다 → 신선도 게이트
//   2) 선정에 유효기간·회전이 없어 최고점이 유지되면 영구 고정이었다 → 4시간 회전
// 추가 요구(PM): IT/소비재처럼 사건유형 기본 무게가 낮은 도메인도 헤드에 오를 수 있게 → 카테고리 다양성
//
// 2026-08-04: 모듈 로딩 방식을 교체했다. 예전엔 lib/topics.ts에서 순수 함수 구간을 정규식으로
// 잘라내 평가했는데 두 번 깨졌다 — (1) 추출 범위에 DB 조회 함수를 새로 넣었을 때 원인 불명
// 크래시, (2) 타입 표기 제거 정규식이 `: string[]`을 지우다 구문 오류를 만들었을 때.
// 이제 TypeScript 컴파일러로 정식 트랜스파일한다(scripts/lib/load-topics-module.js).
const { loadTopicsModule } = require('./lib/load-topics-module');
const { pickHeroTopic, heroRotationPool, HERO_TUNING } = loadTopicsModule();

const results = [];
const check = (label, pass) => { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); };

const NOW = Date.parse('2026-08-04T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();

// score 내림차순으로 넣는다(getActiveTopics가 그렇게 정렬해 넘긴다).
function topic(name, category, score, { weightAgeH = 1, recencyBonus = 40 } = {}) {
  return {
    name, category, importance_score: score, slug: name,
    ai_context: { weight: { computed_at: hoursAgo(weightAgeH), components: { recency_bonus: recencyBonus } } },
  };
}

// ── 1. 신선도 게이트(24시간 유효기간) ──
{
  const stale = topic('낡은1위', 'Society', 570, { weightAgeH: 80 }); // 실제 사고 재현: 80시간 전 계산
  const fresh = topic('신선2위', 'Economy', 546, { weightAgeH: 9 });
  const hero = pickHeroTopic([stale, fresh], NOW);
  check('1) 점수가 80시간 전 계산된 1위는 Hero가 되지 않는다(24시간 유효기간)', hero.name === '신선2위');
}
{
  const noArticle = topic('기사없음', 'Society', 600, { weightAgeH: 1, recencyBonus: 0 });
  const withArticle = topic('최근기사', 'Economy', 400, { weightAgeH: 1, recencyBonus: 20 });
  const hero = pickHeroTopic([noArticle, withArticle], NOW);
  check('1b) 최근 기사 활동이 없으면(recency_bonus=0) 최고점이어도 제외', hero.name === '최근기사');
}
{
  // 전부 낡았으면 홈이 비지 않도록 폴백해야 한다
  const a = topic('낡음A', 'Society', 570, { weightAgeH: 80 });
  const b = topic('낡음B', 'Economy', 500, { weightAgeH: 90 });
  check('1c) 신선한 후보가 전무하면 폴백(홈이 비지 않음)', pickHeroTopic([a, b], NOW) !== null);
  check('1d) 빈 배열은 null', pickHeroTopic([], NOW) === null);
}

// ── 2. 회전(같은 토픽이 오래 머물지 않음) ──
{
  const list = [
    topic('A', 'Society', 500), topic('B', 'Economy', 480), topic('C', 'Technology', 460),
    topic('D', 'Science', 440), topic('E', 'Business', 420), topic('F', 'Health', 400),
  ];
  const H = HERO_TUNING.HERO_ROTATION_HOURS;
  const picks = [];
  for (let i = 0; i < 6; i++) picks.push(pickHeroTopic(list, NOW + i * H * 3600000).name);
  check(`2) ${H}시간 단위로 헤드가 바뀐다(6구간 전부 서로 다름: ${picks.join('→')})`, new Set(picks).size === 6);

  // 같은 구간 안에서는 안정적이어야 한다(요청마다 헤드가 흔들리면 안 됨)
  const sameBucket = [0, 60, 119].map((m) => pickHeroTopic(list, NOW + m * 60000).name);
  check(`2b) 같은 ${H}시간 구간 안에서는 같은 헤드 유지(캐시/ISR 안정성)`, new Set(sameBucket).size === 1);

  check('2c) 회전 주기가 PM 지시 범위(3~6시간) 안', H >= 3 && H <= 6);

  // 최대 체류 시간: 어떤 토픽도 회전주기를 넘겨 연속으로 헤드에 있지 않아야 한다
  let maxRun = 1, run = 1;
  let prev = pickHeroTopic(list, NOW).name;
  for (let m = 30; m <= 24 * 60; m += 30) {
    const cur = pickHeroTopic(list, NOW + m * 60000).name;
    if (cur === prev) run++; else { maxRun = Math.max(maxRun, run); run = 1; }
    prev = cur;
  }
  maxRun = Math.max(maxRun, run);
  check(`2d) 연속 체류가 회전주기 이내(최대 ${maxRun * 0.5}시간 <= ${H}시간)`, maxRun * 0.5 <= H);
}

// ── 3. 카테고리 다양성(IT/소비재도 헤드에 오를 수 있는가) ──
{
  // 실제 데이터 형태 재현: 상위권이 Society/정치·국제로 도배되고 IT는 점수가 낮다
  const list = [
    topic('트럼프 하마스', 'Society', 570), topic('트럼프 이란', 'Society', 538),
    topic('검찰 수사권', 'Society', 520), topic('미국 이란 갈등', 'Society', 507),
    topic('한-아르헨 원유', 'Economy', 546),
    topic('갤럭시 Z 폴드8', 'Technology', 308), // 신제품·모델출시 기본 무게 150의 현실적 상한
  ];
  const pool = heroRotationPool(list, NOW).map((t) => t.name);
  check(`3) 회전 후보가 카테고리당 1개로 구성(${pool.join(', ')})`, pool.length === new Set(list.filter((t) => pool.includes(t.name)).map((t) => t.category)).size);
  check('3b) Society가 상위 4개를 차지해도 후보에는 1개만 들어간다', pool.filter((n) => ['트럼프 하마스', '트럼프 이란', '검찰 수사권', '미국 이란 갈등'].includes(n)).length === 1);
  check(`3c) 점수가 낮은 IT 토픽(308, 1위의 ${Math.round(308 / 570 * 100)}%)도 후보에 포함`, pool.includes('갤럭시 Z 폴드8'));
  // 24시간 동안 IT 토픽이 실제로 헤드에 오르는지
  const day = [];
  for (let h = 0; h < 24; h += HERO_TUNING.HERO_ROTATION_HOURS) day.push(pickHeroTopic(list, NOW + h * 3600000).name);
  check(`3d) 24시간 안에 IT 토픽이 헤드에 오른다(${day.join(' → ')})`, day.includes('갤럭시 Z 폴드8'));
}

// ── 4. 점수 하한(다양성이 품질을 무너뜨리지 않는가) ──
{
  const list = [
    topic('압도적1위', 'Society', 900),
    topic('너무낮음', 'Technology', 100), // 1위의 11% — 헤드에 올라선 안 된다
  ];
  const pool = heroRotationPool(list, NOW).map((t) => t.name);
  check(`4) 1위 대비 ${HERO_TUNING.HERO_MIN_SCORE_RATIO * 100}% 미만 토픽은 후보에서 제외`, !pool.includes('너무낮음') && pool.includes('압도적1위'));
  check('4b) 후보가 1개뿐이면 그 토픽이 계속 헤드(억지 회전 없음)', pickHeroTopic(list, NOW).name === '압도적1위' && pickHeroTopic(list, NOW + 8 * 3600000).name === '압도적1위');
}

// ── 4c. 경량 조회 형태(weight가 최상위)도 같은 판정을 받는지 ──
//      홈은 경량 조회(getHeroCandidates: weight 별칭)로 Hero를 고르고, 목록은 전체 조회
//      (getActiveTopics: ai_context.weight)를 쓴다. 두 형태의 판정이 갈리면 화면 헤드와
//      운영 점검 결과가 서로 달라지므로 같은 결과가 나와야 한다.
{
  const nested = { name: 'N', category: 'Society', importance_score: 500, ai_context: { weight: { computed_at: hoursAgo(2), components: { recency_bonus: 40 } } } };
  const flat = { name: 'F', category: 'Society', importance_score: 500, weight: { computed_at: hoursAgo(2), components: { recency_bonus: 40 } } };
  check('4c) ai_context.weight 형태와 최상위 weight 형태가 모두 Hero 자격으로 인정',
    pickHeroTopic([nested], NOW)?.name === 'N' && pickHeroTopic([flat], NOW)?.name === 'F');

  const staleFlat = { name: 'SF', category: 'Society', importance_score: 900, weight: { computed_at: hoursAgo(80), components: { recency_bonus: 40 } } };
  const freshFlat = { name: 'FF', category: 'Economy', importance_score: 400, weight: { computed_at: hoursAgo(2), components: { recency_bonus: 40 } } };
  check('4d) 최상위 weight 형태에서도 80시간 전 계산은 탈락',
    pickHeroTopic([staleFlat, freshFlat], NOW)?.name === 'FF');
}

// ── 5. 카테고리 없는 데이터 방어 ──
{
  const list = [{ name: 'X', importance_score: 500, ai_context: { weight: { computed_at: hoursAgo(1), components: { recency_bonus: 40 } } } }];
  check('5) category가 없어도 예외 없이 동작', pickHeroTopic(list, NOW).name === 'X');
  check('5b) ai_context가 없어도 폴백으로 동작', pickHeroTopic([{ name: 'Y', importance_score: 1 }], NOW).name === 'Y');
}

const failCount = results.filter((r) => !r.pass).length;
console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
process.exitCode = failCount === 0 ? 0 : 1;
