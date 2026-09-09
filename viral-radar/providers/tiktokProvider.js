// viral-radar/providers/tiktokProvider.js
//
// ── 2026-09-09 지위 강등: 메인 discovery 공급원이 아니라 "보조 Radar"다 ──────────
// 실측 결과(RESEARCH.md) TikTok Creative Center Top Contents는 광고/브랜드 협찬 콘텐츠
// 비중이 압도적이라(오늘 실측 24건 중 12건이 명시적 #ad/#PR/파트너 태그) 순수 유기적
// 바이럴 TOP10 공급원으로 못 쓴다. 그래도 코드는 유지한다 — (a) 편집팀이 "지금 브랜드들이
// TikTok에서 뭘 밀고 있나"를 참고할 보조 신호로 가치 있고, (b) 가끔 섞여 나오는 비-광고
// 콘텐츠(오늘 24건 중 12건)는 여전히 진짜 조회수 데이터라 버릴 이유가 없다. 메인 TOP10
// 파이프라인에서는 "부족하면 정직하게 부족하다고 보고"하는 원본 그대로 쓰고, 향후 TikHub
// 등 검색 기반 유료 공급자가 붙으면 그쪽이 메인이 되고 이건 보조로 남는다.
//
// 2026-09-09 PM 지시로 유료 API 전에 검증된 OSS primitive부터 실측했다(RESEARCH.md 참고).
// 결론: 일반 tiktok.com 검색/해시태그 페이지는 WAF 챌린지로 막힘(이 세션 실측, 키·계정
// 무관하게 막힘). 그러나 TikTok Creative Center의 "Top Contents" 리포트(광고주용 공개
// 마케팅 데이터)는 인증 없이 실제 영상 단위 조회수를 반환한다 — ifccod/social-media-research-cli
// (MIT, lib/reverseCli.js로 감쌈)의 `tiktok creative-trending-videos` 명령으로 실측 확인함.
//
// ── 중요한 한계(정직하게 기록) ────────────────────────────────────────────────
// 1. Creative Center Top Contents는 광고/브랜디드 콘텐츠 비중이 높다(실측: 4건 중 2건이
//    #Ad·브랜드 태그 포함). 순수 유기적 바이럴 영상만은 아니다 — 장르 분류 단계에서 브랜드
//    협찬 여부를 함께 볼 필요가 있다(향후 개선 과제로 남김).
// 1a. "anonymous_preview" 모드라 한 번 호출에 실제로 오는 건수가 적다(최대 ~4건, 요청한
//    limit과 무관) — 여러 country/metric 조합으로 나눠 호출해 후보 풀을 넓힌다(YouTube의
//    다중 검색어 전략과 같은 접근).
// 2. TikHub(paid, api.tikhub.io) 같은 유료 공급자를 쓰면 진짜 검색 기반 discovery가 가능하다
//    (SOURCE_AUDIT.md 참고 — 사용자의 기존 ViralMint 프로젝트가 이미 이 방식을 쓰고 있음).
//    지금은 무료 경로만 쓴다.

const { run, isAvailable } = require('../lib/reverseCli');
const { normalizeVideo } = require('../lib/schema');

// Creative Center가 지원하는 국가 코드를 몇 개 섞어 후보 풀을 넓힌다. 결과 언어가 다양해지므로
// language 필드는 country 코드로 대충 유추만 하고(정확한 언어감지는 분류 단계 몫 아님) null로 둔다.
// 실측 결과 국가별로 Creative Center 인덱스 가용성이 들쭉날쭉하다(예: GB/FR/DE는 이번 주
// "no available index" 에러, KR/BR은 페이지네이션 필드 자체가 없는 응답 — 전부 TikTok 쪽
// 사정이라 우리가 고칠 수 없음). 실제로 성공하는 국가 위주로 구성, 실패하는 국가도 완전히
// 빼진 않는다(다음 주엔 인덱스가 갱신돼 살아날 수 있어 collect.js의 try/catch가 그때그때 흡수).
const COUNTRIES = ['US', 'JP', 'ID', 'GB', 'KR'];
const METRICS = ['views', 'engagement'];

function mapVideo(v) {
  const views = v.metrics?.video_views ?? null;
  return normalizeVideo({
    platform: 'tiktok',
    platform_post_id: v.id,
    canonical_url: v.url,
    creator_name: v.author?.nickname || v.author?.handle || null,
    creator_handle: v.author?.handle || null,
    creator_url: v.author?.handle ? `https://www.tiktok.com/@${v.author.handle}` : null,
    title: (v.title || '').slice(0, 300),
    caption: v.title || null,
    published_at: v.created_at ? new Date(Number(v.created_at) * 1000).toISOString() : null,
    thumbnail_url: v.cover_url || null,
    duration_seconds: null, // Creative Center Top Contents 응답엔 길이 필드가 없음
    view_count: views,
    like_count: null, comment_count: null, share_count: null, // 이 엔드포인트는 이 3개를 안 줌
    provider: 'tiktok_creative_center',
    provider_detected_score: v.metrics?.engagement_rate ?? null, // 후보발굴 참고용일 뿐, 랭킹엔 안 씀
    source_status: 'ok',
  });
}

async function collect() {
  if (!isAvailable()) {
    return {
      provider: 'tiktok_creative_center',
      videos: [],
      errors: [{ error: 'social-media-research-cli venv 미설치 — viral-radar/research/oss-tools/social-media-research-cli README 참고(pip install -e .)' }],
    };
  }
  const videos = [];
  const errors = [];
  for (const country of COUNTRIES) {
    for (const metric of METRICS) {
      try {
        const data = await run('tiktok', 'creative-trending-videos', ['--country', country, '--metric', metric, '--limit', '20']);
        for (const v of data.videos || []) {
          const mapped = mapVideo(v);
          mapped.discovery_query = `creative-center:${country}:${metric}`;
          videos.push(mapped);
        }
      } catch (e) {
        errors.push({ country, metric, error: e.message });
      }
    }
  }
  // 국가/지표를 바꿔도 같은 글로벌 인기 영상이 중복으로 잡히는 경우가 많다 — video_id로 1차 dedupe.
  const byId = new Map();
  for (const v of videos) {
    if (!byId.has(v.video_id) || (v.view_count || 0) > (byId.get(v.video_id).view_count || 0)) byId.set(v.video_id, v);
  }
  const unique = [...byId.values()];
  const AD_RE = /#ad\b|#pr\b|sponsored|paid partnership|#\w*partner\b/i;
  const adCount = unique.filter((v) => AD_RE.test(`${v.title || ''} ${v.caption || ''}`)).length;
  const funnel = {
    raw_collected: videos.length,
    unique_after_dedupe: unique.length,
    ad_or_brand_flagged: adCount, // 최종 안전필터(lib/safety-filter.js)가 다시 한번 걸러내지만 여기서도 미리 집계
    organic_candidates: unique.length - adCount,
  };
  return { provider: 'tiktok_creative_center', videos: unique, errors, funnel };
}

module.exports = { collect };
