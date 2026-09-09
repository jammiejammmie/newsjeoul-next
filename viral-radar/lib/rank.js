// viral-radar/lib/rank.js
//
// PLATFORM.md 개편(2026-09-09, PM 지시) — 기본 데이터 제품 단위는
//   DATE × PLATFORM × GENRE × RANK
// 이다. TikTok 10M과 Shorts 10M을 한 줄에 세워 절대 순위를 매기지 않는다.
// 플랫폼마다 독립된 Pool 안에서만 "공개 조회수 내림차순"으로 TOP10을 만든다.
//
// PRODUCT.md §19 규칙(Primary Genre Filter → Duplicate Cluster 제거 → Freshness 확인 →
// View Count Descending → TOP10, 억지로 안 채움)을 "플랫폼 내부"에서 그대로 적용한다.
// 플랫폼 간 병합은 이 파일에서 절대 하지 않는다(cross-platform은 lib/cluster.js가 별도 담당,
// 랭킹에 영향 없음 — PLATFORM.md §6 "GLOBAL은 별도 파생상품").

const { clusterVideos } = require('./dedupe');
const { checkVideo } = require('./safety-filter');
const { GENRES } = require('./schema');

function rankOnePlatform(videos, topN) {
  const hasViews = videos.filter((v) => typeof v.view_count === 'number' && v.view_count > 0);
  // 분류 단계에서 이미 needs_review로 표시된 것(정치/문화전쟁/실명공인 등, §18)은 여기서도
  // 조용히 사라지지 않고 별도로 집계한다 — Observability(§33)를 위해 항상 어딘가엔 나타나야 한다.
  const classifiedReview = hasViews.filter((v) => v.source_status === 'needs_review');
  const valid = hasViews.filter((v) => v.source_status === 'ok');

  const safetyChecked = valid.map((v) => ({ v, safety: checkVideo(v) }));
  const blocked = safetyChecked.filter((x) => x.safety.status === 'BLOCKED').map((x) => x.v);
  const needsReview = [
    ...safetyChecked.filter((x) => x.safety.status === 'NEEDS_REVIEW').map((x) => x.v),
    ...classifiedReview,
  ];
  const approved = safetyChecked.filter((x) => x.safety.status === 'OK').map((x) => x.v);

  // Duplicate Cluster 제거는 "이 플랫폼 안에서만" — 예: 같은 영상이 여러 계정에 리업로드된 경우.
  // 다른 플랫폼의 같은 클립과는 여기서 절대 합치지 않는다(그건 lib/cluster.js의 별도 책임).
  const clusters = clusterVideos(approved);
  const deduped = clusters.map((c) => c.representative);

  const genreResults = {};
  for (const genre of GENRES) {
    const inGenre = deduped.filter((v) => v.primary_genre === genre);
    const sorted = [...inGenre].sort((a, b) => {
      if ((b.view_count || 0) !== (a.view_count || 0)) return (b.view_count || 0) - (a.view_count || 0);
      return new Date(a.first_detected_at) - new Date(b.first_detected_at); // tie: 먼저 포착된 쪽 우선
    });
    const top = sorted.slice(0, topN);
    genreResults[genre] = {
      genre,
      candidate_count: inGenre.length,
      filled: top.length,
      target: topN,
      is_full: top.length >= topN,
      items: top.map((v, i) => ({ rank: i + 1, ...v })),
    };
  }

  return {
    genres: genreResults,
    meta: {
      total_candidates_in: videos.length,
      valid_after_freshness_filter: valid.length,
      blocked_count: blocked.length,
      needs_review_count: needsReview.length,
      approved_count: approved.length,
      clusters_count: clusters.length,
      duplicate_variants_removed_within_platform: approved.length - deduped.length,
    },
    needs_review_items: needsReview.map((v) => ({
      video_id: v.video_id, title: v.title, url: v.canonical_url,
      reason: v.editorial_review_reason || 'safety-filter keyword match',
    })),
    blocked_items: blocked.map((v) => ({ video_id: v.video_id, title: v.title, url: v.canonical_url })),
  };
}

/**
 * @param {Array} videos - primary_genre가 채워진 정규화 비디오 배열(여러 플랫폼 섞여 있어도 됨 — 여기서 분리함)
 * @param {Object} opts
 * @param {number} opts.topN - 기본 10
 * @param {string[]} opts.platforms - 랭킹을 만들 플랫폼 목록(기본: 데이터에 실제 등장하는 플랫폼 전부)
 */
function buildDailyRanking(videos, { topN = 10, platforms } = {}) {
  const platformList = platforms || [...new Set(videos.map((v) => v.platform))];
  const result = {};
  for (const platform of platformList) {
    const platformVideos = videos.filter((v) => v.platform === platform);
    result[platform] = rankOnePlatform(platformVideos, topN);
  }
  return { platforms: result };
}

module.exports = { buildDailyRanking, rankOnePlatform };
