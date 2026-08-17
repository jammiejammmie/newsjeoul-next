// engagement-cta.js — 게시물 끝에 붙는 참여 유도 문구(댓글 유도 + 저장 유도) 생성
// 공유 모듈(자체 handler 없음). Threads와 Instagram이 같은 로직을 쓴다 —
// 채널마다 문구가 따로 놀면 "뉴스저울은 이렇게 묻는다"는 톤이 안 생긴다.
//
// 근거: PM 지시(2026-08-17) — 토픽 유형에 따라 댓글 유도 질문을 자동 생성하고,
// 저장 유도 문구를 함께 붙인다.
//
// 유형 판별은 이미 파이프라인에 있는 신호를 그대로 쓴다(새 LLM 호출 0건):
//   대립형(A) — generateDeepPost가 고른 format이 'A'이거나, draft.perspective_markers가 2개 이상
//   이면형(B) — format이 'B'이거나, perspective_markers가 1개
//   일반      — 그 외(엇갈리는 시각 정보가 아예 없는 단순 사실 보도)

const SAVE_CTA = '나중에 다시 보려면 저장해두세요 🔖';

// 대립형 — 양측이 갈리는 사안. 어느 쪽이 옳은지 우리가 말하지 않는 것이 뉴스저울 원칙이므로,
// 질문도 "당신은 어느 쪽인가"로만 던지고 유도하지 않는다.
const CONFLICT_QUESTIONS = [
  '찬성 vs 반대 — 댓글로 알려주세요',
  '찬성 vs 반대, 여러분은 어느 쪽인가요? 댓글로 알려주세요',
  '양쪽 논리 중 어느 쪽이 더 설득력 있나요? 댓글로 알려주세요',
];

// 이면형 — 표면 발표 뒤의 배경을 다룬 경우.
const HIDDEN_QUESTIONS = [
  '이 사실 알고 계셨나요?',
  '이 사실, 알고 계셨나요? 댓글로 알려주세요',
  '이런 배경이 있는 줄 아셨나요?',
];

// 일반 — 대립도 이면도 아닌 단순 사안. 카테고리별로 "그 분야 사람이 실제로 답할 수 있는" 질문을 던진다.
// 전부 똑같이 "어떻게 생각하세요?"로 끝나면 계정 전체가 성의 없어 보인다.
const GENERAL_QUESTIONS = {
  Economy: ['여러분 지갑엔 어떤 영향이 있었나요?', '체감하고 계신 변화가 있나요?'],
  Business: ['이 회사 제품 써보신 분 있나요?', '업계에 계신 분들은 어떻게 보시나요?'],
  Crypto: ['지금 들어가시겠어요, 기다리시겠어요?', '여러분의 판단은 어떠신가요?'],
  Technology: ['직접 써보신 분 있나요? 후기 남겨주세요', '이 기능, 실제로 쓸 것 같으세요?'],
  Sports: ['이 경기 보셨나요? 어떻게 보셨어요?', '여러분의 예상은 어떠신가요?'],
  Entertainment: ['보신 분들 어떠셨나요?', '여러분의 최애는 누구인가요?'],
  Health: ['비슷한 경험 있으신가요?', '주변에 겪으신 분 계신가요?'],
  Science: ['이 소식 어떻게 보셨나요?', '가장 궁금한 점은 무엇인가요?'],
  Automobile: ['타보신 분 계신가요? 후기 남겨주세요', '다음 차로 고려하시겠어요?'],
  Lifestyle: ['가보셨거나 써보신 분 있나요?', '여러분의 추천도 궁금합니다'],
  Society: ['여러분 주변은 어떤가요?', '여러분은 어떻게 보시나요?'],
};
const GENERAL_FALLBACK = ['여러분은 어떻게 생각하시나요?', '여러분의 생각을 댓글로 알려주세요'];

// 같은 질문이 연속으로 나가지 않도록 topic id로 결정론적 로테이션을 건다.
// 난수를 쓰지 않는 이유: 같은 Topic이면 Threads와 Instagram에서 같은 질문이 나와야
// 두 채널이 같은 캠페인처럼 보인다(랜덤이면 채널마다 달라진다).
function pick(list, seed) {
  if (!list || !list.length) return '';
  let h = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

// 'conflict' | 'hidden' | 'general'
function detectType(topic, explicitFormat) {
  if (explicitFormat === 'A') return 'conflict';
  if (explicitFormat === 'B') return 'hidden';
  const markers = (topic && topic.ai_context && topic.ai_context.draft && topic.ai_context.draft.perspective_markers) || [];
  if (markers.length >= 2) return 'conflict';
  if (markers.length === 1) return 'hidden';
  return 'general';
}

function buildQuestion(topic, explicitFormat) {
  const type = detectType(topic, explicitFormat);
  const seed = (topic && topic.id) || (topic && topic.name) || '';
  if (type === 'conflict') return { type, question: pick(CONFLICT_QUESTIONS, seed) };
  if (type === 'hidden') return { type, question: pick(HIDDEN_QUESTIONS, seed) };
  const byCategory = GENERAL_QUESTIONS[(topic && topic.category) || ''] || GENERAL_FALLBACK;
  return { type, question: pick(byCategory, seed) };
}

// 채널 공통 CTA 블록. withSave=false면 저장 유도를 빼고 질문만 준다.
// 반환: { type, question, save, text }
function buildCta(topic, options) {
  const opts = options || {};
  const { type, question } = buildQuestion(topic, opts.format);
  const save = opts.withSave === false ? '' : SAVE_CTA;
  const text = [question, save].filter(Boolean).join('\n');
  return { type, question, save, text };
}

module.exports = {
  buildCta,
  buildQuestion,
  detectType,
  SAVE_CTA,
  CONFLICT_QUESTIONS,
  HIDDEN_QUESTIONS,
  GENERAL_QUESTIONS,
  GENERAL_FALLBACK,
};
