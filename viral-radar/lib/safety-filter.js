// viral-radar/lib/safety-filter.js
// PRODUCT.md §18 "안전/브랜드 필터" — 자동계정 사고 방지용 최소 방어선.
// 과잉 검열 시스템이 아니다. 메타데이터(제목/캡션)만으로 판단 가능한 명백한 신호만 hard-block한다.
// 애매하면 무조건 NEEDS_REVIEW로 보내고 자동 통과시키지 않는다(false negative보다 false positive가 안전).

const HARD_BLOCK_PATTERNS = [
  /\b(gore|graphic death|dead body|explicit)\b/i,
  /\b(porn|nsfw|onlyfans)\b/i,
  /\b(suicide|self.?harm)\b/i,
  /\b(school shooting|mass shooting)\b/i,
  /(성폭행|성적\s*학대|아동\s*학대)/,
];

// 뉴스 가치 판단이 필요해 사람 검토로 보내는 신호(자동 승인은 안 하지만 완전 차단도 아님)
const REVIEW_PATTERNS = [
  /\b(accidents?|crash(?:es|ing|ed)?|dies?|died|deaths?|fatal)\b/i,
  /\b(fights?|assaults?|attacks?|threatens?|threat)\b/i,
  /(사망|사고|폭행|충돌)/,
];

// 2026-09-09 추가(RESEARCH.md) — TikTok Creative Center "Top Contents"를 실제로 수집해보니
// 상위권 대부분이 명시적 광고/브랜드 협찬 콘텐츠였다(#ad, #PR, 브랜드 태그). 조회수가 진짜라도
// 광고를 "오늘의 바이럴 웃긴/감동 영상"으로 내보내면 브랜드 신뢰도 문제다(§18 "브랜드 필터"의
// 취지 그대로) — 안전 문제는 아니지만 같은 게이트로 걸러서 사람 검토 없인 자동 통과시키지 않는다.
const AD_CONTENT_PATTERNS = [
  /#ad\b/i, /#pr\b/i, /\bsponsored\b/i, /\bpaid partnership\b/i,
  /#\w*partner\b/i, // #samsungpartner, #shopifypartner 등
];

function checkVideo(video) {
  const text = `${video.title || ''} ${video.caption || ''}`;
  for (const p of HARD_BLOCK_PATTERNS) {
    if (p.test(text)) {
      return { status: 'BLOCKED', reason: `hard filter matched: ${p}` };
    }
  }
  for (const p of REVIEW_PATTERNS) {
    if (p.test(text)) {
      return { status: 'NEEDS_REVIEW', reason: `review filter matched: ${p}` };
    }
  }
  for (const p of AD_CONTENT_PATTERNS) {
    if (p.test(text)) {
      return { status: 'NEEDS_REVIEW', reason: `광고/브랜드 협찬 콘텐츠로 추정(${p}) — 유기적 바이럴 아님` };
    }
  }
  return { status: 'OK', reason: null };
}

module.exports = { checkVideo, HARD_BLOCK_PATTERNS, REVIEW_PATTERNS, AD_CONTENT_PATTERNS };
