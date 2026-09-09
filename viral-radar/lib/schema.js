// viral-radar/lib/schema.js
// 공통 VIDEO 스키마 정규화. 어떤 provider adapter든 이 형태로 맞춰서 반환해야 한다.
// (PRODUCT.md §11 "공통 VIDEO schema" 참고)

/**
 * @typedef {Object} NormalizedVideo
 * @property {string} video_id            - 내부 고유 ID (platform:platform_post_id)
 * @property {string} platform            - 'youtube' | 'tiktok' | 'instagram' | 'x'
 * @property {string} platform_post_id
 * @property {string} canonical_url
 * @property {string|null} creator_name
 * @property {string|null} creator_handle
 * @property {string|null} creator_url
 * @property {string|null} title
 * @property {string|null} caption
 * @property {string|null} published_at        - ISO string, null이면 미상
 * @property {string} first_detected_at         - ISO string, 우리가 처음 포착한 시각
 * @property {string} last_checked_at
 * @property {string|null} thumbnail_url
 * @property {number|null} duration_seconds
 * @property {number|null} view_count
 * @property {number|null} like_count
 * @property {number|null} comment_count
 * @property {number|null} share_count
 * @property {string} provider                 - 이 후보를 발굴한 데이터 공급자 이름
 * @property {number|null} provider_detected_score - 공급자가 매긴 outlier/viral score (참고용, 절대 우리 랭킹에 안 씀)
 * @property {string|null} language
 * @property {string|null} country_if_known
 * @property {string|null} primary_genre
 * @property {string[]} secondary_genres
 * @property {Object|null} genre_scores
 * @property {number|null} genre_confidence
 * @property {string|null} summary_ko
 * @property {string} source_status             - 'ok' | 'removed' | 'error' | 'needs_review'
 */

function makeVideoId(platform, platformPostId) {
  return `${platform}:${platformPostId}`;
}

/**
 * 원시 provider 응답 조각을 공통 스키마로 채워준다. 누락 필드는 null로 명시적으로 남긴다
 * (스키마에 없는 필드를 몰래 흘리지 않기 위해 화이트리스트 방식으로 조립).
 */
function normalizeVideo(raw) {
  const now = new Date().toISOString();
  const platform = raw.platform;
  const platformPostId = String(raw.platform_post_id);
  return {
    video_id: makeVideoId(platform, platformPostId),
    platform,
    platform_post_id: platformPostId,
    canonical_url: raw.canonical_url,
    creator_name: raw.creator_name ?? null,
    creator_handle: raw.creator_handle ?? null,
    creator_url: raw.creator_url ?? null,
    title: raw.title ?? null,
    caption: raw.caption ?? null,
    published_at: raw.published_at ?? null,
    first_detected_at: raw.first_detected_at || now,
    last_checked_at: now,
    thumbnail_url: raw.thumbnail_url ?? null,
    duration_seconds: raw.duration_seconds ?? null,
    view_count: raw.view_count ?? null,
    like_count: raw.like_count ?? null,
    comment_count: raw.comment_count ?? null,
    share_count: raw.share_count ?? null,
    provider: raw.provider,
    provider_detected_score: raw.provider_detected_score ?? null,
    language: raw.language ?? null,
    country_if_known: raw.country_if_known ?? null,
    // 분류 관련 필드는 classify 단계 전까지 비어있다.
    primary_genre: raw.primary_genre ?? null,
    secondary_genres: raw.secondary_genres ?? [],
    genre_scores: raw.genre_scores ?? null,
    genre_confidence: raw.genre_confidence ?? null,
    summary_ko: raw.summary_ko ?? null,
    source_status: raw.source_status || 'ok',
  };
}

/** metrics snapshot 레코드 (PRODUCT.md §11 하단 "그리고 metrics snapshot") */
function makeSnapshot(video, capturedAt) {
  return {
    video_id: video.video_id,
    captured_at: capturedAt || new Date().toISOString(),
    views: video.view_count,
    likes: video.like_count,
    comments: video.comment_count,
    shares: video.share_count,
  };
}

const GENRES = ['FUNNY', 'TOUCHING', 'ANGER', 'SHOCK', 'SATISFYING', 'AMAZING'];

module.exports = { normalizeVideo, makeVideoId, makeSnapshot, GENRES };
