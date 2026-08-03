// lib/polls-kr.js 회귀 테스트 — 실행: node scripts/test-polls-kr.js
// 사고(2026-08-03): candidate_*_pct가 integer 컬럼인데 모델이 49.6을 반환해 아침·저녁
// 여론조사 갱신이 둘 다 500으로 계속 실패했다. 아래는 "DB에 넣을 수 없는 값이 통과하지 않는다"를 고정한다.
const { normalizePollRows, toIntOrNull } = require('../netlify/functions/lib/polls-kr');

const results = [];
const check = (label, pass) => { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); };

// 1) 실제 사고 입력 — 소수점 지지율이 정수로 반올림되는지
{
  const [row] = normalizePollRows([{ region: '서울특별시', candidate_a_pct: 49.6, candidate_b_pct: 38.2, sample_size: 1000 }]);
  check('1) 소수점 지지율이 정수로 반올림(49.6→50, 38.2→38)', row.candidate_a_pct === 50 && row.candidate_b_pct === 38);
  check('1b) 모든 pct/sample_size가 정수 또는 null', [row.candidate_a_pct, row.candidate_b_pct, row.candidate_c_pct, row.candidate_d_pct, row.sample_size]
    .every((v) => v === null || Number.isInteger(v)));
}

// 2) 단위/구분자가 붙어 와도 흡수
{
  const [row] = normalizePollRows([{ candidate_a_pct: '49.6%', sample_size: '1,003명' }]);
  check('2) "49.6%" → 50, "1,003명" → 1003', row.candidate_a_pct === 50 && row.sample_size === 1003);
}

// 3) 값 없음은 0이 아니라 null로(0%는 다른 뜻이므로)
{
  const [row] = normalizePollRows([{ candidate_a_pct: 46, candidate_c_pct: null, candidate_d_pct: '', sample_size: '미정' }]);
  check('3) null/빈문자/비숫자는 null로 떨어지고 0으로 채우지 않음',
    row.candidate_a_pct === 46 && row.candidate_c_pct === null && row.candidate_d_pct === null && row.sample_size === null);
}

// 4) 범위 밖 이상값 방어
{
  const [row] = normalizePollRows([{ candidate_a_pct: 1200, candidate_b_pct: -5, sample_size: 0 }]);
  check('4) 0~100 밖 지지율과 표본수 0은 null로 차단', row.candidate_a_pct === null && row.candidate_b_pct === null && row.sample_size === null);
}

// 5) 입력 객체를 변형하지 않는지(원본 보존)
{
  const src = [{ candidate_a_pct: 49.6 }];
  normalizePollRows(src);
  check('5) 입력 배열/객체를 변형하지 않음', src[0].candidate_a_pct === 49.6);
}

// 6) 비배열/빈 입력 방어
{
  check('6) 비배열 입력은 빈 배열로', normalizePollRows(null).length === 0 && normalizePollRows(undefined).length === 0);
}

// 7) 다른 필드는 그대로 통과
{
  const [row] = normalizePollRows([{ region: '부산광역시', candidate_a: '전재수', poll_company: '한국갤럽', survey_date: '2026-08-01', candidate_a_pct: 43.4 }]);
  check('7) 문자열 필드는 손대지 않고 통과', row.region === '부산광역시' && row.candidate_a === '전재수' && row.survey_date === '2026-08-01' && row.candidate_a_pct === 43);
}

// 8) toIntOrNull 단위 동작
{
  check('8) toIntOrNull 경계값(0과 100은 유효)', toIntOrNull(0) === 0 && toIntOrNull(100) === 100 && toIntOrNull(101) === null);
}

const failCount = results.filter((r) => !r.pass).length;
console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
process.exit(failCount === 0 ? 0 : 1);
