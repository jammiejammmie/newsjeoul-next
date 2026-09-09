// viral-radar/lib/outlier.js
//
// 채널(크리에이터) 자체 평소 조회수 대비 이번 영상이 몇 배인가를 계산하는 "아웃라이어 점수".
// RESEARCH.md에서 살펴본 vidIQ 스타일 방법론(사용자의 기존 ViralMint 프로젝트도 같은 개념을
// 씀)을 우리 코드로 새로 작성한 것 — 코드를 그대로 옮기지 않았다(ViralMint는 AGPL-3.0이라
// 그대로 가져오면 이 모듈도 AGPL 적용 대상이 될 수 있음, RESEARCH.md 라이선스 주의 참고).
// 표준 통계(median) 계산 자체는 저작권 대상이 아니다.
//
// PRODUCT.md 철학 재확인: 이 점수는 "후보 발굴 우선순위"에만 쓴다. NEWSJEOUL 공개 TOP10
// 랭킹은 여전히 순수 조회수 내림차순이다(rank.js는 이 모듈을 참조하지 않는다) — outlier_score는
// 후보가 너무 많을 때 어떤 것부터 분류기에 태울지 고르는 용도로만 쓸 것을 의도했다.

function median(nums) {
  const sorted = [...nums].filter((n) => typeof n === 'number' && n > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const TIERS = [
  [20, 'MONSTER'],
  [10, 'BREAKOUT'],
  [5, 'STRONG'],
  [3, 'OUTLIER'],
];

function classify(score) {
  if (!score || score < 3) return null;
  for (const [threshold, label] of TIERS) if (score >= threshold) return label;
  return null;
}

/**
 * @param {number} viewCount - 이 영상의 조회수
 * @param {number[]} creatorRecentViewCounts - 같은 크리에이터의 최근 영상들 조회수(자기 자신 제외 권장)
 * @returns {{score: number|null, label: string|null, baseline: number}}
 */
function computeOutlierScore(viewCount, creatorRecentViewCounts) {
  const baseline = median(creatorRecentViewCounts);
  if (!baseline || !viewCount) return { score: null, label: null, baseline };
  const score = Math.round((viewCount / baseline) * 10) / 10;
  return { score, label: classify(score), baseline };
}

module.exports = { computeOutlierScore, median, classify };
