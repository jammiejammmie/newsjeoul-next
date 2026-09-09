// viral-radar/providers/youtubeSearchScrape.js
//
// ── 이게 왜 있는가 ───────────────────────────────────────────────────────────
// 공식 YouTube Data API v3(providers/youtubeDataApi.js)는 API 키가 필요하다(현재 미보유).
// 이 adapter는 키 없이 오늘 당장 실 데이터를 확보하기 위한 것 — YouTube 검색결과 페이지
// (youtube.com/results)에 내장된 ytInitialData JSON을 파싱한다. yt-dlp 등 널리 쓰이는
// 오픈소스 도구도 같은 방식을 쓴다. 공개 웹페이지를 읽는 것뿐이며 로그인/우회 없음.
//
// ── 이게 우리 철학에 맞는 이유 ────────────────────────────────────────────────
// 우리는 "무엇이 바이럴이 될지" 예측하지 않는다. 여기서도 마찬가지 — 어떤 영상이 뜰지
// 우리가 점수 매기지 않고, YouTube 자체의 검색 관련도 알고리즘이 이미 순위를 매긴 결과를
// 그대로 후보 풀로 가져올 뿐이다(discovery는 외부에 위임, 우리는 장르 태깅된 검색어로
// 후보를 넓게 모으고 → 집계 → 분류 → 조회수 재정렬만 한다).
//
// ── 알려진 한계 (감사보고서에 정직하게 기록할 것) ───────────────────────────────
// - 비공식 방식이라 YouTube가 페이지 구조를 바꾸면 파서가 깨질 수 있다(fragile).
// - "오늘 업로드된 영상"이 아니라 "검색 관련도 상위 영상"이다 — 업로드일이 아니라
//   "오늘 우리가 포착했다"는 의미의 first_detected_at 기준으로만 오늘자다(PRODUCT.md §3 참고,
//   이게 바로 명시적으로 허용된 정의다).
// - 상업적 대량 스크래핑은 YouTube ToS와 충돌할 수 있다 — 이 adapter는 저빈도(하루 수십 회
//   검색) POC 용도로만 쓰고, 프로덕션 규모로 갈 때는 공식 Data API(youtubeDataApi.js)로
//   교체하는 것을 전제로 한다.

const { normalizeVideo } = require('../lib/schema');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 장르별 검색어 — 여러 개를 섞어 후보 풀을 넓힌다. 한국어 자막을 씌우더라도 소재 자체는
// 국가 무관 글로벌 바이럴을 지향하므로 영어 검색어 위주(글로벌 커버리지 확보).
const GENRE_QUERIES = {
  FUNNY: ['funny fails caught on camera', 'hilarious moment caught on camera', 'funny animal moments 2026', 'try not to laugh funny videos'],
  TOUCHING: ['heartwarming moment caught on camera', 'emotional reunion surprise', 'kind stranger act of kindness caught on camera', 'faith in humanity restored'],
  ANGER: ['entitled customer caught on camera', 'public outrage confronted', 'karen caught on camera 2026', 'people getting owned'],
  SHOCK: ['shocking moment caught on camera', 'unbelievable moment caught on camera', 'wtf moment caught on camera', 'craziest moments caught on camera'],
  SATISFYING: ['instant karma caught on camera', 'satisfying justice moment', 'oddly satisfying video', 'instant karma 2026'],
  AMAZING: ['amazing talent caught on camera', 'incredible skill moment', 'mind blowing moment caught on camera', 'insane talent video'],
};

/** ytInitialData = {...}; 를 문자열에서 안전하게 뽑아낸다(중첩 괄호를 regex 대신 직접 카운팅). */
function extractJsonAfter(html, marker) {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const braceStart = html.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = braceStart; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) { esc = false; }
      else if (c === '\\') { esc = true; }
      else if (c === '"') { inStr = false; }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const jsonStr = html.slice(braceStart, i + 1);
        try { return JSON.parse(jsonStr); } catch { return null; }
      }
    }
  }
  return null;
}

/** "조회수 755,409,109회" / "1.2M views" / "조회수 123회" 등을 정수로 변환 */
function parseViewCount(text) {
  if (!text) return null;
  const cleaned = text.replace(/조회수|views?|회/gi, '').trim();
  const m = cleaned.match(/([\d,.]+)\s*([KMB]?)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (isNaN(n)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, '': 1 }[m[2].toUpperCase()] || 1;
  return Math.round(n * mult);
}

/** "0:45" / "1:02:03" → 초 */
function parseDuration(text) {
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((p) => isNaN(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** 객체 트리를 순회하며 videoRenderer 노드를 전부 수집 (중복 videoId는 첫 번째만) */
function findVideoRenderers(node, out, seen) {
  if (!node || typeof node !== 'object') return;
  if (node.videoRenderer && node.videoRenderer.videoId && !seen.has(node.videoRenderer.videoId)) {
    seen.add(node.videoRenderer.videoId);
    out.push(node.videoRenderer);
  }
  for (const key in node) {
    const v = node[key];
    if (v && typeof v === 'object') findVideoRenderers(v, out, seen);
  }
}

// ── 알려진 한계(정직하게 기록) ────────────────────────────────────────────────
// /results 검색 페이지는 실제 60초 이하 Shorts를 안정적으로 노출하지 않는다(실측 확인,
// 2026-09-09: "funny fails shorts" 등 다양한 검색어로도 결과 대부분이 5~30분짜리 컴필레이션
// 영상이었다 — YouTube의 진짜 Shorts 셸프는 별도 reelItemRenderer로 렌더링되는데 이는 로그인
// 세션/모바일 클라이언트 컨텍스트에서만 채워지는 것으로 보이며, 이번 세션에서는 재현하지
// 못했다). 그래서 이 provider는 엄격한 "60초 이하"를 강제하지 않고, 장르 검색어로 발견된
// 실제 바이럴 영상(주로 컴필레이션)을 후보로 받아들이되 duration_seconds를 스키마에 그대로
// 남겨 다운스트림(랭킹/카드 렌더)에서 진짜 shorts와 롱폼을 구분할 수 있게 한다.
// 진짜 shorts만 필요해지면 공식 YouTube Data API(videoDuration=short)로 즉시 교체 가능
// (providers/youtubeDataApi.js, YOUTUBE_API_KEY만 있으면 바로 정확해진다).
const MAX_DURATION_SEC = 40 * 60; // 40분 초과는 명백히 다른 장르(브이로그/강의 등)일 가능성이 높아 컷

function isShortsCandidate(renderer, durationSec) {
  const overlays = renderer.thumbnailOverlays || [];
  const hasShortsBadge = overlays.some((o) =>
    o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS'
  );
  if (hasShortsBadge) return true;
  if (durationSec == null) return false; // 길이 정보 자체가 없는 라이브/프리미어 등은 제외
  return durationSec <= MAX_DURATION_SEC;
}

async function fetchSearch(query, retries = 2) {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!res.ok) throw new Error(`YouTube search HTTP ${res.status} (query="${query}")`);
      const html = await res.text();
      const data = extractJsonAfter(html, 'var ytInitialData');
      if (!data) throw new Error(`ytInitialData 파싱 실패 (query="${query}") — 페이지 구조가 바뀌었을 수 있음`);
      const renderers = [];
      findVideoRenderers(data, renderers, new Set());
      return renderers;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); // 지수적 backoff
    }
  }
  throw lastErr;
}

/**
 * @param {string[]} genres - 수집할 장르 목록(기본 전체)
 * @param {number} queriesPerGenre - 장르당 검색어 수(기본 전체, 줄이면 호출 수 감소)
 */
async function collect({ genres = Object.keys(GENRE_QUERIES), queriesPerGenre = 4 } = {}) {
  const nowIso = new Date().toISOString();
  const results = [];
  const errors = [];

  for (const genre of genres) {
    const queries = (GENRE_QUERIES[genre] || []).slice(0, queriesPerGenre);
    for (const q of queries) {
      try {
        const renderers = await fetchSearch(q);
        let kept = 0;
        for (const r of renderers) {
          const durationSec = parseDuration(r.lengthText?.simpleText);
          if (!isShortsCandidate(r, durationSec)) continue;
          const viewCount = parseViewCount(r.viewCountText?.simpleText || r.shortViewCountText?.simpleText);
          const thumbs = r.thumbnail?.thumbnails || [];
          const video = normalizeVideo({
            platform: 'youtube_shorts', // PLATFORM.md 개편(2026-09-09): 플랫폼별 랭킹이 원본 단위 — 'youtube'가 아니라 'youtube_shorts'로 명시
            platform_post_id: r.videoId,
            canonical_url: `https://www.youtube.com/watch?v=${r.videoId}`,
            creator_name: r.ownerText?.runs?.[0]?.text || r.longBylineText?.runs?.[0]?.text || null,
            creator_handle: null,
            creator_url: r.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl
              ? `https://www.youtube.com${r.ownerText.runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl}`
              : null,
            title: r.title?.runs?.map((x) => x.text).join('') || null,
            caption: r.descriptionSnippet?.runs?.map((x) => x.text).join('') || null,
            published_at: null, // 검색결과는 상대시간 텍스트(publishedTimeText)만 준다 — 절대시각 미상으로 둔다
            thumbnail_url: thumbs[thumbs.length - 1]?.url || null,
            duration_seconds: durationSec,
            view_count: viewCount,
            like_count: null,
            comment_count: null,
            share_count: null,
            provider: 'youtube_search_scrape',
            provider_detected_score: null, // 이 provider는 자체 스코어를 안 준다 — YouTube 검색 관련도 순서만 있음
            language: null,
            country_if_known: null,
            source_status: 'ok',
            first_detected_at: nowIso,
          });
          video.discovery_query = q;
          video.discovery_genre_hint = genre; // 검색어 유래 힌트일 뿐, 최종 분류는 classify 단계에서 다시 함
          const overlays = r.thumbnailOverlays || [];
          video.is_short_form = overlays.some((o) => o.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS')
            || (durationSec != null && durationSec <= 60);
          results.push(video);
          kept++;
        }
        console.log(`[youtubeSearchScrape] "${q}" → ${renderers.length}건 중 shorts후보 ${kept}건`);
      } catch (e) {
        console.error(`[youtubeSearchScrape] 실패: "${q}" — ${e.message}`);
        errors.push({ query: q, genre, error: e.message });
      }
      // 과도한 연속 요청 방지(예의상 딜레이)
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  // 동일 videoId가 여러 검색어에서 중복 발견될 수 있음 — 여기서 1차 제거(같은 provider 내부 중복)
  const byId = new Map();
  for (const v of results) {
    if (!byId.has(v.video_id) || (v.view_count || 0) > (byId.get(v.video_id).view_count || 0)) {
      byId.set(v.video_id, v);
    }
  }

  return { provider: 'youtube_search_scrape', videos: [...byId.values()], errors };
}

module.exports = { collect, parseViewCount, parseDuration, GENRE_QUERIES };
