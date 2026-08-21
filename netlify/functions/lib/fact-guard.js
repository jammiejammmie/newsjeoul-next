// fact-guard.js — 실명 인물 관련 팩트 오류 방어 공용 모듈.
//
// 계기: 2026-07-30 "이준석 대통령 칠레 순방"(process-stories-background.js에만 국지적으로
// 방어 코드 추가) → 2026-08-21 "한덕수 국무총리"(그 방어 코드의 정규식 버그로 재발, 합성
// 직함을 못 잡았음) + "장미란 전 국가대표 역도선수"(그 방어 코드가 애초에 커버 안 하는
// 완전히 다른 실패 유형 — 이름은 맞는데 원문에 없는 신원/이력을 붙인 경우) 두 사고가 겹침.
// PM 지시: 국지적 패치 대신 파이프라인 전 단계(story 제목 생성 → topic 이름/요약 생성 →
// 장문 draft 생성)가 공유하는 방어벽으로 승격.
//
// 구조적 제약: 이 파이프라인은 기사 원문 본문을 어디에도 저장하지 않는다(RSS 제목만 사용).
// 그래서 여기 검증도 "원문 기사 제목들에 실제로 등장하는가"까지만 확인할 수 있다 — 완벽한
// 사실검증이 아니라 "생성 단계에서 새로 지어낸 티가 나는 것"을 잡는 방어선이다.

// ── 재발 방지 블랙리스트 ──────────────────────────────────────────────────
// 이미 한 번 틀린 것으로 실측 확인된 이름. 여기 걸리면 자동으로 문자열을 고치지 않고
// 무조건 hold(사람 확인 대기)로 돌린다 — 과거형/역사적 언급(예: "전 총리 한덕수는...")일
// 수도 있어 무작정 치환하면 새로운 오류(엉뚱한 문장)를 만들 위험이 있기 때문이다.
const KNOWN_WRONG_NAMES = [
  { name: '한덕수', note: '2026-08-21 사고 — "한 총리" 축약을 이 인물(구 총리/전 권한대행)로 잘못 확장. 당시 확인된 실제 현직은 한성숙.' },
  { name: '이준석', note: '2026-07-30 사고 — "이 대통령" 축약을 이 인물로 잘못 확장.' },
];

// 정부/조직 고위직 호칭 — 합성 직함(국무총리 등)을 반드시 짧은 직함(총리)보다 먼저 매칭해야
// 한다. 2026-08-21 사고 원인이 이 순서 관리 실패였다("총리"만 있어서 "한덕수 국무총리"에서
// 정규식이 "한덕수" 대신 "국무총리" 안의 "국무"를 이름으로 오인했다) — 사람이 나열 순서를
// 관리하는 실수를 반복하지 않도록 길이 내림차순 정렬을 코드로 강제한다.
const TITLE_WORDS = [
  '국무총리', '부총리', '대통령실장', '대통령', '총리', '장관', '차관', '시장', '지사', '회장', '대표',
].sort((a, b) => b.length - a.length);
// 이름과 직함 사이 공백은 있을 수도 없을 수도 있다("이준석 대통령" vs "李대통령") — \s?로 둘 다 포착.
const NAME_TITLE_RE = new RegExp(`([가-힣\\u4e00-\\u9fff]{1,4})\\s?(${TITLE_WORDS.join('|')})`, 'g');
// 사인(私人)에 대한 존칭 접미사 패턴("장미란씨", "김OO 군" 등) — 직함이 없는 일반인 실명 언급을
// 잡기 위한 것. 장미란 사고처럼 "직함"이 아니라 "사인"에 대한 서술일 때 필요하다.
// 뒤에 조사가 바로 붙는 게 한국어에서 일반적이라("장미란씨와", "장미란씨는") 뒤에 오는 글자를
// 제한하는 lookahead는 넣지 않는다 — 넣으면 이 흔한 조사 결합 케이스를 전부 놓친다.
const HONORIFIC_RE = /[가-힣]{2,4}\s?(씨|군|양)/;

// text 하나를 sourceTitles(원본 기사 제목 배열)와 대조해 검증한다.
// - name+직함 조합이 원문에 없는 실명이면 이름을 지우고 직함만 남긴다(기존 process-stories
//   방식과 동일한 안전한 폴백 — 사람 검토 없이도 팩트 오류 발행 자체를 막는 게 목적).
// - 블랙리스트 이름이 남아 있으면 자동 치환하지 않고 blacklistHits로만 보고한다(위 사유).
function verifyNamesAgainstSource(text, sourceTitles) {
  if (!text) return { sanitized: text, flagged: false, blacklistHits: [] };
  const sourceText = (sourceTitles || []).join(' ');
  let sanitized = text;
  let flagged = false;

  for (const match of [...text.matchAll(NAME_TITLE_RE)]) {
    const [full, namePart, titleWord] = match;
    // 1글자 성만 있는 축약형("이 대통령"의 "이" 등)은 원문 표기를 그대로 옮긴 안전한 경우이므로
    // 검증 대상에서 제외 — 2자 이상(=합성된 실명으로 추정)만 검증한다.
    if (namePart.length < 2) continue;
    if (sourceText.includes(namePart)) continue;
    flagged = true;
    sanitized = sanitized.split(full).join(titleWord);
  }

  // 원문(text) 기준으로 확인한다 — sanitized는 이미 이름+직함 패턴만 지운 상태라, 직함이
  // 안 붙은 채로 블랙리스트 이름이 등장하는 경우(예: "한덕수 의혹")까지 잡으려면 원문을 봐야
  // 한다. 블랙리스트는 자동 치환 대상이 아니라 "일단 사람이 보게 하자"는 신호일 뿐이라
  // 원문에 그대로 남겨두고 보고만 한다.
  const blacklistHits = KNOWN_WRONG_NAMES.filter((w) => text.includes(w.name)).map((w) => w.name);
  return { sanitized, flagged, blacklistHits };
}

// 여러 필드(topic.name/summary/description, draft.lead/blocks[].content 등)를 한 번에 검증.
// fields: { key: text }. 반환: { patched: {key: sanitizedText}, anyFlagged, blacklistHits }
function verifyFields(fields, sourceTitles) {
  const patched = {};
  let anyFlagged = false;
  const blacklistHits = new Set();
  for (const [key, text] of Object.entries(fields || {})) {
    const r = verifyNamesAgainstSource(text, sourceTitles);
    patched[key] = r.sanitized;
    if (r.flagged) anyFlagged = true;
    r.blacklistHits.forEach((h) => blacklistHits.add(h));
  }
  return { patched, anyFlagged, blacklistHits: [...blacklistHits] };
}

// ── 확정 사실 주입(2단계) ─────────────────────────────────────────────────
// TODO(PM 확인 대기, 2026-08-21): 현직 대통령/국무총리 등 확정 사실을 여기 채우면
// 생성 프롬프트에 "다음은 확정된 사실이다 — 학습 데이터의 기억보다 이걸 우선하라"로
// 주입된다(아래 confirmedFactsBlock 참고). 채우기 전까지는 이 레이어는 아무 효과가
// 없고, 위의 사후 검증(verifyNamesAgainstSource)·블랙리스트만으로 방어한다.
// 형식 예: { president: '홍길동', primeMinister: '홍길동' }
const CONFIRMED_FACTS = {
  // president: '',
  // primeMinister: '',
};

function confirmedFactsBlock() {
  const labels = { president: '대통령', primeMinister: '국무총리' };
  const entries = Object.entries(CONFIRMED_FACTS).filter(([, v]) => v && String(v).trim());
  if (!entries.length) return '';
  const lines = entries.map(([k, v]) => `- ${labels[k] || k}: ${v}`).join('\n');
  return `\n\n다음은 확정된 사실이다(반드시 이 정보를 우선하고, 학습 데이터에 남아있는 예전 정보에 의존하지 마라):\n${lines}\n`;
}

// ── 고위험 콘텐츠 발행 보류 판정(5단계) ────────────────────────────────────
// Society 카테고리 + 위험 키워드(의혹/논란 등) + 실명 인물(직함 또는 존칭 접미사) 서술이
// 겹치면 자동발행 대신 사람 확인 대기로 돌린다. 조건을 좁게 잡은 이유: 전체를 다 사람
// 확인으로 묶으면 그 사이 발행이 사실상 멈춘다 — 명예훼손 리스크가 실제로 큰 좁은
// 교집합만 잡는다. 블랙리스트 이름 재등장은 카테고리·키워드 무관하게 무조건 hold.
const RISK_KEYWORDS = ['의혹', '논란', '구속', '기소', '피소', '고발', '음주', '폭행', '성폭력', '성추행', '마약', '수사'];

function needsHumanReview({ category, text, blacklistHits }) {
  if (blacklistHits && blacklistHits.length) {
    return { hold: true, reason: `블랙리스트 이름 재등장: ${blacklistHits.join(', ')}` };
  }
  if (category !== 'Society') return { hold: false, reason: null };

  const body = text || '';
  const hasRisk = RISK_KEYWORDS.some((k) => body.includes(k));
  if (!hasRisk) return { hold: false, reason: null };

  NAME_TITLE_RE.lastIndex = 0; // g플래그 regex.test()는 lastIndex 상태를 남긴다 — 재사용 전 리셋 필수.
  const hasNamedPerson = NAME_TITLE_RE.test(body) || HONORIFIC_RE.test(body);
  NAME_TITLE_RE.lastIndex = 0;
  if (hasNamedPerson) {
    return { hold: true, reason: 'Society + 위험 키워드 + 실명 인물 서술 동시 발생' };
  }
  return { hold: false, reason: null };
}

module.exports = {
  KNOWN_WRONG_NAMES,
  TITLE_WORDS,
  NAME_TITLE_RE,
  HONORIFIC_RE,
  verifyNamesAgainstSource,
  verifyFields,
  confirmedFactsBlock,
  needsHumanReview,
};
