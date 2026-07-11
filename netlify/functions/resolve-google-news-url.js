// resolve-google-news-url.js — 공유 모듈(자체 handler 없음, collect-news.js/resolve-article-urls.js가 require)
//
// Google 뉴스 RSS가 주는 링크(news.google.com/rss/articles/...)는 원문이 아니라 Google의 리다이렉트
// 인터스티셜 페이지다. 사람이 브라우저로 열면 클라이언트 JS가 실제 언론사 페이지로 이동시키지만,
// 서버에서 fetch()로 직접 열면 Google 뉴스 SPA 페이지 자체가 응답으로 온다 — 원문 URL/이미지/메타데이터를
// 여기서 얻을 수 없다.
//
// 해제 방식(2026-07-11 조사, 검증됨): Google 뉴스 웹앱이 내부적으로 쓰는 비공식 RPC.
// 1) 인터스티셜 페이지 HTML에서 data-n-a-sg(서명)/data-n-a-ts(타임스탬프) 속성을 읽는다.
// 2) news.google.com/_/DotsSplashUi/data/batchexecute 에 rpcid "Fbv4je"로 POST하면
//    응답에 실제 원문 URL이 포함된다.
// 공식 API 아님(Google이 문서화하지 않은 내부 엔드포인트) — 소스: 다수의 공개 리버스엔지니어링
// 구현(gnewsdecoder 등)과 동일 기법이며, 실제 프로덕션 URL 15건 샘플로 100% 성공 확인(2026-07-11).
// 예상 성공률: 인터스티셜 페이지 구조가 유지되는 한 높음(테스트 15/15). Google이 rpcid나
// data-n-a-sg/ts 마크업, 응답 포맷을 바꾸면 이 함수는 조용히 null만 반환하도록 만들어뒀다 —
// 그 경우 원문 링크는 계속 pending으로 남고 사이트는 기존 Google 링크로라도 정상 동작한다(하위 폴백).
// 유지보수 위험: 없어지거나 형식이 바뀌면 이 파일만 고치면 된다(호출부는 null 처리만 하면 되므로 격리됨).

function extractArticleId(googleNewsUrl) {
  return googleNewsUrl.match(/\/rss\/articles\/([^?]+)/)?.[1] || null;
}

async function resolveGoogleNewsUrl(googleNewsUrl, timeoutMs = 6000) {
  const articleId = extractArticleId(googleNewsUrl);
  if (!articleId) return null;

  try {
    const pageRes = await fetch(googleNewsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsjeoulBot/1.0; +https://newsjeoul.co.kr)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return null;

    const payload = ['Fbv4je', JSON.stringify([
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
       'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      articleId, Number(ts), sg,
    ])];
    const body = 'f.req=' + encodeURIComponent(JSON.stringify([[payload]]));
    const rpcUrl = `https://news.google.com/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je&source-path=/rss/articles/${articleId}&f.sid=-1&bl=boq_discoverwebserver_20230101.00_p0&hl=en-US&soc-app=1&soc-platform=1&soc-device=1&_reqid=${Math.floor(Math.random() * 100000)}&rt=c`;

    const rpcRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (compatible; NewsjeoulBot/1.0; +https://newsjeoul.co.kr)',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!rpcRes.ok) return null;
    const text = await rpcRes.text();
    // 응답은 이중으로 JSON-이스케이프된 문자열이라 백슬래시가 리터럴로 포함돼 있다
    const match = text.match(/garturlres\\",\\"(https?:\/\/[^\\"]+)/);
    if (!match) return null;
    return match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
  } catch {
    return null;
  }
}

// 동시성 제한 실행기 — Google에 순간적으로 과도한 요청을 보내지 않기 위함
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = { resolveGoogleNewsUrl, extractArticleId, mapWithConcurrency };
