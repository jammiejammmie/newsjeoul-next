// ═══════════════════════════════════════════════════════════════════════════
// 뉴스저울 Attention Engine — 이 파일은 그 첫 채널 어댑터(Threads)다. 2026-07-21 채과장 최종 리뷰 반영.
//
// 이 엔진의 목적은 "게시"가 아니다. 목적은 다음 흐름이다(이 철학은 개발자가 바뀌어도 유지돼야 한다):
//
//     Google Search 증가 → 색인 증가 → 외부 유입 증가 → 뉴스저울 내부 탐험(Exploration) 증가
//
// 클릭은 수단이지 목표가 아니다. 목표는 유입된 사용자가 뉴스저울 안에서 얼마나 오래·깊이
// 탐험하는가다. 그래서 아래 Distribution Score는 CTR 하나가 아니라 탐험 가능성(Exploration)을
// CTR과 동등하거나 더 중요하게 취급한다.
//
// 장기 아키텍처(지금은 Threads 어댑터 하나만 구현돼 있다):
//
//         Attention Engine
//               │
//               ▼
//        Distribution Engine   ← 이 파일의 선정 로직(채널 독립)
//               │
//     ┌─────────┼─────────────┬─────────┬───────────┬─────┬──────┐
//     ▼         ▼             ▼         ▼           ▼     ▼      ▼
//  Threads   Google           X      Facebook   Newsletter RSS  Push
//  (구현됨)  (구현 안 됨)   (구현 안 됨) (구현 안 됨) (구현 안 됨)(...)(...)
//     │
//     ▼
//  사용자 → 뉴스저울 → 탐험
//
// 채널은 전부 Adapter일 뿐이다. "관심(Attention)을 어디에 어떻게 배분할지"는 채널마다 다시
// 판단하는 게 아니라 이 파일의 공통 엔진(Editorial Score → Distribution Score → 적응형 문턱값)이
// 담당한다. 이 파일 안에서도 그 경계를 코드 섹션 배너로 명시해뒀다 — "채널 독립 영역"은 두 번째
// 채널이 추가돼도 그대로 재사용되고, "채널 종속 영역(Threads Adapter)"만 새로 작성하면 된다.
//
// 최종 원칙(2026-07-21 채과장 최종 승인 기준 — 이 8줄은 앞으로 이 파일과 그 뒤를 잇는 모든
// 채널 어댑터가 따라야 하는 계약이다):
//   1. 채널은 Adapter다.
//   2. 판단은 Distribution Engine이 한다 — 채널마다 판단 로직을 다시 만들지 않는다.
//   3. 콘텐츠 품질은 Editorial Score가 판단한다.
//   4. 배포 우선순위는 Distribution Score가 판단한다.
//   5. 최종 목표는 클릭이 아니라 Exploration이다.
//   6. Google 검색 유입이 가장 중요한 KPI다.
//   7. Distribution Engine은 장기적으로 뉴스저울의 Attention Engine으로 발전한다.
//   8. Threads는 그 첫 번째 Adapter일 뿐이다.
//
// 이번 재설계로 바뀐 것:
// - Thread Score → Editorial Score로 일반화(콘텐츠 자체 품질, 채널 무관).
// - Distribution Score를 계산만 하지 않고 저장한다(ai_context.engines.distribution, markTopicPosted
//   참고) — "왜 이 Topic을 선택했는가"를 나중에 분석·학습·운영 통계에 쓸 수 있도록. engines 네임
//   스페이스 아래 두고 version 필드를 넣은 이유는, 알고리즘이 바뀌어도(v2, v3) 과거 기록과 공존할
//   수 있게 하기 위해서다.
// - 향후 확장 지점을 코드에 명시적으로 남겨뒀다(구현은 안 함, 구조만 열어둠):
//   · Expected Session Time / Exploration Depth — CTR 대신 "얼마나 오래 머무는가"를 직접 점수화.
//   · Search Opportunity Score — 검색량/경쟁도/롱테일/Evergreen/트렌드 등을 종합한 점수.
//   두 컴포넌트 다 DISTRIBUTION_WEIGHTS에 아직 없다 — 추가할 때는 기존 가중치를 재조정해야 한다.
//
// 핵심 원칙(계속 유지):
// - Migration 비의존: topics.ai_context.threads/engines(기존 jsonb 컬럼)만으로 이력 관리.
// - 비용 보호: 자격증명 확인 → 후보 조회 → 점수 계산(전부 DB 데이터만 사용) → 품질/배급 게이트
//   통과 후에만 Claude 호출.
// - 동일 Topic은 평생 1회만 게시(ai_context.threads 존재 여부로 영구 제외).
// - Adaptive Distribution 유지: "오늘 20개 올려" 같은 수동 목표가 아니라, 오늘 실제 생산량에
//   비례해 게시 목표·품질 문턱값을 스스로 계산한다(computeDailyTarget). 운영자가 숫자를 바꿀
//   필요가 없다.
//
// 추가 반영(2026-07-22, PM 지시 — 배급량 재보정 + Background Function 전환):
// - 목표 계산 기준을 published Topic 수에서 원본 기사(articles) 수로 변경 + 최소 20/최대 60의
//   비례 목표(clamp(round(articles×0.10), 20, 60))로 재보정 — 이전 공식은 초기 생산 단계에서
//   목표가 3건까지 떨어져 "생산량 비례"의 취지에 비해 지나치게 낮았다.
// - 1회 실행당 최대 3건, 게시 사이 2~5분 간격을 두려면 26초 동기 함수 하드캡을 넘기 때문에 파일을
//   Background Function으로 전환했다(호출자는 202만 받고 실제 결과는 함수 로그로만 확인 가능).
// ═══════════════════════════════════════════════════════════════════════════
const CHANNEL = 'threads'; // 두 번째 채널 어댑터를 만들 때는 그 파일에서 이 값만 바꾸면 된다.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const BASE_URL = 'https://newsjeoul.co.kr';
const REQUEST_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

// ── 상수(마법 숫자 금지 — 전부 여기서 관리, 근거를 주석에 명시) ─────────────
const MIN_EDITORIAL_SCORE = 60; // 콘텐츠 자체 품질 하한선(100점 만점) — Distribution Score와 별개의 하드 게이트.
const MIN_BODY_LENGTH = 300; // 본문이 이보다 짧으면 "지나치게 빈약"으로 간주해 무조건 제외.
const CANDIDATE_POOL_SIZE = 30; // 점수 계산 대상으로 가져올 후보 풀 크기.
const RECENT_HISTORY_WINDOW = 3; // 최근 게시 패턴(recentPattern) 판단에 쓰는 "최근 게시 N건".

// 오늘 목표 게시 수 — PM 재조정 지시(2026-07-22): 기준을 "오늘 published Topic 수"에서 "오늘
// 원본 기사(articles) 수"로 변경. published Topic만 기준으로 삼으면(예: 오늘 10건) 목표가 3건까지
// 떨어져 "생산량에 비례"라는 원래 취지와 달리 실제 배급량이 지나치게 작아지는 문제가 있었다(콘텐츠
// 공장이 커지는 초기 단계엔 기사 생산이 published Topic 전환보다 훨씬 앞서 달리기 때문). 최소/최대
// 하한·상한을 명시적으로 둔 이유는 "기사 100건 이하"처럼 생산이 아직 적은 시기에도 배급 채널 자체가
// 죽어있는 것처럼 보이지 않게 하기 위해서다(PM 지시: "기본 목표는 하루 20건 이상").
const ARTICLE_TARGET_RATIO = 0.10; // articles × 10%
const MIN_DAILY_TARGET = 20;
const MAX_DAILY_TARGET = 60;
// 목표치 이내일 때(공급 여유 있음) 요구 점수는 낮게, 목표치를 초과했을 때(이미 충분히 배급됨)는
// 정말 뛰어난 후보만 통과하도록 점진적으로 엄격해진다 — 고정 상한이 아니라 적응형 문턱값이다.
const DISTRIBUTION_SCORE_FLOOR = 55;
const DISTRIBUTION_SCORE_CEILING = 80;

// 1회 실행(Netlify Background Function, 최대 15분 예산)당 최대 게시 건수와 게시 사이 간격.
// 매시간 1건씩만으로는 "하루 20건 이상"을 달성하기 어려워(하루 최대 24건) PM 지시로 도입 —
// 남은 목표를 남은 시간으로 나눠 이번 실행에서 몇 건을 시도할지 결정한다(computePostsThisRun).
// 간격을 두는 이유는 Threads API 연속 호출로 인한 스팸성 패턴을 피하기 위함.
const MAX_POSTS_PER_RUN = 3;
// 테스트에서만 오버라이드 가능(운영 기본값은 그대로 2~5분) — 실제 분 단위 대기를 mock 테스트에서
// 그대로 기다리면 테스트가 몇 분씩 걸리므로, 테스트 전용 환경변수로만 짧게 조정할 수 있게 열어둔다.
const MIN_GAP_MS = Number(process.env.POST_GAP_MIN_MS) || 2 * 60 * 1000; // 2분
const MAX_GAP_MS = Number(process.env.POST_GAP_MAX_MS) || 5 * 60 * 1000; // 5분

// Distribution Score 구성 가중치(합=1.0) — PM 지시 §1의 9개 요소를 7개 계산 컴포넌트로 매핑.
// (카테고리 생산량 + 카테고리별 오늘 게시 수 → categoryAllocation 하나로 통합: 두 값의 격차가
//  실제로 의미 있는 신호이기 때문)
const DISTRIBUTION_WEIGHTS = {
  editorialScore: 0.20,     // Editorial Score(콘텐츠 자체 품질 — 채널 무관, 구 Thread Score)
  categoryAllocation: 0.20, // 카테고리 생산량 vs 카테고리별 오늘 게시 수 격차("오늘 부족한 분야" 우선)
  recentPattern: 0.10,      // 최근 게시 패턴(직전/최근 3건과의 반복 여부)
  searchIntent: 0.15,       // 검색 의도 적합성
  expectedCTR: 0.15,        // 예상 CTR(구조적 proxy — 실제 클릭 데이터 없음, 아래 함수 주석 참고)
  topicWeight: 0.10,        // Topic Weight(importance_score)
  exploration: 0.10,        // Exploration 가능성 — 클릭 이후 더 탐험할 거리가 있는가(아래 주석 참고)
};
// 합계는 1.0이어야 한다. 아래 두 컴포넌트는 PM 지시(2026-07-21 §3, §6)로 미리 문서화만 해두는
// 확장 지점이다 — 지금은 구현하지 않는다. 실제로 추가할 때는 반드시 위 가중치를 재조정해서
// 합이 1.0을 유지하도록 해야 한다(새 키를 0이 아닌 값으로 넣고 기존 값들을 비례 축소).
//   - expectedSession(또는 explorationDepth): CTR 대신 "얼마나 오래/깊이 머무는가"를 직접 점수화.
//     필요 데이터: 실제 세션 시간·페이지뷰 로그(현재 없음 — 애널리틱스 연동 필요).
//   - searchOpportunity: 검색량·경쟁도·롱테일 여부·Evergreen 여부·검색 의도 명확성·계절성·트렌드
//     상승 여부를 종합한 점수. 필요 데이터: 검색 키워드 볼륨/트렌드 데이터(현재 없음 — 외부 API
//     연동 필요, 예: Google Trends/Search Console).

// ═══ 채널 독립 영역 시작(Attention/Distribution Engine 공통) ═══════════════
// 여기서부터 selectCandidate()까지는 Threads를 전혀 몰라도 되는 코드다. 두 번째 채널(Google/X/
// Facebook/Newsletter/RSS/Push)을 추가할 때 이 영역은 건드리지 않는 것이 목표다 — 채널마다
// 새로 판단하는 게 아니라, 여기서 계산된 Editorial/Distribution Score를 그대로 재사용한다.
//
// ── Editorial Score(콘텐츠 자체 품질 — Distribution Score의 입력 중 하나일 뿐, 최종 기준 아님) ──
// 구 "Thread Score". Threads뿐 아니라 어떤 채널에도 재사용 가능한, 콘텐츠 자체의 품질 점수라는
// 의미로 이름을 일반화했다(PM 지시 2026-07-21 §2) — 계산 로직 자체는 바뀌지 않았다.
// 총점 100 = 무게25 + 완성도20 + 출처10 + 왜중요한가10 + 키워드10 + 논쟁성10 + 최신성15
function computeEditorialScore(topic) {
  const b = {};
  const draft = topic.ai_context?.draft || {};
  const evidence = topic.ai_context?.evidence || {};
  const weight = topic.ai_context?.weight || {};

  b.weight = Math.min(25, Math.round(((topic.importance_score || 0) / 999) * 25));

  const leadLen = (draft.lead || '').length;
  const blockCount = Array.isArray(draft.blocks) ? draft.blocks.length : 0;
  const bodyLen = (draft.blocks || []).reduce((s, blk) => s + (blk.content || '').length, 0);
  b.completeness = (leadLen >= 20 ? 5 : 0) + (blockCount >= 2 ? 5 : 0) + (bodyLen >= MIN_BODY_LENGTH ? 10 : 0);

  b.source = (evidence.sources || []).some((s) => s.url) ? 10 : 0;
  b.whyItMatters = (weight.reasons || []).length > 0 ? 10 : 0;

  const kwCount = (draft.display_keywords || []).length;
  b.keywords = kwCount >= 2 ? 10 : kwCount === 1 ? 5 : 0;

  const comp = weight.components || {};
  b.controversy = Math.min(10, Math.round(((comp.controversy_score_bonus || 0) + (comp.dual_perspective_bonus || 0)) / 10));

  const hoursSince = topic.updated_at ? (Date.now() - new Date(topic.updated_at).getTime()) / 3600000 : 999;
  b.recency = hoursSince <= 6 ? 15 : hoursSince <= 24 ? 9 : hoursSince <= 48 ? 4 : 0;

  const score = Object.values(b).reduce((a, v) => a + v, 0);
  return { score, breakdown: b, bodyLen };
}

// 최소 품질 게이트(전부 하드 조건 — 하나라도 실패하면 제외, PM 지시 §4)
function passesMinimumQuality(topic, scored) {
  const draft = topic.ai_context?.draft;
  const evidence = topic.ai_context?.evidence;
  if (!topic.name) return false;
  if (!draft || !draft.lead) return false;
  if (!Array.isArray(draft.blocks) || draft.blocks.length === 0) return false;
  if (!evidence?.sources?.some((s) => s.url)) return false;
  if (scored.bodyLen < MIN_BODY_LENGTH) return false;
  if (scored.score < MIN_EDITORIAL_SCORE) return false;
  return true;
}

// ── Distribution Score 하위 컴포넌트 ────────────────────────────────
// 오늘 생산은 많은데 게시는 적게 된 분야("부족한 분야")에 가산점을 준다. gap이 클수록(생산 비중 >
// 게시 비중) 점수가 올라간다 — 자동차만 100개 생산돼도 자동차만 계속 오르는 문제를 여기서 막는다.
function computeCategoryAllocationScore(category, producedStats, postedStats) {
  const catCount = Object.keys(producedStats.byCategory).length || 1;
  const producedShare = producedStats.total > 0
    ? (producedStats.byCategory[category] || 0) / producedStats.total
    : 1 / catCount;
  const postedShare = postedStats.total > 0 ? (postedStats.byCategory[category] || 0) / postedStats.total : 0;
  const gap = producedShare - postedShare;
  return Math.max(0, Math.min(100, 50 + gap * 200));
}

function computeRecentPatternScore(category, recentCategories) {
  if (!recentCategories.length) return 100;
  if (recentCategories[0] === category) return 0; // 직전과 동일 — 강한 감점
  if (recentCategories.includes(category)) return 40; // 최근 3건 안에 등장 — 약한 감점
  return 100;
}

const SEARCH_INTENT_SCORE_BY_GATE = {
  SEARCH_GUIDE: 100, COMPARE: 95, PRODUCT_BRIEF: 90, UPDATE: 75,
  BACKGROUND: 60, DEEP_DIVE: 55, SHORT_BRIEF: 40, REJECT: 20,
};
function computeSearchIntentScore(topic) {
  return SEARCH_INTENT_SCORE_BY_GATE[topic.gate_status] ?? 50;
}

// 예상 CTR — 실제 클릭 로그가 아직 없어 "측정치"가 아니라 "구조적 proxy"다. 숫자·비교 표현·
// 대립 시각·키워드 밀도처럼 클릭을 유도하는 것으로 알려진 구조적 신호만 사용한다. 실제 Threads
// 클릭 데이터가 쌓이면 이 함수를 실측 기반으로 교체해야 한다(현재는 근사치임을 명시).
function estimateExpectedCTR(topic) {
  let s = 40;
  const title = topic.name || '';
  if (/\d/.test(title)) s += 15;
  if (/vs\.?|대비|비교|얼마|왜|어떻게|누가/i.test(title)) s += 15;
  const perspectives = topic.ai_context?.draft?.perspective_markers || [];
  if (perspectives.length > 1) s += 15;
  const kw = topic.ai_context?.draft?.display_keywords || [];
  if (kw.length >= 2) s += 15;
  return Math.min(100, s);
}

function computeTopicWeightScore(topic) {
  return Math.max(0, Math.min(100, Math.round(((topic.importance_score || 0) / 999) * 100)));
}

// Exploration Score — PM 지시(2026-07-21 §4): "클릭 → 탐험"이 뉴스저울의 철학이고, Exploration은
// 앞으로 CTR보다 더 중요한 지표가 된다. 유입된 방문자가 클릭 이후 얼마나 더 오래·깊이 다른 색인
// 페이지로 이동할 가능성이 있는지를 반영한다.
//
// 이 함수가 다뤄야 할 신호 9가지와 현재 구현 상태(향후 아래 목록을 다 채우는 게 목표 — 지금은
// 함수 구조만 열어두고, 이미 공짜로 있는 데이터부터 채웠다):
//   [구현됨] Guide 존재 여부      — expansion_drafts에 angle:'guide' 존재
//   [구현됨] Compare 존재 여부    — expansion_drafts에 angle:'compare' 존재
//   [구현됨] FAQ 존재 여부        — expansion_drafts에 angle:'faq' 존재
//   [구현됨] History 존재 여부    — expansion_drafts에 angle:'background' 존재(배경 설명 = History)
//   [구현됨] Timeline 존재 여부   — expansion_drafts에 angle:'update' 존재(진행 상황 갱신 = Timeline)
//   [구현됨] Expansion Draft 수   — expansion_drafts.length
//   [미구현] Related Topic 수     — topic_relations 쿼리 필요(아래 참고)
//   [미구현] 내부 링크 수         — topic_relations + expansion_drafts 상호링크 집계 필요
//   [미구현] 연결된 Entity 수     — topic_entities 쿼리 필요
// 미구현 3개는 후보 30개마다 매시간 관계/엔티티 쿼리를 추가로 던지는 비용 대비 이득을 아직
// 검증하지 못해 보류했다. 이 컴포넌트를 별도 함수로 분리해둔 이유가 그것이다: 나중에 그 신호를
// 추가해도 가중치 구조(DISTRIBUTION_WEIGHTS.exploration)는 그대로 두고 이 함수 내부만 확장하면 된다.
const EXPLORATION_SIGNAL_ANGLES = ['guide', 'compare', 'faq', 'background', 'update'];
function computeExplorationScore(topic) {
  const drafts = topic.ai_context?.expansion_drafts || [];
  const anglesPresent = new Set(drafts.map((d) => d.angle));
  const signalCount = EXPLORATION_SIGNAL_ANGLES.filter((a) => anglesPresent.has(a)).length;
  const importance = topic.importance_score || 0;
  const potentialBonusAngles = importance >= 400 ? 3 : importance >= 250 ? 2 : 1;
  return Math.min(100, drafts.length * 15 + signalCount * 10 + potentialBonusAngles * 10);
}

function computeDistributionScore(topic, baseQuality, ctx) {
  const components = {
    editorialScore: baseQuality.score,
    categoryAllocation: computeCategoryAllocationScore(topic.category, ctx.producedStats, ctx.postedStats),
    recentPattern: computeRecentPatternScore(topic.category, ctx.recentCategories),
    searchIntent: computeSearchIntentScore(topic),
    expectedCTR: estimateExpectedCTR(topic),
    topicWeight: computeTopicWeightScore(topic),
    exploration: computeExplorationScore(topic),
  };
  const distributionScore = Math.round(
    Object.entries(DISTRIBUTION_WEIGHTS).reduce((sum, [key, w]) => sum + components[key] * w, 0)
  );
  return { distributionScore, components };
}

// 오늘 원본 기사(articles) 수에 비례한 목표치 — clamp(round(articles×0.10), 20, 60).
// "고정 20건"이 아니라 "최소 20, 최대 60인 비례 목표"다: 기사가 늘어나면 목표도 60까지 계속
// 늘어난다(PM 지시 2026-07-22 — 기사100→20, 210→21, 500→50, 600+→60 상한).
function computeDailyTarget(todayArticles) {
  const raw = Math.round(todayArticles * ARTICLE_TARGET_RATIO);
  return Math.max(MIN_DAILY_TARGET, Math.min(MAX_DAILY_TARGET, raw));
}

// 이번 실행(1시간 주기)에서 몇 건을 시도할지 — "남은 목표 ÷ 남은 시간"(PM 지시 2026-07-22 예시와
// 동일한 계산). 목표를 이미 채웠어도 0건이 아니라 1건은 시도한다 — 정말 뛰어난 후보라면 적응형
// 문턱값(computeAdaptiveMinDistributionScore)이 알아서 통과시키고, 아니면 자연히 Skip된다.
function computePostsThisRun(dailyTarget, postedToday, now = new Date()) {
  const remaining = Math.max(0, dailyTarget - postedToday);
  if (remaining <= 0) return 1;
  const hoursRemainingToday = Math.max(1, 24 - (now.getUTCHours() + now.getUTCMinutes() / 60));
  return Math.min(MAX_POSTS_PER_RUN, Math.max(1, Math.ceil(remaining / hoursRemainingToday)));
}

// 목표 대비 진행률에 따라 요구 점수를 부드럽게 올린다(하드 컷오프 아님) — 목표를 채웠어도
// 정말 좋은 후보는 여전히 통과할 수 있다. 목표가 0(오늘 생산 없음)이면 예외적인 경우만 허용.
function computeAdaptiveMinDistributionScore(dailyTarget, postedToday) {
  if (dailyTarget <= 0) return DISTRIBUTION_SCORE_CEILING;
  const progress = postedToday / dailyTarget;
  if (progress <= 1) return DISTRIBUTION_SCORE_FLOOR;
  const over = Math.min(1, progress - 1);
  return Math.round(DISTRIBUTION_SCORE_FLOOR + (DISTRIBUTION_SCORE_CEILING - DISTRIBUTION_SCORE_FLOOR) * over);
}

// ── Data(채널 독립 — CHANNEL 상수로 파라미터화, 두 번째 채널이 생겨도 그대로 재사용) ──────
// 평생 1회 게시 원칙 — ai_context[CHANNEL]이 이미 있으면(=posted_at 존재) 영구 제외. 채널별로
// 독립된 dedup 키를 쓰기 때문에(ai_context.threads / 나중엔 ai_context.google 등) 한 Topic이
// 여러 채널에 각각 게시되는 것은 막지 않는다 — "평생 1회"는 채널 단위다.
async function fetchCandidatePool() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,slug,name,summary,category,gate_status,importance_score,updated_at,ai_context` +
    `&status=eq.active&editorial_status=eq.published&ai_context->${CHANNEL}->>posted_at=is.null` +
    `&order=importance_score.desc&limit=${CANDIDATE_POOL_SIZE}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) throw new Error('topics 조회 실패: ' + await res.text());
  return res.json();
}

// 최근 게시 이력(전체 기간 중 최근 N건, 카테고리 반복 패턴 판단용) — jsonb 경로 정렬 문법 리스크를
// 피해 넉넉히 가져와 클라이언트에서 정렬한다.
async function fetchRecentPostedCategories(limit) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=category,ai_context&status=eq.active` +
    `&ai_context->${CHANNEL}->>posted_at=not.is.null&limit=30`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return rows
    .sort((a, b) => (b.ai_context?.[CHANNEL]?.posted_at || '').localeCompare(a.ai_context?.[CHANNEL]?.posted_at || ''))
    .slice(0, limit)
    .map((r) => r.category)
    .filter(Boolean);
}

// 오늘(UTC) 실제 웹 생산량 — 총량과 카테고리별 분포. computeDailyTarget과 categoryAllocation의 입력.
async function fetchTodayProducedStats() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,category&status=eq.active&editorial_status=eq.published` +
    `&created_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return { total: 0, byCategory: {} };
  const rows = await res.json();
  const byCategory = {};
  rows.forEach((r) => { byCategory[r.category] = (byCategory[r.category] || 0) + 1; });
  return { total: rows.length, byCategory };
}

// 오늘(UTC) 원본 기사(articles) 수 — computeDailyTarget의 유일한 입력. 카테고리 배분과는 무관하고
// 오직 "오늘 배급 목표"를 정하는 데만 쓴다(PM 지시 2026-07-22 — articles 수=오늘 배급 규모 결정,
// published Topic/장문=실제 게시 후보, 이 둘의 역할을 분리).
async function fetchTodayArticleCount() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?select=id&created_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: { ...REQUEST_HEADERS, Prefer: 'count=exact' }, method: 'HEAD' }
  );
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) || 0 : 0;
}

// 오늘(UTC) 이 채널의 게시 실적 — 총량과 카테고리별 분포. 운영 보고(오늘 게시 성공 수)에도 그대로 쓴다.
async function fetchTodayPostedStats() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,category&status=eq.active` +
    `&ai_context->${CHANNEL}->>posted_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return { total: 0, byCategory: {} };
  const rows = await res.json();
  const byCategory = {};
  rows.forEach((r) => { byCategory[r.category] = (byCategory[r.category] || 0) + 1; });
  return { total: rows.length, byCategory };
}

// 후보 선정 전체 파이프라인 — Thread Score(품질 하한선) → Distribution Score(배급 우선순위) →
// 오늘 생산량 기반 적응형 문턱값. 반환: { topic, reason, detail } — topic이 null이면 reason에
// 사유가 담긴다(no_candidate/below_quality_threshold/below_distribution_threshold).
// 게시하지 않은 후보 로그(best-effort) — 지금은 알고리즘보다 "왜 게시가 적었는지" 분석할 수 있는
// 데이터가 더 중요하다(PM 지시 2026-07-22). 실패해도 메인 흐름을 막지 않는다. distribution_skip_log
// 테이블이 아직 마이그레이션 전이면(supabase/distribution_ops_logging_migration.sql 미적용) 조용히
// 실패하고 넘어간다.
async function logSkippedCandidates(rows) {
  if (!rows.length) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/distribution_skip_log`, {
      method: 'POST',
      headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) console.error(`DISTRIBUTION_SKIP_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, await res.text());
  } catch (e) {
    console.error(`DISTRIBUTION_SKIP_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, e.message);
  }
}

async function selectCandidate() {
  const [pool, recentCategories, producedStats, postedStats, articleCount] = await Promise.all([
    fetchCandidatePool(),
    fetchRecentPostedCategories(RECENT_HISTORY_WINDOW),
    fetchTodayProducedStats(),
    fetchTodayPostedStats(),
    fetchTodayArticleCount(),
  ]);
  const dailyTarget = computeDailyTarget(articleCount);
  const adaptiveMinScore = computeAdaptiveMinDistributionScore(dailyTarget, postedStats.total);
  const baseDetail = { dailyTarget, todayArticleCount: articleCount, todayProducedTotal: producedStats.total, todayPostedTotal: postedStats.total };

  if (!pool.length) {
    await logSkippedCandidates([{ channel: CHANNEL, reason: 'no_candidate', detail: { poolSize: 0 } }]);
    return { topic: null, reason: 'no_candidate', detail: { poolSize: 0, ...baseDetail } };
  }

  const scoredAll = pool.map((t) => ({ topic: t, base: computeEditorialScore(t) }));
  const eligible = scoredAll.filter((s) => passesMinimumQuality(s.topic, s.base));
  const ineligible = scoredAll.filter((s) => !passesMinimumQuality(s.topic, s.base));
  const ineligibleRows = ineligible.map((s) => ({
    channel: CHANNEL, topic_id: s.topic.id, topic_name: s.topic.name, category: s.topic.category,
    editorial_score: s.base.score, reason: 'quality_threshold', detail: { breakdown: s.base.breakdown },
  }));

  if (!eligible.length) {
    await logSkippedCandidates(ineligibleRows);
    return {
      topic: null, reason: 'below_quality_threshold',
      detail: { poolSize: pool.length, minEditorialScore: MIN_EDITORIAL_SCORE, topEditorialScoreSeen: Math.max(...scoredAll.map((s) => s.base.score), 0), ...baseDetail },
    };
  }

  const ctx = { producedStats, postedStats, recentCategories };
  const ranked = eligible
    .map((s) => ({ topic: s.topic, ...computeDistributionScore(s.topic, s.base, ctx) }))
    .sort((a, b) => b.distributionScore - a.distributionScore);

  const winner = ranked.find((r) => r.distributionScore >= adaptiveMinScore);

  const belowDistributionRows = ranked
    .filter((r) => r.topic.id !== winner?.topic.id && r.distributionScore < adaptiveMinScore)
    .map((r) => ({
      channel: CHANNEL, topic_id: r.topic.id, topic_name: r.topic.name, category: r.topic.category,
      editorial_score: r.components.editorialScore, distribution_score: r.distributionScore,
      reason: 'distribution_threshold', detail: { components: r.components, adaptiveMinScore },
    }));
  await logSkippedCandidates([...ineligibleRows, ...belowDistributionRows]);

  if (!winner) {
    return {
      topic: null, reason: 'below_distribution_threshold',
      detail: { adaptiveMinScore, topDistributionScoreSeen: ranked[0]?.distributionScore || 0, candidatesConsidered: ranked.length, ...baseDetail },
    };
  }

  return {
    topic: winner.topic, reason: 'success',
    detail: { distributionScore: winner.distributionScore, components: winner.components, adaptiveMinScore, candidatesConsidered: ranked.length, recentCategories, ...baseDetail },
  };
}

// 채널 독립 선정 로직은 여기까지다. 아래 저장 함수들은 CHANNEL 상수로 파라미터화돼 있어 그대로
// 재사용되지만, Threads Graph API 호출 자체(생성 문구/게시)는 채널마다 새로 작성해야 한다.
// ═══ 채널 독립 영역 끝 ═════════════════════════════════════════════════════

// ── Post log(상세, best-effort) ──────────────────────────────────
async function savePostLog(fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/threads_posts`, {
    method: 'POST',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`DISTRIBUTION_LOG_SAVE_FAILED[${CHANNEL}](핵심 동작에는 영향 없음, 상세 로그만 누락):`, detail);
    return { ok: false, detail };
  }
  return { ok: true };
}

// 핵심 dedup 기록 + Distribution Score 저장 — 기존 ai_context merge 패턴 재사용.
//
// ai_context.engines.distribution은 "왜 이 Topic이 선택됐는가"를 나중에 분석·AI 학습·운영
// 통계·점수 변화 추적에 쓸 수 있도록 계산 결과를 실제로 저장한다(PM 지시 2026-07-21 §4 — 계산만
// 하고 버리지 말 것). engines 네임스페이스 아래 두고 version을 남기는 이유는 채점 알고리즘이
// v2/v3로 바뀌어도 과거 기록과 공존시키기 위해서다. 지금은 채널이 하나뿐이라 topic당 1개 객체로
// 최신값만 덮어쓴다 — 두 번째 채널이 생겨 같은 Topic이 여러 채널에 각각 다른 시점에 게시될 수
// 있게 되면, 이 필드를 채널별/시점별 배열로 바꿔야 할 수 있다(지금은 그 정도로 충분하다고 판단).
const DISTRIBUTION_ENGINE_VERSION = 1; // 채점 알고리즘이 바뀌면 올린다 — 과거 기록(v1)과 새 기록(v2)이 공존해야 하므로 값 자체를 덮어쓰지 않고 버전을 남긴다.

async function markTopicPosted(topic, postId, hookType, distributionDetail) {
  const c = distributionDetail?.components || {};
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topic.id}`, {
    method: 'PATCH',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      ai_context: {
        ...(topic.ai_context || {}),
        [CHANNEL]: { posted_at: new Date().toISOString(), post_id: postId, hook_type: hookType },
        engines: {
          ...(topic.ai_context?.engines || {}),
          distribution: {
            version: DISTRIBUTION_ENGINE_VERSION,
            score: distributionDetail?.distributionScore ?? null,
            components: {
              editorial_score: c.editorialScore ?? null,
              expected_ctr: c.expectedCTR ?? null,
              exploration: c.exploration ?? null,
              topic_weight: c.topicWeight ?? null,
              category_allocation: c.categoryAllocation ?? null,
              recent_pattern: c.recentPattern ?? null,
              search_intent: c.searchIntent ?? null,
            },
            channel: CHANNEL,
            calculated_at: new Date().toISOString(),
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`핵심 dedup 기록 실패(topics.ai_context.${CHANNEL}): ` + await res.text());
}

// 게시 직전 최종 재확인(레이스 컨디션 방어) — 동시 실행 시 같은 Topic이 중복 선택될 가능성을 차단.
async function isStillUnposted(topicId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topicId}&select=ai_context`, { headers: REQUEST_HEADERS });
  if (!res.ok) return true; // 조회 실패 시엔 진행(과도한 차단 방지) — 이후 markTopicPosted가 최종 방어선
  const [row] = await res.json();
  return !row?.ai_context?.[CHANNEL]?.posted_at;
}

// ═══ 채널 종속 영역 시작(Threads Adapter) ═══════════════════════════════════
// 여기서부터 파일 끝까지는 이 채널(Threads)에만 해당하는 코드다. 두 번째 채널을 추가할 때는
// 새 파일에 이 영역만 새로 작성하고(문구 생성 프롬프트, API 포맷), 위 채널 독립 영역은 import해
// 재사용하면 된다(지금은 한 파일에 같이 있지만 분리 준비가 된 상태다).
//
// ── CTA(마지막 유도 문구) 라이브러리 ─────────────────
// PM 지시(2026-07-22 §6): "뉴스저울에서 확인하세요" 같은 문구는 반복되면 광고처럼 느껴진다 —
// 앞으로 쓰지 않는다. 대신 호기심/미완결/질문/반전/연결성 5개 결을 가진 106개 문구 중 하나를
// 매번 무작위로 골라 쓴다. Claude가 매번 새로 창작하게 하지 않고 고정 목록에서 뽑는 이유는,
// 각 문구에 id를 부여해 threads_posts.cta_phrase_id로 저장해두면 나중에 실제 클릭 데이터가
// 쌓였을 때 "어떤 문구가 실제로 클릭을 더 유도했는지" 문구 단위로 분석·자동 최적화(가중 랜덤 등)할
// 수 있는 구조가 되기 때문이다 — 지금은 균등 랜덤이고, 그 최적화 자체는 아직 구현하지 않는다.
const CTA_PHRASES = [
  // 호기심(curiosity)
  { id: 'cur01', category: '호기심', text: '여기엔 아직 말하지 않은 부분이 있습니다.' },
  { id: 'cur02', category: '호기심', text: '숫자 하나가 이 이야기를 완전히 바꿉니다.' },
  { id: 'cur03', category: '호기심', text: '생각보다 훨씬 복잡한 배경이 있습니다.' },
  { id: 'cur04', category: '호기심', text: '이 장면 뒤에 숨은 이야기가 있습니다.' },
  { id: 'cur05', category: '호기심', text: '다들 놓치고 지나간 부분이 있습니다.' },
  { id: 'cur06', category: '호기심', text: '표면 아래 진짜 이야기가 있습니다.' },
  { id: 'cur07', category: '호기심', text: '이 정도로 끝날 이야기가 아닙니다.' },
  { id: 'cur08', category: '호기심', text: '여기서 한 걸음만 더 들어가 보면 다릅니다.' },
  { id: 'cur09', category: '호기심', text: '많은 사람이 아직 모르는 사실이 있습니다.' },
  { id: 'cur10', category: '호기심', text: '이 사건, 생각보다 오래 준비된 이야기입니다.' },
  { id: 'cur11', category: '호기심', text: '지금 보이는 게 전부는 아닙니다.' },
  { id: 'cur12', category: '호기심', text: '이면에 흐르는 맥락이 따로 있습니다.' },
  { id: 'cur13', category: '호기심', text: '이 숫자가 말해주는 진짜 의미가 있습니다.' },
  { id: 'cur14', category: '호기심', text: '왜 지금 이 시점인지 이유가 있습니다.' },
  { id: 'cur15', category: '호기심', text: '이 결정 뒤에 숨은 계산이 있습니다.' },
  { id: 'cur16', category: '호기심', text: '생각지도 못한 곳에서 이 얘기가 다시 나옵니다.' },
  { id: 'cur17', category: '호기심', text: '이 사람이 왜 그렇게 말했는지 이유가 따로 있습니다.' },
  { id: 'cur18', category: '호기심', text: '이 그림, 각도를 바꾸면 다르게 보입니다.' },
  { id: 'cur19', category: '호기심', text: '여기엔 우리가 아직 잘 모르는 변수가 있습니다.' },
  { id: 'cur20', category: '호기심', text: '이 이야기, 알고 보면 시작이 따로 있습니다.' },
  { id: 'cur21', category: '호기심', text: '이 발표 뒤에 진짜 하고 싶었던 말이 있습니다.' },
  { id: 'cur22', category: '호기심', text: '이 그래프 하나로 설명되지 않는 부분이 있습니다.' },
  // 미완결(incomplete)
  { id: 'inc01', category: '미완결', text: '이 이야기는 여기서 끝나지 않습니다.' },
  { id: 'inc02', category: '미완결', text: '아직 결론이 나지 않은 부분이 남아 있습니다.' },
  { id: 'inc03', category: '미완결', text: '이건 시작일 뿐, 진짜는 이제부터입니다.' },
  { id: 'inc04', category: '미완결', text: '이 사건은 계속 이어지고 있습니다.' },
  { id: 'inc05', category: '미완결', text: '다음 국면이 이미 준비되고 있습니다.' },
  { id: 'inc06', category: '미완결', text: '이걸로 끝났다고 보기엔 이릅니다.' },
  { id: 'inc07', category: '미완결', text: '아직 풀리지 않은 매듭이 남아 있습니다.' },
  { id: 'inc08', category: '미완결', text: '지금 이 순간에도 상황이 바뀌고 있습니다.' },
  { id: 'inc09', category: '미완결', text: '이 이야기, 아직 절반도 안 나왔습니다.' },
  { id: 'inc10', category: '미완결', text: '다음 장면이 이미 예고돼 있습니다.' },
  { id: 'inc11', category: '미완결', text: '여기서 멈출 이야기가 아닙니다.' },
  { id: 'inc12', category: '미완결', text: '결과가 나오기까지는 아직 시간이 남았습니다.' },
  { id: 'inc13', category: '미완결', text: '지금은 과정일 뿐, 결말은 따로 있습니다.' },
  { id: 'inc14', category: '미완결', text: '이 흐름, 아직 정점에 도달하지 않았습니다.' },
  { id: 'inc15', category: '미완결', text: '다음 발표를 기다리는 사람이 많습니다.' },
  { id: 'inc16', category: '미완결', text: '이 사안은 계속 지켜봐야 할 이유가 있습니다.' },
  { id: 'inc17', category: '미완결', text: '아직 답이 나오지 않은 질문이 남아 있습니다.' },
  { id: 'inc18', category: '미완결', text: '지금 상황은 절반의 그림일 뿐입니다.' },
  { id: 'inc19', category: '미완결', text: '이 뒤에 이어질 이야기가 이미 예정돼 있습니다.' },
  { id: 'inc20', category: '미완결', text: '완결된 이야기라기엔 아직 이릅니다.' },
  { id: 'inc21', category: '미완결', text: '다음 단계가 벌써 움직이고 있습니다.' },
  { id: 'inc22', category: '미완결', text: '이 사건, 아직 진행형입니다.' },
  // 질문(question)
  { id: 'q01', category: '질문', text: '왜 하필 지금이었을까요?' },
  { id: 'q02', category: '질문', text: '이 결정이 정말 최선이었을까요?' },
  { id: 'q03', category: '질문', text: '여기서 진짜 이득을 본 건 누구일까요?' },
  { id: 'q04', category: '질문', text: '이게 우연이었을까요, 계획이었을까요?' },
  { id: 'q05', category: '질문', text: '다음엔 어떤 일이 벌어질까요?' },
  { id: 'q06', category: '질문', text: '이 흐름, 얼마나 더 이어질까요?' },
  { id: 'q07', category: '질문', text: '누가 이 상황을 가장 반기고 있을까요?' },
  { id: 'q08', category: '질문', text: '이 판단, 시간이 지나도 맞는 판단일까요?' },
  { id: 'q09', category: '질문', text: '이게 정말 끝일까요?' },
  { id: 'q10', category: '질문', text: '왜 다들 이 부분은 얘기하지 않을까요?' },
  { id: 'q11', category: '질문', text: '이 숫자, 정말 믿을 수 있는 걸까요?' },
  { id: 'q12', category: '질문', text: '이 결정으로 누가 웃고 누가 울까요?' },
  { id: 'q13', category: '질문', text: '이게 처음이자 마지막 신호일까요?' },
  { id: 'q14', category: '질문', text: '여기서 우리가 놓치고 있는 건 뭘까요?' },
  { id: 'q15', category: '질문', text: '이 방향이 정말 맞는 방향일까요?' },
  { id: 'q16', category: '질문', text: '다음 차례는 누가 될까요?' },
  { id: 'q17', category: '질문', text: '이 변화, 얼마나 오래갈까요?' },
  { id: 'q18', category: '질문', text: '이게 정말 우연의 일치일까요?' },
  { id: 'q19', category: '질문', text: '이 선택, 나였다면 같은 선택을 했을까요?' },
  { id: 'q20', category: '질문', text: '이 흐름을 가장 먼저 알아챈 사람은 누구였을까요?' },
  { id: 'q21', category: '질문', text: '이 문제, 정말 해결된 걸까요?' },
  { id: 'q22', category: '질문', text: '이게 새로운 시작일까요, 끝의 시작일까요?' },
  // 반전(twist)
  { id: 'tw01', category: '반전', text: '예상과는 다른 결과가 나왔습니다.' },
  { id: 'tw02', category: '반전', text: '다들 예상한 것과 정반대로 흘러갑니다.' },
  { id: 'tw03', category: '반전', text: '가장 유력했던 시나리오가 뒤집혔습니다.' },
  { id: 'tw04', category: '반전', text: '생각했던 원인이 아니었습니다.' },
  { id: 'tw05', category: '반전', text: '이 결과, 아무도 예상하지 못했습니다.' },
  { id: 'tw06', category: '반전', text: '처음 알려진 것과 지금은 많이 다릅니다.' },
  { id: 'tw07', category: '반전', text: '예상했던 승자와 실제 승자가 달랐습니다.' },
  { id: 'tw08', category: '반전', text: '다들 안전하다고 믿었던 부분에서 문제가 나왔습니다.' },
  { id: 'tw09', category: '반전', text: '가장 조용했던 쪽이 가장 큰 변수였습니다.' },
  { id: 'tw10', category: '반전', text: '이길 것 같던 쪽이 밀리고 있습니다.' },
  { id: 'tw11', category: '반전', text: '원인이라고 알려진 것, 사실 결과였습니다.' },
  { id: 'tw12', category: '반전', text: '다들 주목한 곳이 아니라 다른 곳에서 답이 나왔습니다.' },
  { id: 'tw13', category: '반전', text: '처음 발표와 최종 결과가 꽤 다릅니다.' },
  { id: 'tw14', category: '반전', text: '가장 자신 있어 했던 부분에서 빈틈이 나왔습니다.' },
  { id: 'tw15', category: '반전', text: '예상 밖의 인물이 핵심 변수였습니다.' },
  { id: 'tw16', category: '반전', text: '다들 끝났다고 생각한 순간 다시 뒤집혔습니다.' },
  { id: 'tw17', category: '반전', text: '이 결과, 데이터를 보면 오히려 반대입니다.' },
  { id: 'tw18', category: '반전', text: '가장 유리해 보였던 조건이 오히려 발목을 잡았습니다.' },
  { id: 'tw19', category: '반전', text: '예상했던 시점보다 훨씬 빨리 벌어졌습니다.' },
  { id: 'tw20', category: '반전', text: '믿었던 전제 자체가 흔들리고 있습니다.' },
  { id: 'tw21', category: '반전', text: '다들 놓친 디테일 하나가 결과를 바꿨습니다.' },
  { id: 'tw22', category: '반전', text: '이 정도일 줄은 아무도 몰랐습니다.' },
  // 연결성(connection)
  { id: 'con01', category: '연결성', text: '다른 사건과 이어지는 지점이 있습니다.' },
  { id: 'con02', category: '연결성', text: '이 흐름은 다른 분야에도 영향을 주고 있습니다.' },
  { id: 'con03', category: '연결성', text: '비슷한 일이 다른 곳에서도 일어나고 있습니다.' },
  { id: 'con04', category: '연결성', text: '이 사안, 전혀 다른 이슈와 맞닿아 있습니다.' },
  { id: 'con05', category: '연결성', text: '지금 이 변화가 다른 결정에도 영향을 주고 있습니다.' },
  { id: 'con06', category: '연결성', text: '따로 보면 몰랐을 연결고리가 있습니다.' },
  { id: 'con07', category: '연결성', text: '이 사건과 이어진 또 다른 흐름이 있습니다.' },
  { id: 'con08', category: '연결성', text: '겉보기엔 무관해 보이지만 실은 연결돼 있습니다.' },
  { id: 'con09', category: '연결성', text: '이 결정, 다른 곳의 판단 기준이 되고 있습니다.' },
  { id: 'con10', category: '연결성', text: '비슷한 패턴이 이미 다른 사례에서도 보였습니다.' },
  { id: 'con11', category: '연결성', text: '이 흐름을 이해하면 다른 이슈도 다르게 보입니다.' },
  { id: 'con12', category: '연결성', text: '다른 분야 사람들도 이 사안을 주시하고 있습니다.' },
  { id: 'con13', category: '연결성', text: '이 이야기는 생각보다 넓게 퍼져 있습니다.' },
  { id: 'con14', category: '연결성', text: '여러 사건이 결국 하나로 이어집니다.' },
  { id: 'con15', category: '연결성', text: '이 변화, 다른 산업에도 신호를 보내고 있습니다.' },
  { id: 'con16', category: '연결성', text: '겹쳐 보면 새로운 그림이 보입니다.' },
  { id: 'con17', category: '연결성', text: '이 결정과 맞닿아 있는 다른 선택들이 있습니다.' },
  { id: 'con18', category: '연결성', text: '이 흐름 하나로 최근 몇 가지 일들이 설명됩니다.' },
];

// 지금은 균등 랜덤(카테고리 구분 없이) — 실클릭 데이터가 쌓이면 카테고리별/문구별 가중치를
// 반영한 선택으로 교체할 수 있도록 이 함수만 바꾸면 되게 분리해뒀다.
function pickCtaPhrase() {
  return CTA_PHRASES[Math.floor(Math.random() * CTA_PHRASES.length)];
}

// ── Hook 기반 Threads 문구 생성 ─────────────────
async function generateHookCopy(topic, url) {
  const draft = topic.ai_context?.draft;
  const keywords = draft?.display_keywords || [];
  const perspectives = draft?.perspective_markers || [];

  const prompt = `너는 뉴스저울의 Threads 카피라이터다. 아래 글을 바탕으로 Threads에 올릴 짧은 문구를 만들어라.
목표: 제목만 봐서는 알 수 없는 "못 본 절반"을 확인하고 싶게 만드는 것 — 본문 내용을 전부 요약하지 마라.

문구 구조(반드시 이 순서, 줄바꿈으로 구분 — 마지막 유도 문장은 별도로 붙이니 여기서 쓰지 마라):
1. 강한 첫 문장(관심을 끄는 질문 또는 핵심 변화)
2. 왜 중요한지
3. 답을 다 말하지 않는 정보 격차(사이트에서 더 읽을 이유, 궁금증은 남기되 거짓·과장 없이)

허용: 강한 대비, 의외성, 질문, 구체적인 숫자·인물·기업·정책명.
금지: 사실과 다른 과장, 본문에 없는 결론 추가, 공포 조장, 무조건적 낚시, "충격"·"소름"·"난리 났다" 같은 저품질 상투어, 링크를 눌러도 답이 없는 문구, 지나치게 긴 글(Threads에서 읽히는 길이 유지).

제목: ${topic.name}
요약: ${topic.summary || ''}
핵심 키워드: ${keywords.join(', ') || '(없음)'}
리드: ${draft?.lead || ''}
엇갈리는 시각: ${perspectives.map((p) => `[${p.perspective}] ${p.claim}`).join(' / ') || '(없음)'}

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "hook_type": "대비 또는 의외성 또는 질문 또는 정보격차 중 하나",
  "text": "Threads에 올릴 실제 문구(1~3번 구조, 줄바꿈 포함, URL/유도문장 제외)"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Hook 카피 파싱 실패: ' + rawText.slice(0, 200));
  const parsed = JSON.parse(match[0]);
  const hookType = ['대비', '의외성', '질문', '정보격차'].includes(parsed.hook_type) ? parsed.hook_type : '정보격차';
  const cta = pickCtaPhrase();
  return { hookType, ctaPhraseId: cta.id, text: `${parsed.text}\n\n${cta.text}\n${url}` };
}

// ── Threads API(텍스트 전용 — 이미지 없어도 정상, 이미지 필드는 애초에 참조하지 않는다) ──────
async function createContainer(text) {
  const params = new URLSearchParams({ media_type: 'TEXT', text, access_token: THREADS_ACCESS_TOKEN });
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('createContainer 실패: ' + JSON.stringify(data));
  return data.id;
}

async function publishPost(containerId) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: THREADS_ACCESS_TOKEN });
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('publishPost 실패: ' + JSON.stringify(data));
  return data.id;
}

// 후보 선정 → Claude 문구 생성 → 게시 → dedup 기록 → 상세 로그, 1건 전체 흐름.
// 이 함수 자체는 실패해도 throw하지 않는다 — 결과를 {ok, reason, ...} 객체로 반환해 호출자(핸들러
// 루프)가 다음 시도를 계속할지 멈출지 판단하게 한다(품질 미달/후보 없음이면 억지로 채우지 않고 중단).
async function attemptOnePost() {
  // 1. 후보 선정(Editorial Score 품질 게이트 + Distribution Score 배급 우선순위) — Claude 호출 전
  const { topic, reason, detail } = await selectCandidate();
  if (!topic) {
    console.log(`DISTRIBUTION_SKIP[${CHANNEL}](${reason}):`, JSON.stringify(detail));
    return { ok: false, skipped: true, reason, detail };
  }
  console.log(`DISTRIBUTION_CANDIDATE_SELECTED[${CHANNEL}]:`, topic.name, JSON.stringify(detail));

  const plan = topic.ai_context?.plan;
  const editors = (plan?.editors_assigned || []).map((e) => e.name);
  const baseUrl = `${BASE_URL}/topic/${topic.slug}`;

  // 2. Claude 문구 생성(여기부터 비용 발생)
  let hookType, hookBody, ctaPhraseId;
  try {
    ({ hookType, text: hookBody, ctaPhraseId } = await generateHookCopy(topic, baseUrl));
  } catch (claudeErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](claude_failed):`, claudeErr.message);
    return { ok: false, reason: 'claude_failed', error: claudeErr.message };
  }
  const url = `${baseUrl}?utm_source=threads&utm_medium=social&utm_campaign=organic_threads&utm_content=${topic.id}_${hookType}`;
  const text = hookBody.replace(baseUrl, url);
  console.log('포스팅 내용:\n', text);

  // 레이스 컨디션 방어 — Claude 호출 사이 다른 실행이 먼저 게시했을 가능성 재확인
  if (!(await isStillUnposted(topic.id))) {
    console.log(`DISTRIBUTION_SKIP[${CHANNEL}](duplicate_topic): 다른 실행이 먼저 게시함`);
    await logSkippedCandidates([{ channel: CHANNEL, topic_id: topic.id, topic_name: topic.name, category: topic.category, reason: 'duplicate', detail: {} }]);
    return { ok: false, skipped: true, reason: 'duplicate_topic', topicId: topic.id };
  }

  // 3. Threads 게시(이미지 필드 전혀 참조하지 않음 — TEXT 전용, 없어도 정상)
  let postId;
  try {
    const containerId = await createContainer(text);
    await new Promise((r) => setTimeout(r, 3000));
    postId = await publishPost(containerId);
  } catch (postErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](threads_api_failed, Claude 비용은 이미 발생):`, postErr.message);
    return { ok: false, reason: 'threads_api_failed', error: postErr.message };
  }

  // 4. 핵심 dedup 기록(실패해도 게시 자체는 이미 성공 — Post ID를 결과에 보존)
  try {
    await markTopicPosted(topic, postId, hookType, detail);
  } catch (dedupErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](dedup_save_failed, 게시는 이미 성공, Post ID 보존):`, postId, dedupErr.message);
    return { ok: false, reason: 'dedup_save_failed', error: dedupErr.message, postId, topicId: topic.id };
  }

  // 5. 상세 로그(best-effort)
  const logResult = await savePostLog({
    topic_id: topic.id, post_id: postId, hook_type: hookType, editors, status: 'success', source_url: url,
    distribution_score: detail.distributionScore, editorial_score: detail.components?.editorialScore,
    cta_phrase_id: ctaPhraseId,
  });

  console.log(`DISTRIBUTION_SUCCESS[${CHANNEL}]:`, postId, '| topic:', topic.slug, '| cta:', ctaPhraseId, '| url:', url);
  return { ok: true, reason: 'success', postId, topicId: topic.id, slug: topic.slug, hookType, ctaPhraseId, editors, title: topic.name, url, text, detailLogSaved: logResult.ok, scoreDetail: detail };
}

// ── Handler ──────────────────────────────────────────────────────
// Background Function(최대 15분 예산) — 파일명이 -background로 끝나면 Netlify가 호출자에게
// 즉시 202를 반환하고 이 핸들러는 백그라운드에서 계속 실행된다(호출자는 반환값을 받지 못한다 —
// 결과는 이 함수의 console.log와 DB 상태로만 확인 가능하다). 1회 실행(hourly)당 최대 3건까지
// 게시 사이 2~5분 간격을 두는 요구사항은 26초 하드캡이 있는 동기 함수로는 구현할 수 없어
// Background Function으로 전환했다(PM 지시 2026-07-22).
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const isDry = event.queryStringParameters?.dry === 'true';

  // 자격증명 확인 — Claude 호출보다 반드시 먼저(비용 보호)
  if (!isDry && (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN)) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](credential_missing)`);
    return { statusCode: 500, headers, body: JSON.stringify({ reason: 'credential_missing', error: 'THREADS_USER_ID 또는 THREADS_ACCESS_TOKEN 환경변수 없음' }) };
  }

  if (isDry) {
    // dry 모드는 미리보기 1건만 — 실제 게시/루프 없음.
    const { topic, reason, detail } = await selectCandidate();
    if (!topic) return { statusCode: 200, headers, body: JSON.stringify({ dry: true, skipped: true, reason, detail }) };
    const baseUrl = `${BASE_URL}/topic/${topic.slug}`;
    const { hookType, text: hookBody } = await generateHookCopy(topic, baseUrl);
    const url = `${baseUrl}?utm_source=threads&utm_medium=social&utm_campaign=organic_threads&utm_content=${topic.id}_${hookType}`;
    const text = hookBody.replace(baseUrl, url);
    return { statusCode: 200, headers, body: JSON.stringify({ dry: true, reason: 'success', topicId: topic.id, hookType, title: topic.name, url, text, scoreDetail: detail }) };
  }

  try {
    // 이번 실행에서 몇 건을 시도할지 미리 계산(운영 로그 가시성 + 루프 조건에 사용)
    const [articleCount, postedStatsNow] = await Promise.all([fetchTodayArticleCount(), fetchTodayPostedStats()]);
    const dailyTarget = computeDailyTarget(articleCount);
    const postsThisRun = computePostsThisRun(dailyTarget, postedStatsNow.total);
    console.log(`DISTRIBUTION_RUN_PLAN[${CHANNEL}]: articles=${articleCount} dailyTarget=${dailyTarget} postedToday=${postedStatsNow.total} postsThisRun=${postsThisRun}`);

    const results = [];
    for (let i = 0; i < postsThisRun; i++) {
      const result = await attemptOnePost();
      results.push(result);
      if (!result.ok) {
        console.log(`DISTRIBUTION_RUN_STOP[${CHANNEL}]: ${i + 1}번째 시도에서 중단(사유: ${result.reason})`);
        break; // 후보 없음/품질 미달/실패 — 억지로 채우지 않고 이번 실행 종료
      }
      if (i < postsThisRun - 1) {
        const gapMs = Math.round(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
        console.log(`DISTRIBUTION_GAP[${CHANNEL}]: 다음 게시까지 ${Math.round(gapMs / 1000)}초 대기`);
        await new Promise((r) => setTimeout(r, gapMs));
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const todaySuccessCount = postedStatsNow.total + successCount;
    console.log(`DISTRIBUTION_RUN_DONE[${CHANNEL}]: 이번 실행 성공 ${successCount}/${results.length}건, 오늘 누적 ${todaySuccessCount}건(목표 ${dailyTarget})`);

    // 시간대별 목표/실적 기록(best-effort) — 하루가 끝난 뒤 Distribution Engine이 제대로
    // 동작했는지 시간대별로 재구성할 수 있게 한다(PM 지시 2026-07-22 §5).
    try {
      const logRes = await fetch(`${SUPABASE_URL}/rest/v1/distribution_run_log`, {
        method: 'POST',
        headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          channel: CHANNEL, today_article_count: articleCount, daily_target: dailyTarget,
          posted_before_run: postedStatsNow.total, posts_attempted: results.length,
          posts_succeeded: successCount, posted_after_run: todaySuccessCount,
        }),
      });
      if (!logRes.ok) console.error(`DISTRIBUTION_RUN_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, await logRes.text());
    } catch (e) {
      console.error(`DISTRIBUTION_RUN_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, e.message);
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dailyTarget, postsAttemptedThisRun: results.length, postsSucceededThisRun: successCount, todaySuccessCount, results }),
    };
  } catch (e) {
    console.error(`DISTRIBUTION_RUN_ERROR[${CHANNEL}]:`, e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ reason: 'unexpected_error', error: e.message }) };
  }
};

// 테스트 전용 — 순수 함수 몇 개를 직접 단위 테스트하기 위해 노출한다(mock fetch/실제 대기 없이
// 공식만 검증). 프로덕션 코드 경로에서는 쓰이지 않는다.
exports._testUtils = { computeDailyTarget, computePostsThisRun, computeAdaptiveMinDistributionScore };
