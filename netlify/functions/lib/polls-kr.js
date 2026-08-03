// polls_kr 적재 전 정규화 — update-elections.js / update-elections-evening.js 공용.
//
// 사고(2026-08-03): 아침·저녁 여론조사 갱신 워크플로우가 둘 다 계속 실패하고 있었다.
//   Supabase error: invalid input syntax for type integer: "49.6"
// polls_kr의 candidate_*_pct / sample_size는 integer 컬럼인데, 프롬프트가 예시로 정수(46, 38)만
// 보여줬을 뿐 "정수로만 답하라"고 요구하지 않아서, 웹 검색으로 실제 여론조사를 찾아온 모델이
// 원자료 그대로 소수점 지지율(49.6%)을 넣어 반환했다. 한국 여론조사는 소수점 1자리 발표가
// 일반적이므로 이건 모델의 실수가 아니라 애초에 예상해야 했던 정상 입력이다.
//
// 그래서 프롬프트 지시만 고치지 않고(모델 출력은 언제든 흔들린다) 적재 직전에 값을 강제
// 정규화한다 — 외부 생성 데이터를 DB 제약에 맞추는 책임은 호출하는 쪽에 둔다.
//
// 정밀도에 대한 판단: 지지율을 정수로 반올림하면 49.6 → 50이 되어 소수점 정보가 사라진다.
// 그래도 정수 반올림을 택한 이유는, 컬럼 타입을 numeric으로 넓히려면 마이그레이션이 필요하고
// 그 적용 전에 배포되면 같은 실패가 계속되기 때문이다. 지지율 0.4%p 차이보다 "매일 갱신이
// 아예 안 되는 것"이 훨씬 큰 손실이라고 판단했다. 소수점 보존이 필요해지면 polls_kr의
// candidate_*_pct를 numeric(4,1)로 변경한 뒤 이 파일의 round만 걷어내면 된다.

const PCT_FIELDS = ['candidate_a_pct', 'candidate_b_pct', 'candidate_c_pct', 'candidate_d_pct'];
const MAX_SAMPLE_SIZE = 1000000; // 표본 수 오탐 방어(모델이 "1,000명"을 파싱해 이상값을 넣는 경우).

// 숫자로 쓸 수 없는 값(null/빈문자/"미정"/NaN)은 null로 떨어뜨린다 — 컬럼이 nullable이므로
// 억지로 0을 넣지 않는다(0%는 "응답 없음"이 아니라 "지지율 0%"라는 다른 뜻이 된다).
function toIntOrNull(value, { min = 0, max = 100 } = {}) {
  if (value === null || value === undefined || value === '') return null;
  // "49.6%", "1,000명"처럼 단위·구분자가 붙어 오는 경우까지 흡수한다.
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

// polls_kr 행 배열을 그대로 받아 정규화된 새 배열을 돌려준다(입력을 변형하지 않는다).
function normalizePollRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const out = { ...row };
    PCT_FIELDS.forEach((f) => { out[f] = toIntOrNull(row[f]); });
    out.sample_size = toIntOrNull(row.sample_size, { min: 1, max: MAX_SAMPLE_SIZE });
    return out;
  });
}

module.exports = { normalizePollRows, toIntOrNull };
