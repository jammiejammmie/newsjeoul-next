// viral-radar/providers/youtubeDataApi.js
// 공식 YouTube Data API v3 adapter. YOUTUBE_API_KEY 환경변수가 있어야 동작한다.
// 조사 결과(SOURCE_AUDIT.md 참고): search.list(order=viewCount, publishedAfter, videoDuration=short)
// 지원 확인됨. 단, search.list 응답엔 조회수가 없어(statistics 미포함) videos.list로 2차 호출 필요.
// 무료 할당량: 10,000 유닛/일. search.list = 100유닛/회 → 하루 최대 100회 검색.
// videos.list = 1유닛/회로 저렴하니 검색 결과 50개를 한 번에 묶어서 보강 호출한다.
//
// 이 파일은 지금 당장 실행되지 않는다(키 없음) — 나중에 YOUTUBE_API_KEY만 채우면
// scripts/collect.js의 provider 목록에 추가해서 바로 쓸 수 있게 인터페이스만 맞춰뒀다.

const { normalizeVideo } = require('../lib/schema');

const API = 'https://www.googleapis.com/youtube/v3';

async function searchViral(apiKey, { query, publishedAfterIso, maxResults = 50 }) {
  const params = new URLSearchParams({
    key: apiKey, part: 'snippet', type: 'video', order: 'viewCount',
    videoDuration: 'short', maxResults: String(maxResults), q: query,
  });
  if (publishedAfterIso) params.set('publishedAfter', publishedAfterIso);
  const res = await fetch(`${API}/search?${params}`);
  if (!res.ok) throw new Error(`youtube search.list HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.items || []).map((it) => it.id.videoId).filter(Boolean);
}

async function fetchStats(apiKey, videoIds) {
  if (!videoIds.length) return [];
  const params = new URLSearchParams({ key: apiKey, part: 'snippet,statistics,contentDetails', id: videoIds.join(',') });
  const res = await fetch(`${API}/videos?${params}`);
  if (!res.ok) throw new Error(`youtube videos.list HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.items || [];
}

function isoDurationToSeconds(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const [, h, mi, s] = m;
  return (Number(h) || 0) * 3600 + (Number(mi) || 0) * 60 + (Number(s) || 0);
}

async function collect({ genreQueries, publishedAfterIso } = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { provider: 'youtube_data_api', videos: [], errors: [{ error: 'YOUTUBE_API_KEY 미설정 — 이 provider는 비활성 상태' }] };
  }
  const nowIso = new Date().toISOString();
  const results = [];
  const errors = [];
  for (const [genre, queries] of Object.entries(genreQueries || {})) {
    for (const q of queries) {
      try {
        const ids = await searchViral(apiKey, { query: q, publishedAfterIso });
        const items = await fetchStats(apiKey, ids);
        for (const it of items) {
          const video = normalizeVideo({
            platform: 'youtube_shorts',
            platform_post_id: it.id,
            canonical_url: `https://www.youtube.com/watch?v=${it.id}`,
            creator_name: it.snippet?.channelTitle || null,
            creator_url: it.snippet?.channelId ? `https://www.youtube.com/channel/${it.snippet.channelId}` : null,
            title: it.snippet?.title || null,
            caption: it.snippet?.description || null,
            published_at: it.snippet?.publishedAt || null,
            thumbnail_url: it.snippet?.thumbnails?.high?.url || it.snippet?.thumbnails?.default?.url || null,
            duration_seconds: isoDurationToSeconds(it.contentDetails?.duration),
            view_count: it.statistics?.viewCount != null ? Number(it.statistics.viewCount) : null,
            like_count: it.statistics?.likeCount != null ? Number(it.statistics.likeCount) : null,
            comment_count: it.statistics?.commentCount != null ? Number(it.statistics.commentCount) : null,
            share_count: null, // YouTube 공식 API는 공유 수를 제공하지 않음
            provider: 'youtube_data_api',
            provider_detected_score: null,
            source_status: 'ok',
            first_detected_at: nowIso,
          });
          video.discovery_query = q;
          video.discovery_genre_hint = genre;
          results.push(video);
        }
      } catch (e) {
        errors.push({ query: q, genre, error: e.message });
      }
    }
  }
  return { provider: 'youtube_data_api', videos: results, errors };
}

module.exports = { collect, isoDurationToSeconds };
