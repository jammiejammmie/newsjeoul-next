// cover-hook.js — 카드뉴스 표지용 "스크롤을 멈추는" 훅 문구 생성 (공유 모듈)
//
// 근거: PM 지시(2026-08-17) — "지금 표지는 선비 수준으로 점잖아서 인스타 피드에서
// 스크롤을 멈추게 못한다". 요구 패턴: "~의 진짜 이유", "아무도 말 안 한 ~",
// "~년 만에 터졌다", "충격) ~", 숫자 강조("16년", "31명", "153억").
//
// ★ 지켜야 하는 선 ─────────────────────────────────────────────────────────
// 훅은 세게 쓰되 **없는 사실을 만들지 않는다**. 그래서 이 모듈은 새 정보를 창작하지 않고,
// 이미 확보된 텍스트(topic.name, draft.lead)에 **실제로 등장하는 숫자와 단어만** 재배치한다.
// 숫자가 없으면 숫자형 패턴을 아예 쓰지 않는다(지어내지 않는다).
//
// 이 원칙이 필요한 이유: 뉴스저울은 news-filters.js에서 낚시성 문구를 걸러내는 서비스다.
// 우리 표지가 "알고보니 충격적인 이유" 같은 무정보 낚시가 되면 자기모순이다.
// 세기(강한 표현)와 거짓(없는 사실)은 다른 축이고, 여기서 올리는 것은 세기뿐이다.

// 숫자 + 단위 추출. "16년", "31명", "153억", "2000조", "9440억원" 등.
// 정규식이 잡는 단위는 한국 뉴스 제목에 실제로 자주 쓰이는 것만 둔다.
const NUM_UNIT_RE = /(\d[\d,.]*)\s*(년|개월|일|명|건|곳|개|회|억원|억|조원|조|만원|만|원|%|퍼센트|배|위|층|km|kg|mm|㎜)/g;

function extractStats(...texts) {
  const found = [];
  const seen = new Set();
  for (const t of texts) {
    if (!t) continue;
    for (const m of String(t).matchAll(NUM_UNIT_RE)) {
      const value = `${m[1]}${m[2]}`;
      if (seen.has(value)) continue;
      seen.add(value);
      // 숫자 크기를 뽑아 "얼마나 눈에 띄는 수치인가"로 정렬한다(1년보다 16년이 훅이 세다).
      const magnitude = parseFloat(String(m[1]).replace(/,/g, '')) || 0;
      found.push({ value, unit: m[2], magnitude, raw: m[0] });
    }
  }
  return found;
}

// 유형별 이모지. 과하지 않게 1개만 쓴다(3개씩 붙이면 스팸 계정처럼 보인다).
const EMOJI_BY_TYPE = {
  conflict: '💥',
  hidden: '🔥',
  number: '⚡',
  general: '🔥',
};

const CATEGORY_EMOJI = {
  Economy: '📈', Business: '📈', Crypto: '📈',
  Technology: '⚡', Science: '⚡',
  Sports: '🔥', Entertainment: '✨',
  Health: '🚨', Society: '💥', Automobile: '🚗', Lifestyle: '✨',
};

// 조사 정리 — 제목 끝에 붙은 조사가 남으면 훅이 어색해진다.
// 끝에 남은 조사·접속사를 떼어낸다. 자르고 나면 "친일재산 환수 및"처럼 접속사로 끝나는
// 경우가 생기는데, 그대로 두면 표지가 미완성 문장처럼 보인다.
function trimTail(s) {
  let out = String(s || '').replace(/[…\s]+$/g, '');
  // 접속사/조사는 여러 번 겹칠 수 있어(“및 ”→“의”) 반복해서 벗겨낸다.
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out
      .replace(/\s*(및|또는|과|와|겸)$/, '')
      .replace(/(을|를|이|가|은|는|의|에|로|으로)$/, '')
      .replace(/[\s,·]+$/, '');
    if (out === before) break;
  }
  return out.trim();
}

// 제목에서 핵심 주어구만 남긴다(너무 길면 표지에서 폰트가 작아져 훅이 죽는다).
// 10자로 잡는 이유: 표지 훅은 "크게 보이는 것"이 목적인데, 주어구가 길수록 hookSize가
// 자동으로 폰트를 줄여 정반대 결과가 된다. 12~14자면 82px까지 떨어져 개편 전과 다를 게 없다.
//
// 2026-08-18 긴급 수정: 인용부호로 시작하는 단어("'내 남은 연애'")에서 자르면 닫는 따옴표
// 전에 끊겨 "'내"처럼 조각이 남고, 뒤에 패턴 문구("인가" 등)가 그대로 붙어 "내인가" 같은
// 말이 안 되는 단어가 만들어졌다(실사고: "김선호 드라마 '내인가"). 따옴표가 홀수 개로
// 남으면(=인용구가 중간에 잘림) 마지막(짝이 안 맞는) 따옴표부터 끝까지 통째로 버린다.
// 그래도 안 남으면(문자열이 따옴표로 시작하는 경우) 원본에서 따옴표만 지우고 다시 자른다 —
// 빈 문자열이나 여전히 안 맞는 조각을 반환하지 않기 위한 최종 방어선이다.
function balanceQuotes(str) {
  const s = String(str || '');
  const quoteCount = (s.match(/['''"“”]/g) || []).length;
  if (quoteCount % 2 === 0) return s;
  const idx = s.search(/['''"“”][^'''"“”]*$/);
  return idx >= 0 ? s.slice(0, idx).trim() : '';
}

function coreSubject(name, maxLen) {
  const limit = maxLen || 10;
  let s = String(name || '').replace(/\s*[·\-–—]\s*/g, ' ').trim();
  if (s.length <= limit) return s;
  // 공백 기준으로 앞에서부터 채우되 limit을 넘지 않게
  const words = s.split(/\s+/);
  let out = '';
  for (const w of words) {
    if ((out + ' ' + w).trim().length > limit) break;
    out = (out + ' ' + w).trim();
  }
  out = balanceQuotes(out || s.slice(0, limit));
  if (!out) out = balanceQuotes(s.slice(0, limit));
  if (!out) out = s.replace(/['''"“”]/g, '').slice(0, limit); // 최종 방어선 — 따옴표째 제거
  return trimTail(out);
}

// 훅 생성. 반환: { emoji, hook, sub, stat }
//   hook — 표지 중앙 큰 글씨(2~3줄)
//   stat — 그중 특히 크게 뽑을 숫자(없을 수 있음)
//   sub  — 하단 보조 소제목(맥락)
function buildCoverHook(topic, options) {
  const opts = options || {};
  const name = (topic && topic.name) || '';
  const lead = (topic && topic.ai_context && topic.ai_context.draft && topic.ai_context.draft.lead) || (topic && topic.summary) || '';
  const category = (topic && topic.category) || '';
  const markers = (topic && topic.ai_context && topic.ai_context.draft && topic.ai_context.draft.perspective_markers) || [];

  const type = opts.type || (markers.length >= 2 ? 'conflict' : markers.length === 1 ? 'hidden' : 'general');
  const stats = extractStats(name, lead);
  // 기본 10자 — coreSubject의 기본값과 반드시 같아야 한다(여기서 14를 넘기고 있어서
  // "친일재산 환수 및 친일"처럼 조사·접속사에서 끊긴 어색한 주어가 나왔다).
  const subject = trimTail(coreSubject(name, opts.maxSubject || 10));

  // 1순위: 실제 숫자가 있으면 숫자를 주인공으로 세운다. 가장 강한 훅이고, 지어낼 여지가 없다.
  // "년" 단위는 "N년 만에"가 자연스럽고, 그 외 단위는 수치 자체를 크게 세운다.
  // ★ 연도를 기간으로 오인하지 않는다. "2010년 활동을 마친 뒤"의 2010은 시점이지 기간이 아닌데,
  // 이걸 그대로 쓰면 "2010년 만에 친일재산 환수"라는 헛소리 훅이 나온다(실제로 유닛 테스트에서
  // 이 문구가 생성되는 것을 확인하고 잡았다). 1900~2100은 연도로 보고 기간 패턴에서 제외한다.
  const isYearPoint = (s) => s.unit === '년' && s.magnitude >= 1900 && s.magnitude <= 2100;
  const yearStat = stats.find((s) => s.unit === '년' && s.magnitude >= 2 && !isYearPoint(s));
  if (yearStat) {
    return {
      emoji: EMOJI_BY_TYPE.number,
      stat: yearStat.value,
      hook: `${yearStat.value} 만에\n${subject}`,
      sub: type === 'conflict' ? '찬반이 갈리는 이유' : '아무도 말하지 않은 배경',
      pattern: 'years',
    };
  }

  const bigStat = stats.filter((s) => !isYearPoint(s)).sort((a, b) => b.magnitude - a.magnitude)[0];
  if (bigStat) {
    return {
      emoji: CATEGORY_EMOJI[category] || EMOJI_BY_TYPE.number,
      stat: bigStat.value,
      hook: `${bigStat.value}\n${subject}`,
      sub: type === 'conflict' ? '찬반이 갈리는 이유' : '숫자 뒤에 있는 이야기',
      pattern: 'number',
    };
  }

  // 2순위: 숫자가 없으면 유형별 문구 패턴. 여기서도 사실을 추가하지 않는다 —
  // "진짜 이유"·"아무도 말 안 한"은 본문이 배경을 다룬다는 사실 자체에 대한 서술이다.
  if (type === 'conflict') {
    return {
      emoji: EMOJI_BY_TYPE.conflict,
      stat: '',
      hook: `${subject}\n왜 갈렸나`,
      sub: '찬성과 반대, 양쪽 논리',
      pattern: 'conflict',
    };
  }
  if (type === 'hidden') {
    return {
      emoji: EMOJI_BY_TYPE.hidden,
      stat: '',
      hook: `아무도 말 안 한\n${subject}`,
      sub: '그 뒤에 있는 진짜 이유',
      pattern: 'hidden',
    };
  }
  // 3순위(2026-08-18 긴급 수정, PM 지시): 숫자도 대립 관점도 없을 때 "왜 지금 ~인가"류
  // 억지 궁금증 문구를 지어내던 걸 없앴다. 정보 없이 궁금증만 만들면 클릭 후 실망으로 이어지고,
  // 뉴스저울이 스스로 걸러내야 할 낚시성 문구가 되어 자기모순이다(news-filters.js와 같은 원칙).
  // 대신 리드의 첫 문장(에디터가 이미 사실을 담아 쓴 글)을 그대로 축약해 쓴다 — 새로 짓지
  // 않고 있는 정보를 옮기기만 하면 "억지"가 될 수 없다. 이 분기까지 왔다는 것 자체가 이미
  // hasSubstance()를 통과한, 즉 리드에 실제 정보가 있다는 뜻이다.
  const leadFirstClause = (lead.match(/^[^.!?]*[.!?다]/) || [lead])[0].trim();
  const factualHook = coreSubject(leadFirstClause || name, opts.maxSubject || 20);
  return {
    emoji: CATEGORY_EMOJI[category] || EMOJI_BY_TYPE.general,
    stat: '',
    hook: factualHook || subject,
    sub: trimTail(coreSubject(name, 14)) || '한 장으로 정리했습니다',
    pattern: 'plain',
  };
}

// ── 콘텐츠 신뢰도 게이트 (2026-08-18 긴급 수정, PM 지시) ────────────────────
// 계기: "로시 새 앨범 발표"(buzz 15점, matched=false — 실제 화제성 신호 없음)가
// "팬들 사이에 벌써 술렁임이 시작됐습니다" 같은 내용 없는 문장으로 카드뉴스에 나갔다.
// 리드 스스로가 "아직 구체적으로 공개되지 않았다"고 인정하는데도 SHORT_BRIEF 게이트는
// 통과했다 — "단신이다"와 "실제로 다룰 내용이 있다"는 별개 축이라 게이트만으로는
// 못 걸러진다. 이 함수가 그 빈틈을 막는다: buzz·게이트 판정과 무관하게 항상 적용한다.
//
// 판정: 숫자·날짜 같은 확정 사실이 하나도 없는데, 동시에 (a) 정보가 아직 없다고 스스로
// 인정하거나 (b) "화제다/술렁"류 상투어로만 채워져 있으면 실체가 없는 소식으로 본다.
const HOLLOW_PHRASES = [
  '술렁', '화제를 모으고 있다', '관심을 끌고 있다', '주목받고 있다', '기대를 모으고 있다',
  '다들 궁금해하는', '큰 관심을 끌고', '입소문을 타고', '화제가 되고 있다',
];
const INFO_ABSENT_PHRASES = [
  '아직 공개되지 않', '아직 확인되지 않', '아직 명확히 확인된 정보가 없', '아직 다 공개되지',
  '아직 구체적으로', '아직 알려지지 않', '확인된 바 없', '구체적인 내용은 없',
];

function hasSubstance(topic) {
  const name = (topic && topic.name) || '';
  const draft = (topic && topic.ai_context && topic.ai_context.draft) || {};
  const lead = draft.lead || (topic && topic.summary) || '';
  const body = (draft.blocks || []).map((b) => b.content || '').join(' ');
  const combined = `${name} ${lead} ${body}`;

  const stats = extractStats(name, lead); // 표지에 실제로 쓸 숫자·날짜가 있는가
  if (stats.length) return true; // 확정 수치가 있으면 그 자체로 실체가 있다고 본다

  const hollowHit = HOLLOW_PHRASES.some((p) => combined.includes(p));
  const infoAbsentHit = INFO_ABSENT_PHRASES.some((p) => combined.includes(p));
  if (hollowHit || infoAbsentHit) return false;

  return true;
}

module.exports = { buildCoverHook, extractStats, coreSubject, hasSubstance, EMOJI_BY_TYPE, CATEGORY_EMOJI };
