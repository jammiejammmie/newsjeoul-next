// ═══════════════════════════════════════════════════════════════════════════
// Threads 배급 전략 — 무엇을(유형) 언제(시간대) 어떤 근거로(트리거) 올릴지 결정하는 순수 로직.
//
// 2026-08-12 PM 전면 개편 지시로 신설. 이전 구조는 "published Topic 중 점수 1위"만 골랐고,
// 게시물 = 뉴스 100%였다. 허브(에버그린) 문서 213건이 아무 채널로도 나가지 않고 있었다.
//
// 이 파일이 담당하는 것(전부 순수 함수 — DB·API를 모른다. 그래서 테스트가 쉽다):
//   1. 유형 선택        pickTypePreference   — 뉴스/에버그린 중 지금 무엇을 올릴 차례인가
//   2. 허브 연결 판정   scoreHubMatch        — 이 뉴스 토픽이 어떤 허브와 실제로 관련 있는가
//   3. 에버그린 우선순위 scoreEvergreenDoc   — 어떤 허브 문서를 먼저 올릴 것인가
//   4. 링크 댓글 조립   buildCommentText     — 본문에서 뺀 링크를 첫 댓글로 만든다
//
// 설계 원칙(PM 지시 2026-08-12):
//   · 비율 강제가 아니라 트리거다. 에버그린을 "몇 %씩 반드시"로 밀어넣지 않는다 —
//     새 문서가 생겼거나(신규 트리거) 뉴스가 허브를 건드렸을 때(연결 트리거) 우선 나간다.
//     30~40%는 그 결과를 감시하는 밴드일 뿐이다(하한 미달이면 보충, 상한 초과면 뉴스로 돌림).
//   · 시간대가 유형을 가른다. 뉴스는 오전~점심(정보 수요), 에버그린 가이드는 저녁~밤
//     (문제 해결 수요 — "폴드8 배터리가 하루를 못 간다"는 사람이 검색하는 시간대).
//   · 링크는 본문이 아니라 첫 댓글에 둔다. 본문은 링크 없이 읽어도 완결이어야 한다.
// ═══════════════════════════════════════════════════════════════════════════

// ── 유형 비중(PM 지시 §2: 하루 게시 중 에버그린 30~40%) ──────────────────────
// 밴드로 두는 이유: 정확히 35%를 맞추려면 매 회차 비율을 계산해 강제 배정해야 하는데,
// 그러면 "트리거 기반"이라는 이번 개편의 취지가 사라진다. 하한/상한만 지키고 그 사이에서는
// 트리거와 시간대가 결정하게 둔다.
const EVERGREEN_SHARE_MIN = 0.30;
const EVERGREEN_SHARE_MAX = 0.40;
const EVERGREEN_SHARE_TARGET = 0.35;
// 밴드 판정을 시작하는 최소 표본. 하루 첫 게시(0/1건)에서 비율을 따지면 100%/0%로 튀어
// 유형이 요동친다. 3건까지는 시간대 규칙만으로 정한다.
const SHARE_JUDGE_MIN_SAMPLE = 3;

// ── 시간대(KST) ─────────────────────────────────────────────────────────────
// PM 지시 §4. 경계는 반열림 구간 [시작, 끝)이다.
const NEWS_WINDOW = { start: 7, end: 14 };       // 07:00~13:59 — 뉴스·이슈
const EVERGREEN_WINDOW = { start: 18, end: 23 }; // 18:00~22:59 — 사용법·설정법 가이드

/** UTC Date → KST 시(0~23). 서버는 UTC로 도는데 독자는 한국에 있다. */
function kstHour(date) {
  return new Date(date.getTime() + 9 * 3600 * 1000).getUTCHours();
}

function inWindow(hour, w) {
  return hour >= w.start && hour < w.end;
}

/**
 * 지금 무엇을 올릴 차례인가 — 선호 순서를 배열로 돌려준다(첫 번째가 1순위).
 *
 * 배열로 돌려주는 이유: 1순위 유형에 후보가 없을 때(에버그린 문서를 다 소진했거나 뉴스
 * 후보가 전부 품질 미달) 그 회차를 통째로 버리면 배급량이 줄어든다. 호출자는 순서대로
 * 시도하고 처음 성공한 유형을 쓴다.
 *
 * @param {number} hour     KST 시(0~23)
 * @param {number} newsPosted      오늘 게시한 뉴스 건수
 * @param {number} evergreenPosted 오늘 게시한 에버그린 건수
 * @param {boolean} hasFreshDoc    최근 생성된 허브 문서가 대기 중인가(신규 트리거)
 */
function pickTypePreference(hour, newsPosted, evergreenPosted, hasFreshDoc) {
  const total = newsPosted + evergreenPosted;
  const share = total > 0 ? evergreenPosted / total : 0;
  const EVER = ['evergreen', 'news'];
  const NEWS = ['news', 'evergreen'];

  // 규칙 순서가 곧 우선순위다. 아래 순서를 바꾸면 지시 §2(비중)와 §4(시간대)가 서로를
  // 덮어쓴다 — 실제로 첫 배포에서 신규 문서 트리거를 맨 위에 뒀다가, 문서가 매일 생성되는
  // 탓에 트리거가 상시 참이 되어 뉴스 시간대(07~14시)까지 에버그린이 밀고 들어갔다.

  // 1. 상한 초과는 무엇보다 우선한다 — 에버그린이 하루를 다 먹으면 "뉴스는 기본으로 계속
  //    유지"(PM 지시 §1)가 깨진다.
  if (total >= SHARE_JUDGE_MIN_SAMPLE && share >= EVERGREEN_SHARE_MAX) return NEWS;

  // 2. 하한 미달 보충 — 밴드 아래로 떨어지면 시간대와 무관하게 에버그린을 먼저 시도한다.
  //    저녁 창(5시간)만으로는 30%를 채우지 못하는 날이 있어서, 이 규칙이 밴드의 실질 보증이다.
  if (total >= SHARE_JUDGE_MIN_SAMPLE && share < EVERGREEN_SHARE_MIN) return EVER;

  // 3. 지정된 시간대는 그대로 지킨다(PM 지시 §4).
  if (inWindow(hour, EVERGREEN_WINDOW)) return EVER;
  if (inWindow(hour, NEWS_WINDOW)) return NEWS;

  // 4. 창 밖(오후 중반·심야) — 여기서만 신규 문서 트리거가 작동한다(PM 지시 §1).
  //    갓 만들어진 문서를 저녁 창까지 재우지 않되, 목표치(35%)를 넘어서까지 밀지는 않는다.
  if (hasFreshDoc && share < EVERGREEN_SHARE_TARGET) return EVER;

  // 5. 그 외 창 밖 시간은 뉴스가 기본값이다.
  return NEWS;
}

// ── 허브 연결 판정(PM 지시 §5) ──────────────────────────────────────────────
// "토픽 제목에 허브 키워드가 포함되는가"가 기준이되, 그대로 쓰면 오연결이 난다.
// 실측 근거: 허브 newsKeywords에는 '갤럭시'·'그램'처럼 짧고 흔한 말이 섞여 있고,
// lib/hubs의 newsExclude 주석도 같은 문제를 기록해 두고 있다('엑셀'이 '큐엑셀'을 잡았다).
// 그래서 키워드 길이로 신뢰도를 차등하고, 제외어가 걸리면 즉시 0으로 떨어뜨린다.
const HUB_MIN_RELEVANCE = 70;   // 이 미만이면 허브를 붙이지 않고 일반 뉴스로 발행한다.
const HUB_KEYWORD_MIN_LEN = 3;  // 2자 이하 키워드는 단독 근거로 쓰지 않는다.

/** 키워드 하나의 신뢰도. 길수록 고유명사일 확률이 높다. */
function keywordConfidence(kw) {
  const len = (kw || '').trim().length;
  if (len >= 6) return 100; // '갤럭시 Z 폴드8', '청년월세지원' 같은 고유 표현
  if (len >= 4) return 80;  // '폴드8', '로봇청소기'
  if (len >= HUB_KEYWORD_MIN_LEN) return 60; // '갤럭시', '아이폰' — 혼자서는 부족하다
  return 0;
}

/**
 * 토픽 제목 ↔ 허브 관련성(0~100). 100점 만점, HUB_MIN_RELEVANCE 미만은 연결하지 않는다.
 * @param {string} title 토픽 제목
 * @param {{slug:string,title:string,newsKeywords:string[],newsExclude?:string[]}} hub
 */
function scoreHubMatch(title, hub) {
  const t = String(title || '');
  if (!t || !hub || !Array.isArray(hub.newsKeywords)) return 0;
  // 제외어가 하나라도 있으면 이 허브와는 무관한 기사다.
  if ((hub.newsExclude || []).some((x) => x && t.includes(x))) return 0;

  const hits = hub.newsKeywords
    .filter((kw) => kw && t.includes(kw))
    .map(keywordConfidence)
    .filter((c) => c > 0)
    .sort((a, b) => b - a);
  if (!hits.length) return 0;

  // 최고 신뢰도 + 추가 적중마다 15점. 여러 키워드가 동시에 걸리는 것은 강한 신호다
  // ('갤럭시'만 있는 제목과 '갤럭시 + 폴드8'이 같이 있는 제목은 다르다).
  const extra = Math.min(30, (hits.length - 1) * 15);
  return Math.min(100, hits[0] + extra);
}

/** 관련성이 가장 높은 허브 하나. 문턱 미만이면 null(= 일반 뉴스로 발행). */
function pickHubForTopic(title, hubs) {
  let best = null;
  for (const hub of hubs || []) {
    const relevance = scoreHubMatch(title, hub);
    if (relevance >= HUB_MIN_RELEVANCE && (!best || relevance > best.relevance)) {
      best = { hub, relevance };
    }
  }
  return best;
}

// ── 에버그린 문서 우선순위(PM 지시 §2 "클릭률 높은 사용법/설정법 우선") ────────
// 포맷별 기본 점수. howto·troubleshoot을 위에 둔 근거는 검색 의도다 — 이 두 포맷은
// 이미 문제를 겪고 있는 사람이 찾는 글이라 클릭 동기가 가장 분명하다("배터리가 하루를
// 못 간다"). compare·buying은 구매 전 탐색 단계라 같은 노출에서 클릭률이 낮다.
const FORMAT_PRIORITY = { howto: 100, troubleshoot: 95, compare: 65, buying: 60 };
// "새로 생성된 문서" 판정 창(PM 지시 §1의 신규 문서 트리거).
const FRESH_DOC_HOURS = 48;

function isFreshDoc(doc, now) {
  const t = new Date(doc.created_at || 0).getTime();
  return Number.isFinite(t) && now.getTime() - t <= FRESH_DOC_HOURS * 3600 * 1000;
}

/**
 * 문서 하나의 배급 점수.
 * - 신규 문서(48h 내)  +40 — PM 지시 §1의 자동 트리거를 점수로 구현한다.
 * - 포맷 우선순위      ×0.6
 * - 같은 허브 오늘 중복 -35 — 한 허브가 저녁 시간대를 독점하지 않게 한다.
 * - 본문 분량          최대 +10 — 블록이 있는 문서라야 완결형 본문을 쓸 수 있다.
 */
function scoreEvergreenDoc(doc, ctx) {
  const now = ctx?.now || new Date();
  const fresh = isFreshDoc(doc, now) ? 40 : 0;
  const format = (FORMAT_PRIORITY[doc.format] ?? 50) * 0.6;
  const dupHub = (ctx?.hubsPostedToday || new Set()).has(doc.hub_slug) ? -35 : 0;
  const blocks = Array.isArray(doc.blocks) ? doc.blocks.length : 0;
  const body = Math.min(10, blocks * 3);
  return Math.round(format + fresh + dupHub + body);
}

/** 아직 게시하지 않은 문서 중 점수 1위. postedUrlKeys는 '{hub_slug}/{slug}' 집합. */
function pickEvergreenDoc(docs, postedKeys, ctx) {
  const pool = (docs || []).filter(
    (d) => d.status !== 'draft' && !postedKeys.has(`${d.hub_slug}/${d.slug}`)
  );
  if (!pool.length) return null;
  const ranked = pool
    .map((doc) => ({ doc, score: scoreEvergreenDoc(doc, ctx) }))
    .sort((a, b) => b.score - a.score || String(a.doc.slug).localeCompare(String(b.doc.slug)));
  return ranked[0];
}

/** 대기 중인 문서에 "신규"가 있는가 — pickTypePreference의 트리거 입력. */
function hasFreshPendingDoc(docs, postedKeys, now) {
  return (docs || []).some(
    (d) => !postedKeys.has(`${d.hub_slug}/${d.slug}`) && isFreshDoc(d, now || new Date())
  );
}

// ── 링크 댓글(PM 지시 §3) ───────────────────────────────────────────────────
// 본문에서 링크를 빼는 대신 첫 댓글에 붙인다. 댓글도 500자 제한을 받으므로 링크가 두 개
// 붙는 경우(뉴스+허브)를 감안해 문구를 짧게 유지한다.
const THREADS_MAX_CHARS = 500;

/**
 * @param {{primaryLabel:string, primaryUrl:string, secondaryLabel?:string, secondaryUrl?:string}} parts
 */
function buildCommentText(parts) {
  const lines = [`${parts.primaryLabel} →`, parts.primaryUrl];
  if (parts.secondaryUrl && parts.secondaryUrl !== parts.primaryUrl) {
    lines.push('', `${parts.secondaryLabel} →`, parts.secondaryUrl);
  }
  const text = lines.join('\n');
  // 두 링크가 모두 들어가지 않으면 1순위 링크만 남긴다 — 자르는 쪽이 링크가 되면 안 된다.
  if (text.length > THREADS_MAX_CHARS) {
    return `${parts.primaryLabel} →\n${parts.primaryUrl}`;
  }
  return text;
}

module.exports = {
  kstHour,
  pickTypePreference,
  scoreHubMatch,
  pickHubForTopic,
  scoreEvergreenDoc,
  pickEvergreenDoc,
  hasFreshPendingDoc,
  isFreshDoc,
  buildCommentText,
  keywordConfidence,
  // 상수 — 호출자와 테스트가 같은 값을 보게 노출한다(마법 숫자 복제 금지).
  EVERGREEN_SHARE_MIN,
  EVERGREEN_SHARE_MAX,
  EVERGREEN_SHARE_TARGET,
  SHARE_JUDGE_MIN_SAMPLE,
  NEWS_WINDOW,
  EVERGREEN_WINDOW,
  HUB_MIN_RELEVANCE,
  FORMAT_PRIORITY,
  FRESH_DOC_HOURS,
};
