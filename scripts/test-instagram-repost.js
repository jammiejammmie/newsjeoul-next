// 인스타 같은-사건 재게시 차단 회귀 테스트 — 실행: node scripts/test-instagram-repost.js
//
// 계기(2026-08-18): "스트레이 키즈 빌보드 200 9연속 1위"(08-17)와 "스트레이 키즈 빌보드 200
// 1위"(08-18)가 24시간 간격으로 인스타에 나갔다. 같은 사건인데 토픽이 둘로 갈려 있었고,
// 중복 방지가 토픽 단위(posted_at is null)뿐이라 그대로 통과했다.
//
// 이 테스트가 지키는 것은 "문턱 값"이다. titleSimilarity는 4글자 이상 공통어가 하나만 있어도
// 0.55를 바닥값으로 주기 때문에, 수집용 문턱(0.42)을 게시 억제에 그대로 쓰면 "국민의힘
// 최고위원 선거"와 "민주당 최고위원 선거"처럼 다른 사건까지 막는다. 아래 라벨쌍은 실제
// 게시 이력에서 뽑았다.

const { titleSimilarity, MATCH_THRESHOLD } = require('../netlify/functions/buzz-engine');

// instagram-publish.js의 REPOST_SIMILARITY와 같은 값이어야 한다. 소스에서 직접 읽어
// 상수가 바뀌면 이 테스트가 먼저 깨지게 한다(두 곳에 숫자를 적어두면 반드시 어긋난다).
const fs = require('fs');
const src = fs.readFileSync(require('path').resolve(__dirname, '../netlify/functions/instagram-publish.js'), 'utf8');
const THRESHOLD = Number(src.match(/const REPOST_SIMILARITY = ([\d.]+);/)?.[1]);

let pass = 0, fail = 0;
function check(label, ok, detail) {
  if (ok) { pass++; console.log('PASS - ' + label); }
  else { fail++; console.log('FAIL - ' + label + (detail ? '\n        ' + detail : '')); }
}

check('0) instagram-publish.js에서 REPOST_SIMILARITY를 읽을 수 있다', Number.isFinite(THRESHOLD), String(THRESHOLD));

// [제목A, 제목B, 같은 사건인가]
const CASES = [
  ['스트레이 키즈 빌보드 200 1위', '스트레이 키즈 빌보드 200 9연속 1위', true],
  ['트럼프-김정은 사진 공개', '트럼프-김정은 판문점 회동 사진 공개', true],
  ['인도네시아 강진 피해', '인도네시아 강진 및 쓰나미', true],
  ['국민의힘 최고위원 선거', '민주당 최고위원 선거', false],
  ['어벤져스: 둠스데이 예고편 공개', '스파이더맨 4 흥행 기록', false],
  ['하영 증조부 친일파 논란', '홍상수 김민희 로카르노 영화제 수상', false],
];

CASES.forEach(([a, b, same], i) => {
  const s = titleSimilarity(a, b);
  const blocked = s >= THRESHOLD;
  check(
    `${i + 1}) ${same ? '같은 사건 → 막는다' : '다른 사건 → 통과시킨다'}: ${a.slice(0, 14)} / ${b.slice(0, 14)}`,
    blocked === same,
    `유사도 ${s.toFixed(3)} · 문턱 ${THRESHOLD} · ${blocked ? '막음' : '통과'}`
  );
});

// 수집용 문턱을 그대로 쓰면 왜 안 되는지를 고정한다 — 누가 REPOST_SIMILARITY를 지우고
// MATCH_THRESHOLD로 되돌리면 이 테스트가 이유와 함께 깨진다.
const fp = CASES.find(([a, b, same]) => !same && titleSimilarity(a, b) >= MATCH_THRESHOLD);
check(
  '7) 수집용 MATCH_THRESHOLD를 게시 억제에 쓰면 오탐이 난다(그래서 분리했다)',
  !!fp,
  fp ? `${fp[0]} ≈ ${fp[1]} = ${titleSimilarity(fp[0], fp[1]).toFixed(3)} ≥ ${MATCH_THRESHOLD}` : '오탐 사례가 사라졌다면 문턱 분리를 재검토할 것'
);

check('8) 게시용 문턱이 수집용보다 높다', THRESHOLD > MATCH_THRESHOLD, `게시 ${THRESHOLD} vs 수집 ${MATCH_THRESHOLD}`);

console.log(`\n${fail === 0 ? '전체 통과' : '일부 실패'}(${pass}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
