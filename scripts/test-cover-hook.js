// test-cover-hook.js — cover-hook.js 회귀 테스트. 실행: node scripts/test-cover-hook.js
// 2026-08-18 긴급 수정 계기: "김선호 드라마 '내인가"(인용구 중간 절단), "왜 지금 로시 새
// 앨범인가"(억지 훅), "팬들 사이에 벌써 술렁임"(실체 없는 소식)이 그대로 발행됐다.
const { buildCoverHook, hasSubstance, coreSubject } = require('../netlify/functions/cover-hook');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.error(`FAIL: ${label}`); }
}

// ── 실사고 재현 케이스 ───────────────────────────────────────────────────────
const kimSeonho = {
  name: "김선호 드라마 '내 남은 연애' 투병 캐릭터 화제",
  category: 'Entertainment',
  ai_context: {
    draft: {
      lead: "배우 김선호가 드라마 '내 남은 연애'에서 투병하는 인물을 맡아 화제다. 놓쳤던 청춘의 한 페이지를 되짚는 서사와 이세영과의 케미가 관전 포인트로 떠올랐다.",
      blocks: [{ content: '다만 구체적인 병명이나 치료 과정, 향후 전개까지는 아직 명확히 확인된 정보가 없다.' }],
    },
  },
};
const rosi = {
  name: "로시 새 앨범 'Sweetest' 발표",
  category: 'Entertainment',
  ai_context: {
    draft: {
      lead: "가수 로시가 새 앨범 'Sweetest'를 내놓으면서 팬들 사이에 벌써 술렁임이 시작됐습니다. 자세한 트랙 정보나 콘셉트는 아직 다 공개되지 않았지만, 일단 발매 소식 자체가 큰 관심을 끌고 있다는 게 핵심이에요.",
      blocks: [],
    },
  },
};
const strayKids = {
  name: '스트레이 키즈 빌보드 200 9연속 1위',
  category: 'Entertainment',
  ai_context: { draft: { lead: '스트레이 키즈가 신보로 빌보드 200 차트 9연속 1위를 기록하며 K팝 역사를 새로 썼다.', blocks: [] } },
};

check('김선호(실체 없음) → hasSubstance=false', hasSubstance(kimSeonho) === false);
check('로시(실체 없음) → hasSubstance=false', hasSubstance(rosi) === false);
check('스트레이 키즈(실제 수치 있음) → hasSubstance=true', hasSubstance(strayKids) === true);

const kimHook = buildCoverHook(kimSeonho);
const rosiHook = buildCoverHook(rosi);
check('김선호 훅에 "왜 지금" 없음', !kimHook.hook.includes('왜 지금'));
check('김선호 훅에 "인가" 없음(억지 패턴 완전 제거)', !kimHook.hook.endsWith('인가'));
check('김선호 훅에 깨진 단어("내인가") 없음', !kimHook.hook.includes('내인가'));
check('로시 훅에 "왜 지금" 없음', !rosiHook.hook.includes('왜 지금'));
check('로시 훅에 "인가" 없음', !rosiHook.hook.endsWith('인가'));
check('pattern이 general(구 "왜 지금~인가")이 아님', kimHook.pattern !== 'general' && rosiHook.pattern !== 'general');

// ── coreSubject 인용구 절단 회귀 테스트 ─────────────────────────────────────
const quoteCases = [
  ["김선호 드라마 '내 남은 연애' 투병 캐릭터 화제", 10],
  ["로시 새 앨범 'Sweetest' 발표", 10],
  ["아이유 신곡 'Love wins all' 발매 기념 팬미팅", 10],
  ['친일재산 환수 및 친일파 후손 소송', 10],
  ['숫자나 인용부호가 전혀 없는 아주 평범한 제목입니다', 10],
];
for (const [name, limit] of quoteCases) {
  const s = coreSubject(name, limit);
  const quoteCount = (s.match(/['''"“”]/g) || []).length;
  check(`coreSubject("${name}") 따옴표 짝 맞음: "${s}"`, quoteCount % 2 === 0);
}

// ── 임의 문자열 퍼즈: 인용부호가 있는 제목을 다양한 길이로 잘라도 항상 짝이 맞아야 한다 ──
const fuzzTitles = [
  "A'B'C '길게 인용된 제목 하나 더' D E F G",
  "'맨 앞부터 인용' 나머지 텍스트가 이어짐",
  "제목 끝에 '인용이 있다'",
];
for (const t of fuzzTitles) {
  for (let limit = 4; limit <= 20; limit++) {
    const s = coreSubject(t, limit);
    const q = (s.match(/['''"“”]/g) || []).length;
    check(`fuzz coreSubject(limit=${limit}) 따옴표 짝: "${t}" → "${s}"`, q % 2 === 0);
  }
}

console.log(`\n${pass}건 통과, ${fail}건 실패`);
process.exit(fail ? 1 : 0);
