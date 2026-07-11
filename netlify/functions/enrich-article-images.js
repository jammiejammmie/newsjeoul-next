// enrich-article-images.js
// 원문 URL이 이미 해제된(url_resolution_status='resolved') 기사 중 og_image_url이 비어있는 것들을 골라
// 원문 페이지의 og:image 메타태그를 가져와 채운다.
// 이미지 자체를 다운로드/재호스팅하지 않고 URL만 저장 — 재가공 없이 "출처 링크 미리보기" 수준으로만 사용.
// collect-news.js와 분리된 별도 함수로 둔 이유: RSS 수집 경로에 원문 페이지 fetch를 얹으면
// 타임아웃 리스크가 커지므로, 실패해도 안전한 배치 백필로 분리했다 (관리자 수동 실행 전용, 스케줄 없음).
//
// 2026-07-11 수정: 예전엔 articles.url이 Google 뉴스 리다이렉트 링크인 채로 이 함수가 그 링크를 직접
// fetch해서 Google 자체 페이지의 og:image(제네릭 아이콘)를 "원문 이미지"로 잘못 저장하는 버그가 있었다.
// 이제 candidates 쿼리 자체가 url_resolution_status='resolved'인 기사만 대상으로 하여 원천 차단하고,
// 혹시라도 해제 안 된 URL이 섞여 들어오는 경우를 위해 fetchOgImage에도 방어 체크를 둔다(resolve_failed).
// 원문 URL 해제는 resolve-article-urls.js(별도 함수)의 책임 — 이 함수는 이미지만 다룬다.
//
// 재시도 정책(2026-07-11 확정): og_image_url이 NULL이면 "아직 판정 안 됨" = 다음 배치에서 다시 시도 대상.
// - 성공: 실제 이미지 URL 저장
// - og:image 태그가 확실히 없음(no_og_image): 빈 문자열('')로 저장해 영구 확정 — 재시도 안 함
// - resolve_failed(방어용, 정상 흐름에선 발생 안 함)/timeout/blocked(403·429·401)/other_error:
//   아무것도 쓰지 않고 NULL 유지 — 일시적 오류이므로 다음 배치가 자동 재시도

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { mapWithConcurrency } = require('./resolve-google-news-url');
const BATCH_SIZE = 25; // 2026-07-11: 순차 처리→동시성 3으로 바꾸면서 15→25로 소폭 상향(1차 단계적 조정)
const CONCURRENCY = 3;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

// count=exact로 Content-Range 헤더만 읽어 전체 건수를 구한다 (row body 불필요 — HEAD로 가볍게)
async function supabaseCount(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'HEAD',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
  });
  if (!res.ok) throw new Error('Supabase COUNT error: ' + res.status);
  const range = res.headers.get('content-range'); // 예: "0-0/123" 또는 "*/123"
  return range ? parseInt(range.split('/')[1], 10) : null;
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error(`Supabase PATCH ${table} 실패:`, await res.text());
}

// 반환값의 reason으로 실패 원인을 구분한다: success / no_og_image / resolve_failed / timeout / blocked / other_error
async function fetchOgImage(url) {
  // 방어 체크 — candidates 쿼리가 url_resolution_status='resolved'만 걸러오므로 정상 흐름에선 안 걸림
  if (url.includes('news.google.com/rss/articles/')) return { reason: 'resolve_failed' };

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsjeoulBot/1.0; +https://newsjeoul.co.kr)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') return { reason: 'timeout' };
    return { reason: 'other_error', detail: e.message };
  }

  if (!res.ok) {
    if ([401, 403, 429].includes(res.status)) return { reason: 'blocked', status: res.status };
    return { reason: 'other_error', detail: `HTTP ${res.status}` };
  }

  // 페이지 전체를 다 받지 않고 <head> 근처만 읽으면 충분 — 응답 스트림 앞부분만 잘라 읽는다
  const html = await res.text();
  const head = html.slice(0, 60000);
  const match =
    head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const src = match?.[1];
  if (!src) return { reason: 'no_og_image' };

  // 상대경로 방어 (드물지만 일부 사이트는 절대경로가 아닐 수 있음)
  try { return { reason: 'success', imageUrl: new URL(src, url).toString() }; }
  catch { return { reason: 'other_error', detail: 'invalid_image_url' }; }
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod) {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const windowFilter = `created_at=gte.${since}`;

    const [totalInWindow, alreadyHasImage, candidates] = await Promise.all([
      supabaseCount('articles', `?${windowFilter}`),
      supabaseCount('articles', `?${windowFilter}&og_image_url=neq.`), // null/빈문자열 둘 다 제외됨(둘 다 neq 비교에서 걸러짐)
      supabaseGet('articles', `?og_image_url=is.null&url_resolution_status=eq.resolved&${windowFilter}&select=id,url&order=created_at.desc&limit=${BATCH_SIZE}`),
    ]);

    const stats = { success: 0, no_og_image: 0, resolve_failed: 0, timeout: 0, blocked: 0, other_error: 0 };
    await mapWithConcurrency(candidates, CONCURRENCY, async (article) => {
      const result = await fetchOgImage(article.url);
      stats[result.reason] = (stats[result.reason] || 0) + 1;
      if (result.reason === 'success') {
        await supabasePatch('articles', `?id=eq.${article.id}`, { og_image_url: result.imageUrl });
      } else if (result.reason === 'no_og_image') {
        // og:image가 확실히 없는 경우만 빈 문자열로 영구 확정 (재시도 안 함)
        await supabasePatch('articles', `?id=eq.${article.id}`, { og_image_url: '' });
      }
      // timeout / blocked / other_error: NULL 유지 → 다음 실행에서 자동 재시도 대상에 그대로 남는다
    });

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true,
        totalInWindow,
        alreadyHasImage,
        targetedThisRun: candidates.length,
        success: stats.success,
        noOgImage: stats.no_og_image,
        resolveFailed: stats.resolve_failed,
        timeout: stats.timeout,
        blocked: stats.blocked,
        otherError: stats.other_error,
      }),
    };
  } catch (e) {
    console.error('enrich-article-images 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
