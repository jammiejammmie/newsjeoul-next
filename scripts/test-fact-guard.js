// test-fact-guard.js — fact-guard.js 회귀 테스트. 실행: node scripts/test-fact-guard.js
// 2026-08-21 사고 재현 계기: "한덕수 국무총리"(구 방어 코드의 합성 직함 미인식 버그로
// process-stories-background.js의 기존 검증을 통과), "장미란"(원문에 없는 신원 서술을
// AI가 topic 이름 생성 단계에서 지어냄) 두 건.
const { verifyNamesAgainstSource, verifyFields, needsHumanReview, TITLE_WORDS, NAME_TITLE_RE } = require('../netlify/functions/lib/fact-guard');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); }
}

// ── 실사고 재현: 합성 직함(국무총리) 버그 ───────────────────────────────────
{
  const sourceTitles = ['한 총리 "제주서 30대 여성 실종‥경찰청, 수색에 최선 다해야"', '한성숙 국무총리, 운문댐 방문'];
  const r = verifyNamesAgainstSource('한덕수 국무총리는 경찰청에 수색 최선을 지시하며', sourceTitles);
  check('한덕수 국무총리 → 원문에 없는 실명이라 flagged=true', r.flagged === true);
  check('한덕수 국무총리 → 이름 지워지고 "국무총리"만 남음', r.sanitized === '국무총리는 경찰청에 수색 최선을 지시하며');
  check('한덕수는 블랙리스트에도 있어 blacklistHits에 잡힘', r.blacklistHits.includes('한덕수'));
}

// ── 구 방어 코드(총리만 있고 국무총리 없음)였다면 놓쳤을 케이스 — 회귀 방지 ──
{
  // 옛 TITLE_WORDS = ['대통령','총리','장관','시장','회장']였다면 "국무" 앞부분만 잡혀
  // "한덕수"는 정규식 대상에도 오르지 않았다(위치상 더 이른 매치가 우선이라 "국무"에서
  // 멈춤). 지금 목록엔 '국무총리'가 있어야 이 케이스가 통과한다.
  check("TITLE_WORDS에 '국무총리'가 '총리'보다 먼저(길이순 정렬) 온다", TITLE_WORDS[0] === '국무총리' || TITLE_WORDS.indexOf('국무총리') < TITLE_WORDS.indexOf('총리'));
  NAME_TITLE_RE.lastIndex = 0;
  const m = [...'한덕수 국무총리 지시'.matchAll(NAME_TITLE_RE)];
  check('정규식이 "한덕수"를 이름으로 잡음(합성 직함 우선 매칭)', m.length === 1 && m[0][1] === '한덕수' && m[0][2] === '국무총리');
}

// ── 원문에 있는 정확한 이름+직함은 안 건드림(오탐 방지) ────────────────────
{
  const sourceTitles = ['한성숙 국무총리, 운문댐 방문'];
  const r = verifyNamesAgainstSource('한성숙 국무총리는 운문댐을 찾았다', sourceTitles);
  check('원문에 있는 실명(한성숙)은 flagged=false', r.flagged === false);
  check('원문에 있는 실명은 그대로 유지', r.sanitized === '한성숙 국무총리는 운문댐을 찾았다');
}

// ── 이전 사고(이준석 대통령) 회귀 방지 ──────────────────────────────────────
{
  const r = verifyNamesAgainstSource('이준석 대통령 칠레 순방', ['李대통령 칠레 순방길 올라']);
  check('이준석 대통령 → 원문에 없어 flagged=true', r.flagged === true);
  check('이준석은 블랙리스트에도 있음', r.blacklistHits.includes('이준석'));
}

// ── 1글자 축약형은 오탐 아님 ─────────────────────────────────────────────
{
  const r = verifyNamesAgainstSource('이 대통령 칠레 순방', ['李대통령 순방']);
  check('1글자 성(이 대통령)은 검증 대상 제외 — flagged=false', r.flagged === false);
}

// ── verifyFields: 여러 필드 동시 검증 ───────────────────────────────────────
{
  const sourceTitles = ['제주 실종 장미란 씨 재수색...허위 보고 의혹 파장'];
  const { patched, anyFlagged, blacklistHits } = verifyFields(
    { name: '제주 실종 한덕수 의혹', summary: '한덕수 국무총리가 지시했다' },
    sourceTitles
  );
  // name 필드는 "한덕수" 뒤에 직함(TITLE_WORDS)이 안 붙어 있어(패턴 불일치) 자동 치환은
  // 안 되지만, 블랙리스트 이름이므로 blacklistHits로는 반드시 잡혀야 한다.
  check('verifyFields: name 필드의 블랙리스트 이름은 blacklistHits로 잡힘', blacklistHits.includes('한덕수'));
  check('verifyFields: summary 필드는 직함 패턴 일치라 자동 정정됨', !patched.summary.includes('한덕수'));
  check('verifyFields: anyFlagged=true(summary가 패턴 매치로 flagged)', anyFlagged === true);
}

// ── needsHumanReview: 장미란류(Society+위험키워드+실명) → hold ─────────────
{
  const text = '제주에서 실종된 장미란씨와 관련된 의혹이 제기되며 논란이 되고 있다.';
  const r = needsHumanReview({ category: 'Society', text, blacklistHits: [] });
  check('Society+의혹/논란+실명(장미란씨, 존칭 접미사) → hold=true', r.hold === true);
}

// ── needsHumanReview: 블랙리스트 이름은 카테고리 무관 무조건 hold ──────────
{
  const r = needsHumanReview({ category: 'Business', text: '평범한 경제 기사', blacklistHits: ['한덕수'] });
  check('블랙리스트 이름 있으면 카테고리 무관 hold=true', r.hold === true);
}

// ── needsHumanReview: 일반 기사(위험 키워드 없음)는 통과 ───────────────────
{
  const r = needsHumanReview({ category: 'Society', text: '정부가 새 정책을 발표했다.', blacklistHits: [] });
  check('위험 키워드 없으면 hold=false', r.hold === false);
}

// ── needsHumanReview: Society 아닌 카테고리는 위험 키워드 있어도 통과(범위 좁힘 확인) ──
{
  const r = needsHumanReview({ category: 'Entertainment', text: '유명인 마약 의혹 논란', blacklistHits: [] });
  check('Society 카테고리가 아니면 hold=false(범위를 좁게 잡은 설계 의도)', r.hold === false);
}

console.log(`\n${pass}건 통과, ${fail}건 실패`);
process.exit(fail ? 1 : 0);
