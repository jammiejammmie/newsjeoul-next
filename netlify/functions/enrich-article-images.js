// enrich-article-images.js
// 최근 기사 중 og_image_url이 비어있는 것들을 골라 원문 페이지의 og:image 메타태그를 가져와 채운다.
// 이미지 자체를 다운로드/재호스팅하지 않고 URL만 저장 — 재가공 없이 "출처 링크 미리보기" 수준으로만 사용.
// collect-news.js와 분리된 별도 함수로 둔 이유: RSS 수집 경로에 원문 페이지 fetch를 얹으면
// 타임아웃 리스크가 커지므로, 실패해도 안전한 배치 백필로 분리했다 (관리자 수동 실행 전용, 스케줄 없음).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH_SIZE = 15; // 원문 페이지 fetch는 느릴 수 있어 한 번에 적게 처리

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
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

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsjeoulBot/1.0; +https://newsjeoul.co.kr)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    // 페이지 전체를 다 받지 않고 <head> 근처만 읽으면 충분 — 응답 스트림 앞부분만 잘라 읽는다
    const html = await res.text();
    const head = html.slice(0, 60000);
    const match =
      head.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const src = match?.[1];
    if (!src) return null;
    // 상대경로 방어 (드물지만 일부 사이트는 절대경로가 아닐 수 있음)
    try { return new URL(src, url).toString(); } catch { return null; }
  } catch (e) {
    return null;
  }
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
    const candidates = await supabaseGet(
      'articles',
      `?og_image_url=is.null&created_at=gte.${since}&select=id,url&order=created_at.desc&limit=${BATCH_SIZE}`
    );

    if (!candidates.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, checked: 0, found: 0 }) };
    }

    let found = 0;
    for (const article of candidates) {
      const ogImage = await fetchOgImage(article.url);
      // 못 찾아도 og_image_url='' 로 표시해 다음 배치에서 같은 기사를 계속 재시도하지 않게 한다
      await supabasePatch('articles', `?id=eq.${article.id}`, { og_image_url: ogImage || '' });
      if (ogImage) found++;
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, checked: candidates.length, found }),
    };
  } catch (e) {
    console.error('enrich-article-images 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
