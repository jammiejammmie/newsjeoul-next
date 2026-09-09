// viral-radar/providers/youtubeConfirmedShorts.js
//
// 2026-09-09 PM 지시 §5 "YouTube는 아직 성공 판정하지 않는다" 대응 — 이전 provider들
// (youtubeSearchScrape.js, youtubeReverseCli.js)은 길이 제한을 40분까지 관대하게 풀어서
// 사실상 "숏폼이 아닌 5~30분 컴필레이션"을 대량으로 받아들이고 있었다. 이 provider는 그 문제를
// 정면으로 고친다 — **진짜 확인된 Shorts만, 진짜 최근 것만** 받는다.
//
// ── 2단계 파이프라인 (실측으로 찾은 방법) ──────────────────────────────────────
// 1) `youtube search <query> --limit 50` 결과 중 badges에 "Shorts"가 있거나 url이
//    /shorts/ 로 시작하는 항목만 후보 ID로 뽑는다(제목/조회수/게시일은 이 단계에서 비어있음
//    — YouTube 검색 셸프 렌더러의 알려진 파싱 공백, RESEARCH.md 참고).
// 2) 각 후보 ID를 `youtube video <id>` (watch page 파싱)로 개별 조회 — duration_seconds,
//    publish_date(정확한 ISO 타임스탬프!), stats.views가 전부 정확하게 나온다(실측 확인,
//    RESEARCH.md). 여기서 진짜 duration_seconds<=60을 다시 한번 확인한다(뱃지만 믿지 않음).
//
// 이 2단계 때문에 호출 수가 늘지만(검색 1회 + 후보 수만큼 상세조회), 둘 다 키 없이 무료다.

const { run, isAvailable } = require('../lib/reverseCli');
const { normalizeVideo } = require('../lib/schema');
const { GENRE_QUERIES } = require('./youtubeSearchScrape');

const PRIMARY_WINDOW_HOURS = 24;
const FALLBACK_WINDOW_HOURS = 48;
const MAX_SHORT_DURATION_SEC = 60;

function ageHours(publishDateIso, nowMs) {
  const t = new Date(publishDateIso).getTime();
  if (isNaN(t)) return null;
  return (nowMs - t) / 3600000;
}

async function findShortsCandidateIds(query, limit = 50) {
  const data = await run('youtube', 'search', [query, '--limit', String(limit)]);
  const ids = [];
  for (const item of data.items || []) {
    if (item.type !== 'video') continue;
    const isShorts = (item.badges || []).includes('Shorts') || /\/shorts\//.test(item.url || '');
    if (isShorts && item.id) ids.push(item.id);
  }
  return ids;
}

// 2026-09-09 실측(RESEARCH.md): 후보가 ~450개를 넘어가는 배치에서 YouTube가 HTTP 429로
// 막기 시작했다(200개 안팎까지는 안정적이었다). 429는 재시도로 대개 풀리므로 지수 백오프로
// 감싼다 — 그래도 계속 막히면(레이트리밋이 진짜 오래 지속되면) 정직하게 에러로 보고한다.
async function fetchVideoDetail(id, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run('youtube', 'video', [id], 20000);
    } catch (e) {
      const isRateLimited = /HTTP 429/.test(e.message);
      if (isRateLimited && attempt < retries) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

/**
 * @param {Object} opts
 * @param {number} opts.queriesPerGenre
 * @param {number} opts.searchLimit - 검색 1회당 결과 수(Shorts 셸프가 상위에 없으면 늘려야 함)
 */
async function collect({ queriesPerGenre = 3, searchLimit = 50 } = {}) {
  if (!isAvailable()) {
    return { provider: 'youtube_confirmed_shorts', videos: [], errors: [{ error: 'social-media-research-cli venv 미설치' }], funnel: null };
  }

  const nowMs = Date.now();
  const errors = [];
  // genre → Set(candidate video id) — 같은 ID가 여러 검색어에서 나올 수 있어 장르별로 먼저 합친다.
  const idsByGenre = {};
  let rawSearchHits = 0;

  for (const [genre, queries] of Object.entries(GENRE_QUERIES)) {
    idsByGenre[genre] = new Set();
    for (const q of queries.slice(0, queriesPerGenre)) {
      try {
        const ids = await findShortsCandidateIds(q, searchLimit);
        rawSearchHits += ids.length;
        for (const id of ids) idsByGenre[genre].add(id);
      } catch (e) {
        errors.push({ stage: 'search', query: q, genre, error: e.message });
      }
    }
  }

  // 전체 고유 ID(장르 힌트도 같이 보존 — 첫 발견 장르를 힌트로, 최종 장르는 분류 단계에서 다시 정함).
  // 2026-09-09 실측(RESEARCH.md): 상세조회 후보가 ~450개를 넘으면 YouTube가 HTTP 429를 걸기
  // 시작했다 — 장르당 상한(MAX_PER_GENRE)을 둬서 총량을 안전권(<250)으로 유지한다.
  const MAX_PER_GENRE = 40;
  const idToGenreHint = new Map();
  for (const [genre, idSet] of Object.entries(idsByGenre)) {
    for (const id of [...idSet].slice(0, MAX_PER_GENRE)) {
      if (!idToGenreHint.has(id)) idToGenreHint.set(id, genre);
    }
  }

  const collectedIds = [...idToGenreHint.keys()];
  const videos = [];
  let passedShortCheck = 0;
  let passed24h = 0;
  let passed48hOnly = 0;

  // venv마다 python 프로세스를 새로 띄우는 비용이 커서(호출당 ~1초) 순차 처리하면 후보 수백
  // 건에 수 분이 걸린다 — 동시성 풀로 묶어서 처리한다(YouTube에 과도한 동시요청을 보내지
  // 않도록 CONCURRENCY는 보수적으로 잡음).
  // 2026-09-09 실측 이후 CONCURRENCY 6→3, 요청 사이 딜레이 추가 — 그래도 429가 계속 나면
  // fetchVideoDetail의 백오프가 흡수한다.
  const CONCURRENCY = 3;
  let cursor = 0;
  async function worker() {
    while (cursor < collectedIds.length) {
      const id = collectedIds[cursor++];
      await new Promise((r) => setTimeout(r, 200));
      let detail;
      try {
        detail = await fetchVideoDetail(id);
      } catch (e) {
        errors.push({ stage: 'video_detail', id, error: e.message });
        continue;
      }
      const durationSec = detail.duration_seconds;
      const isConfirmedShort = typeof durationSec === 'number' && durationSec > 0 && durationSec <= MAX_SHORT_DURATION_SEC;
      if (!isConfirmedShort) continue; // 뱃지가 있었어도 상세조회에서 60초 초과면 버린다(재검증)
      passedShortCheck++;

      const publishIso = detail.publish_date || detail.upload_date || null;
      const hours = publishIso ? ageHours(publishIso, nowMs) : null;
      const within24h = hours != null && hours <= PRIMARY_WINDOW_HOURS;
      const within48h = hours != null && hours <= FALLBACK_WINDOW_HOURS;
      if (within24h) passed24h++;
      else if (within48h) passed48hOnly++;
      else continue; // 48시간도 넘으면 아예 후보에서 제외 — "오래된 누적 고조회수 영상" 재유입 방지

      const video = normalizeVideo({
        platform: 'youtube_shorts',
        platform_post_id: id,
        canonical_url: `https://www.youtube.com/shorts/${id}`,
        creator_name: detail.author?.name || null,
        creator_url: detail.author?.url || null,
        title: detail.title || null,
        caption: detail.description || null,
        published_at: publishIso,
        thumbnail_url: detail.thumbnail_url || detail.thumbnails?.[detail.thumbnails.length - 1]?.url || null,
        duration_seconds: durationSec,
        view_count: detail.stats?.views ?? null,
        like_count: detail.stats?.likes ?? null,
        comment_count: null, share_count: null,
        provider: 'youtube_confirmed_shorts',
        provider_detected_score: null,
        source_status: 'ok',
      });
      video.discovery_genre_hint = idToGenreHint.get(id);
      video.age_hours = hours == null ? null : Math.round(hours * 10) / 10;
      video.confirmed_short = true;
      video.within_24h = within24h;
      video.within_48h_fallback = !within24h && within48h;
      videos.push(video);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, collectedIds.length) }, worker));

  const funnel = {
    raw_search_hits: rawSearchHits,
    unique_shorts_badged_ids: collectedIds.length,
    passed_duration_confirm: passedShortCheck,
    passed_24h: passed24h,
    passed_48h_fallback_only: passed48hOnly,
    final_candidates: videos.length,
  };

  return { provider: 'youtube_confirmed_shorts', videos, errors, funnel };
}

module.exports = { collect, PRIMARY_WINDOW_HOURS, FALLBACK_WINDOW_HOURS, MAX_SHORT_DURATION_SEC };
