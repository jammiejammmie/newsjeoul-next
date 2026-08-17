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
  return trimTail(out || s.slice(0, limit));
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
  // 조사('의')를 줄머리에 홀로 남기지 않는다 — "손흥민 결승골 토트넘 승리 / 의 진짜 이유"처럼
  // 읽히면 훅이 아니라 오타로 보인다(유닛 테스트에서 확인하고 잡았다).
  // 앞줄을 지시어로 세우고 주어를 뒷줄에 두면 조사 문제가 아예 생기지 않는다.
  return {
    emoji: CATEGORY_EMOJI[category] || EMOJI_BY_TYPE.general,
    stat: '',
    hook: `왜 지금\n${subject}인가`,
    sub: '한 장으로 정리했습니다',
    pattern: 'general',
  };
}

module.exports = { buildCoverHook, extractStats, coreSubject, EMOJI_BY_TYPE, CATEGORY_EMOJI };
