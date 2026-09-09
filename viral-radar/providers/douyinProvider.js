// viral-radar/providers/douyinProvider.js
//
// 2026-09-09 재실측 2회차(PM 지시로 douyin.com/hot billboard의 "video/music/star" 탭까지
// 공식 tamnd/douyin-cli Windows 바이너리(v0.1.1, GitHub Release, 체크섬 검증됨)로 직접 재확인):
//
//   douyin hot                (realtime 토픽 차트) → 성공. HTTP 200, 진짜 데이터.
//   douyin hot --tab video    (영상 단위 인기 차트) → 실패, 단 "China IP 챌린지"가 아니다.
//     실측: https://www.iesdouyin.com/web/api/v2/hotsearch/aweme/ 를 직접 curl한 결과
//     HTTP 200 + 바디 {"status_code":1,"status_msg":"Url doesn't match"} — 이건 Douyin
//     서버가 "이 엔드포인트 자체가 지금 안 맞다"고 명시적으로 답한 것이다(지역 차단이면
//     보통 challenge 페이지나 다른 status_code가 온다). douyin-cli의 video/music/star 탭
//     구현이 Douyin 쪽 API 변경으로 stale해진 것으로 판단된다(realtime 탭은 다른 경로
//     `/web/api/v2/hotsearch/billboard/word/` 라 영향 없음). **"hot billboard 자체가
//     실패했다"고 뭉뚱그리지 않는다 — realtime 토픽 차트는 여전히 살아있고 정상 작동한다.**
//
// `douyin search`(서명 필요 엔드포인트)는 "No results"를 반환했는데, 이건 ErrWalled(챌린지)
// 타입이 아니라 빈 결과였다 — 지역 차단인지 쿼리 자체 문제인지는 이번 조사로 확정 못 했다.
//
// 결론: **토픽(검색어) 단위 실시간 차트만 키 없이 확실히 동작**한다. 개별 영상 단위
// (canonical_url 포함) Douyin 데이터는 여전히 없다.
//
// ── 왜 이게 VIDEO 후보 풀에 그대로 안 들어가는가 ──────────────────────────────
// PRODUCT.md §11 공통 VIDEO 스키마는 canonical_url(원본 영상 링크)을 필수로 요구한다(§24
// "각 ranking item에는 반드시 platform/creator/original URL을 보존"). Douyin 인기 검색어
// 차트는 원본 링크 없이 "이 키워드가 지금 몇 뷰"만 준다 — 클릭해서 넘어갈 단일 영상이 없다.
// 그래서 이걸 억지로 VIDEO 스키마에 끼워맞추지 않는다(가짜로 canonical_url을 지어내면 §
// "가짜 데이터 금지" 위반). 대신 별도 `collectTrendingTopics()`로 노출해 "오늘 중국에서 뜨는
// 화제"라는 참고 신호로만 쓴다(에디토리얼 판단 보조, 나중에 NYOM 소재 레이더 등으로 재사용 가능).
//
// 개별 영상 단위(canonical_url 포함) Douyin 데이터를 얻으려면: (a) TikHub 같은 유료 공급자
// (사용자의 기존 ViralMint/viralmint-dev 프로젝트가 이미 씀, SOURCE_AUDIT.md 참고), 또는
// (b) `douyin search-videos`(Chrome 로그인 세션 필요, reverse CLI에 있음) 중 하나가 필요하다.

const reverseCli = require('../lib/reverseCli');
const douyinCli = require('../lib/douyinCli'); // 공식 tamnd/douyin-cli 바이너리(1순위 — 지시받은 저장소)

async function collect() {
  // VIDEO 스키마 후보는 여전히 없음 — 위 설명대로 의도된 것이지 실패가 아니다.
  return {
    provider: 'douyin_video',
    videos: [],
    errors: [{ error: 'Douyin 개별 영상 단위 discovery는 아직 키 없이 불가(video/music/star 탭은 Douyin 쪽 "Url doesn\'t match" 응답 — 위 파일 헤더 참고) — collectTrendingTopics()는 별도로 동작함' }],
  };
}

/**
 * Douyin 인기 검색어 차트(키 불필요, 실측 확인됨) — VIDEO 스키마가 아닌 별도 topic 신호.
 * 1순위: 공식 tamnd/douyin-cli 바이너리. 없으면 social-media-research-cli(reverse)로 폴백
 * (둘 다 같은 realtime billboard 계열 엔드포인트를 쓰므로 결과는 사실상 동등하다).
 */
async function collectTrendingTopics() {
  if (douyinCli.isAvailable()) {
    try {
      const items = await douyinCli.run(['hot', '--tab', 'realtime', '-n', '30']);
      const topics = items.map((it) => ({
        word: it.word,
        position: it.rank,
        hot_value: it.hot_value,
        view_count: null, // douyin-cli realtime 탭은 hot_value만 주고 view_count 필드는 없음(social-media-research-cli와의 차이)
        video_count: null,
        search_url: it.url || null,
        captured_at: new Date().toISOString(),
        source: 'tamnd/douyin-cli',
      }));
      return { provider: 'douyin_hot_topics', topics, errors: [] };
    } catch (e) {
      return { provider: 'douyin_hot_topics', topics: [], errors: [{ source: 'tamnd/douyin-cli', error: e.message }] };
    }
  }
  if (!reverseCli.isAvailable()) {
    return { provider: 'douyin_hot_topics', topics: [], errors: [{ error: 'douyin-cli 바이너리도 social-media-research-cli venv도 없음' }] };
  }
  try {
    const data = await reverseCli.run('douyin', 'hot', ['--limit', '30']);
    const topics = (data.items || []).map((it) => ({
      word: it.word,
      position: it.position,
      hot_value: it.hot_value,
      view_count: it.view_count,
      video_count: it.video_count,
      cover_url: it.cover?.url || null,
      captured_at: new Date().toISOString(),
      source: 'ifccod/social-media-research-cli',
    }));
    return { provider: 'douyin_hot_topics', topics, errors: [] };
  } catch (e) {
    return { provider: 'douyin_hot_topics', topics: [], errors: [{ source: 'ifccod/social-media-research-cli', error: e.message }] };
  }
}

module.exports = { collect, collectTrendingTopics };
