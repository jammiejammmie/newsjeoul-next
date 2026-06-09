// collect-news.js
// 20개 언론사 구글 뉴스 RSS 수집 → articles 저장

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseQuery(method, table, body, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'resolution=ignore-duplicates' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table}: ${err}`);
  }
  return method === 'GET' ? res.json() : res;
}

async function fetchGoogleNewsRSS(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const xml = await res.text();
  const items = [];
  const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of matches) {
    const item = match[1];
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '')
      .replace(/<[^>]+>/g, '').replace(/ - [^-]+$/, '').trim(); // 언론사명 제거
    const link = (item.match(/<link>(https?:\/\/[^<]+)<\/link>/)?.[1] || '').trim();
    const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
    const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '').trim();

    // 구글 뉴스 RSS에서 실제 URL 추출
    // <guid> 태그에 실제 기사 URL이 있는 경우
    const guidMatch = item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/);
    const realUrl = guidMatch?.[1] || link;

    if (title && realUrl && title.length > 5) {
      items.push({
        title,
        url: realUrl,
        published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        source_name: source,
      });
    }
    if (items.length >= 15) break;
  }

  return items;
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // 어드민 키 체크
  if (event.httpMethod) {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    console.log('collect-news 시작:', new Date().toISOString());

    // 활성 언론사 가져오기
    const outlets = await supabaseQuery('GET', 'outlets', null, '?is_active=eq.true&select=id,name,google_news_query');
    console.log(`언론사 ${outlets.length}개 로드`);

    let totalSaved = 0;
    const errors = [];

    // 병렬로 RSS 수집 (5개씩 묶어서)
    const chunkSize = 5;
    for (let i = 0; i < outlets.length; i += chunkSize) {
      const chunk = outlets.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (outlet) => {
        try {
          const items = await fetchGoogleNewsRSS(outlet.google_news_query);
          if (!items.length) {
            console.log(`${outlet.name}: 기사 없음`);
            return;
          }

          // outlet_id 추가
          const articles = items.map(item => ({
            ...item,
            outlet_id: outlet.id,
          }));

          // Supabase에 저장 (중복 URL 무시)
          await supabaseQuery('POST', 'articles', articles);
          console.log(`${outlet.name}: ${items.length}개 저장`);
          totalSaved += items.length;
        } catch(e) {
          console.error(`${outlet.name} 오류:`, e.message);
          errors.push({ outlet: outlet.name, error: e.message });
        }
      }));

      // 청크 사이 잠깐 대기 (Rate limit 방지)
      if (i + chunkSize < outlets.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    console.log(`완료: 총 ${totalSaved}개 기사 저장`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        saved: totalSaved,
        errors: errors.length ? errors : undefined,
      }),
    };

  } catch(e) {
    console.error('collect-news 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
