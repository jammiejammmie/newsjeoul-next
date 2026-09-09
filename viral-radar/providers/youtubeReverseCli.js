// viral-radar/providers/youtubeReverseCli.js
//
// providers/youtubeSearchScrape.js(내 자체 정규식 스크래퍼)의 대안/보강. ifccod/social-media-
// research-cli(MIT, lib/reverseCli.js)의 `youtube search`는 InnerTube 기반이라 더 정확하고
// published_text/duration_text/verified badge까지 준다(2026-09-09 실측 비교 확인).
// 둘 다 살려서 collect.js에서 같이 돌린다 — provider 다양성은 §32(공급자 장애 대비) 취지에도
// 맞고, 서로 다른 검색 결과가 후보 풀을 넓혀준다(dedupe.js가 중복은 알아서 걸러냄).

const { run, isAvailable } = require('../lib/reverseCli');
const { normalizeVideo } = require('../lib/schema');
const { GENRE_QUERIES } = require('./youtubeSearchScrape');

function parseViewsText(text) {
  if (!text) return null;
  const m = String(text).replace(/,/g, '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseDurationText(text) {
  if (!text) return null;
  const parts = String(text).split(':').map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

async function collect({ queriesPerGenre = 2 } = {}) {
  if (!isAvailable()) {
    return { provider: 'youtube_reverse_cli', videos: [], errors: [{ error: 'social-media-research-cli venv 미설치' }] };
  }
  const videos = [];
  const errors = [];
  for (const [genre, queries] of Object.entries(GENRE_QUERIES)) {
    for (const q of queries.slice(0, queriesPerGenre)) {
      try {
        const data = await run('youtube', 'search', [q, '--limit', '10']);
        for (const item of data.items || []) {
          if (item.type !== 'video') continue;
          const durationSec = parseDurationText(item.duration_text);
          const video = normalizeVideo({
            platform: 'youtube_shorts',
            platform_post_id: item.id,
            canonical_url: item.url,
            creator_name: item.channel?.name || null,
            creator_url: item.channel?.url || null,
            title: item.title || null,
            caption: item.description || null,
            thumbnail_url: item.thumbnails?.[item.thumbnails.length - 1]?.url || null,
            duration_seconds: durationSec,
            view_count: parseViewsText(item.views_text),
            like_count: null, comment_count: null, share_count: null,
            provider: 'youtube_reverse_cli',
            provider_detected_score: null,
            source_status: 'ok',
          });
          video.discovery_query = q;
          video.discovery_genre_hint = genre;
          videos.push(video);
        }
      } catch (e) {
        errors.push({ query: q, genre, error: e.message });
      }
    }
  }
  return { provider: 'youtube_reverse_cli', videos, errors };
}

module.exports = { collect };
