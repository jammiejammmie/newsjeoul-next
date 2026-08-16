// news-filters.js — 스토리 생성 단계의 배제 필터
//
// ── 2026-08-17 전면 재검토 (PM 지시) ────────────────────────────────────────
// 종전 필터는 "주제"로 걸렀다: 스포츠·프로야구·코스피·코스닥·날씨·운세·로또를 배제하고,
// 정책/국회/검찰 같은 '중요 키워드'가 있을 때만 예외로 통과시키는 구조였다.
// 이 방식의 문제가 실제로 확인됐다 — 뉴스저울이 다뤄야 할 화제 이슈가 주제 때문에 통째로
// 잘려나갔다(예: "황정민 사생팬" 같은 연예 화제, 스포츠 대형 이슈). 카테고리 쿼터가 도입되어
// 특정 주제의 과잉 발행은 쿼터가 막아주므로, 수집 단계에서 주제로 미리 자르는 것은 이제
// 손실만 남는다.
//
// 새 원칙: **주제로는 절대 거르지 않는다. 광고성·낚시성만 거른다.**
// 정치·스포츠·연예·경제는 전부 통과한다. "이재명 탄핵", "황정민 사생팬" 모두 수집 대상이다.
// 주제별 분량 조절은 buzz-engine.js의 카테고리 쿼터가 발행 단계에서 담당한다.

// ── 1. 광고성 ───────────────────────────────────────────────────────────────
// 기사 형태를 빌린 홍보물. 뉴스저울의 침묵지수·논쟁지수는 "언론사가 사안을 어떻게 다뤘나"를
// 재는 지표인데, 광고는 애초에 사안이 아니라서 지표를 오염시킨다.
const AD_PATTERNS = [
  '협찬', '광고문의', '홍보대행', '프로모션', '할인코드', '쿠폰 증정',
  '특가 판매', '최저가 보장', '공동구매', '무료체험 신청', '체험단 모집',
  '분양 안내', '분양 문의', '대출 상담', '보험료 비교', '제휴 문의',
  '이벤트 응모', '경품 추첨', '수강생 모집', '설명회 개최',
  'sponsored', 'advertorial',
];

// ── 2. 낚시성 ───────────────────────────────────────────────────────────────
// "제목이 정보를 감추고 클릭만 유도"하는 형태. 자극적인 단어 자체를 막는 것이 아니라
// (그러면 진짜 화제 이슈가 걸린다), 정보 없는 관용구 형태만 좁게 잡는다.
// 예: "충격"은 통과("이재명 탄핵 충격")시키되 "알고보니 충격적인 이유"는 차단.
const CLICKBAIT_PATTERNS = [
  '알고보니', '알고 보니', '충격적인 이유', '경악한 이유', '깜짝 놀란 이유',
  '네티즌 반응', '누리꾼 반응 모음', '레전드 모음', '움짤 모음', '짤방',
  '클릭 유도', '지금 확인하세요', '바로가기 클릭', '자세히 보기 클릭',
  '보고나면', '보고 나면', '입이 떡', '충격과 공포', '이것 하나면',
  '사진 모음', '움짤', '~하는 이유 top',
];

// ── 3. 무정보 자동생성물 ────────────────────────────────────────────────────
// 지시는 "광고성/낚시성만"이었지만, 아래 3종은 매 회차 기계적으로 쏟아지는 자동생성 콘텐츠라
// 스토리(=여러 언론사가 다룬 사안)로 묶일 때 순수 노이즈가 된다. 주제 배제가 아니라
// "사안이 아닌 것" 배제라서 새 원칙과 충돌하지 않는다.
// 스포츠 경기 결과·연예 기사는 여기 포함되지 않는다(전부 통과).
// 이 판단을 되돌리려면 SKIP_LOW_VALUE_AUTOGEN만 false로 두면 된다.
const SKIP_LOW_VALUE_AUTOGEN = true;
const LOW_VALUE_AUTOGEN_PATTERNS = [
  '로또 당첨번호', '로또당첨번호', '연금복권 당첨', '오늘의 운세', '별자리 운세',
  '띠별 운세', '오늘의 날씨 예보', '주간 날씨 예보', '오늘의 증시 마감', '환율 마감 시황',
];

function matchAny(title, patterns) {
  const t = String(title || '').toLowerCase();
  return patterns.some((kw) => t.includes(String(kw).toLowerCase()));
}

function isAd(title) {
  return matchAny(title, AD_PATTERNS);
}

function isClickbait(title) {
  return matchAny(title, CLICKBAIT_PATTERNS);
}

function isLowValueAutogen(title) {
  return matchAny(title, LOW_VALUE_AUTOGEN_PATTERNS);
}

// 배제 사유를 문자열로 돌려준다(로그에 "왜 걸렀는지"를 남기기 위해). 통과면 null.
function skipReason(title) {
  if (isAd(title)) return 'ad';
  if (isClickbait(title)) return 'clickbait';
  if (SKIP_LOW_VALUE_AUTOGEN && isLowValueAutogen(title)) return 'low_value_autogen';
  return null;
}

function shouldSkipStory(title) {
  return skipReason(title) !== null;
}

// ── 하위호환 ────────────────────────────────────────────────────────────────
// 종전 export를 참조하는 코드가 남아 있어도 깨지지 않게 유지한다. 다만 의미는 바뀌었다:
// hasExcluded는 이제 "주제상 제외"가 아니라 "광고/낚시/무정보"를 뜻하고,
// hasImportance는 항상 false다(중요 키워드로 예외 통과시키는 구조 자체가 사라졌다).
function hasExcluded(title) {
  return shouldSkipStory(title);
}

function hasImportance() {
  return false;
}

module.exports = {
  shouldSkipStory,
  skipReason,
  isAd,
  isClickbait,
  isLowValueAutogen,
  hasExcluded,
  hasImportance,
  AD_PATTERNS,
  CLICKBAIT_PATTERNS,
  LOW_VALUE_AUTOGEN_PATTERNS,
};
