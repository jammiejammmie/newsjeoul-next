// viral-radar/lib/cluster.js
//
// PLATFORM.md §9-10 (2026-09-09 PM 지시) — "GLOBAL CONTENT CLUSTER".
// 같은 근원 클립이 여러 플랫폼에서 동시에 도는 경우, 플랫폼별 TOP10에는 각자의 실적을
// 그대로 남기되(rank.js는 이 파일을 전혀 참조하지 않는다), 내부적으로는 cluster_id로 묶어
// 향후 "플랫폼 간 확산 속도", "최초 발생 플랫폼", "GLOBAL VIRAL INDEX" 같은 파생 콘텐츠에 쓴다.
//
// 이번 MVP는 실제로 여러 플랫폼 실데이터가 없어서(YouTube Shorts만 실가동, §PLATFORM.md 감사
// 보고서 참고) 크로스플랫폼 클러스터가 실제로 발생하지 않는다 — 그래도 여러 플랫폼이 붙는
// 순간 바로 쓸 수 있게 로직만 미리 구현해둔다(§10 "MVP를 지연시키지 마라"에 따라 최소 구현).

const { titlesMatch } = require('./dedupe');
// 최소 겹침 단어 수 요구는 titlesMatch(dedupe.js)에 이미 포함돼 있다(테스트로 실측한 단문
// 제목 오탐 방지) — 여기서 별도 threshold를 다시 정의하지 않고 그대로 재사용한다.

/**
 * 플랫폼 무관하게 전체 비디오를 제목 유사도로 클러스터링한다.
 * @returns {Array<{cluster_id: string, platforms: Object, members: Array}>}
 */
function buildContentClusters(allVideos) {
  const clusters = [];
  for (const v of allVideos) {
    let matched = -1;
    for (let i = 0; i < clusters.length; i++) {
      // 클러스터 안에 이미 같은 플랫폼 대표가 있으면 그것과, 없으면 전체 대표(첫 멤버)와 비교
      const rep = clusters[i].members.find((m) => m.platform === v.platform) || clusters[i].members[0];
      if (titlesMatch(rep.title, v.title)) { matched = i; break; }
    }
    if (matched >= 0) clusters[matched].members.push(v);
    else clusters.push({ members: [v] });
  }

  return clusters
    .filter((c) => new Set(c.members.map((m) => m.platform)).size >= 1)
    .map((c, idx) => {
      const platforms = {};
      for (const m of c.members) {
        if (!platforms[m.platform] || (m.view_count || 0) > (platforms[m.platform].view_count || 0)) {
          platforms[m.platform] = { video_id: m.video_id, view_count: m.view_count, canonical_url: m.canonical_url, published_at: m.published_at };
        }
      }
      const firstSeen = [...c.members].sort((a, b) => new Date(a.published_at || a.first_detected_at) - new Date(b.published_at || b.first_detected_at))[0];
      return {
        cluster_id: `cluster_${idx + 1}`,
        is_cross_platform: Object.keys(platforms).length > 1,
        platform_count: Object.keys(platforms).length,
        platforms,
        first_seen_platform: firstSeen.platform,
        member_count: c.members.length,
      };
    });
}

module.exports = { buildContentClusters };
