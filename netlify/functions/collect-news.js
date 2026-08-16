// collect-news.js
// 축 2개로 수집한다 → articles 저장
//   (1) 언론사축: 활성 언론사 29곳의 구글뉴스 RSS 검색 (침묵지수/논쟁지수의 근거 — 절대 축소 금지)
//   (2) 화제성축: 구글뉴스 Top Stories + 섹션 RSS 7종 + 구글 트렌드 KR (2026-08-17 신설)
//
// ── 왜 (1)을 (2)로 대체하지 않는가 ──────────────────────────────────────────
// process-stories의 calcSilenceScore는 "활성 언론사 29곳 중 몇 곳이 이 사안을 안 다뤘나"를
// 재는 지표라 전수 스캔이 전제다. 화제성 상위만 골라 수집하면 분모가 무너져 침묵지수·논쟁지수가
// 통째로 무의미해진다. 역설적이지만 "화제인데 아무도 안 다룬 것"을 찾으려면 화제 아닌 것까지
// 다 봐야 한다. 그래서 화제성은 수집을 줄이는 필터가 아니라 처리 우선순위 신호로만 쓴다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { resolveGoogleNewsUrl, mapWithConcurrency } = require('./resolve-google-news-url');
const { fetchBuzzIndex, BUZZ_FEEDS } = require('./buzz-engine');

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
    let title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '')
      .replace(/<[^>]+>/g, '').trim();

    // 언론사명 제거 패턴들
    // "제목 - 언론사명", "제목 - 언론사명 뉴스" 등
    title = title
      .replace(/ - [가-힣a-zA-Z\s]+뉴스$/, '')
      .replace(/ - [가-힣a-zA-Z\s]+(일보|신문|방송|TV|미디어|타임즈|타임스|투데이|위크|닷컴)$/, '')
      .replace(/ - (오마이뉴스|연합뉴스|뉴스타파|프레시안|YTN|MBC|KBS|SBS|JTBC|채널A|TV조선|네이트|daum|naver|v\.daum\.net).*$/, '')
      .replace(/ - [^\-]{2,15}$/, '') // 일반적인 "- 언론사" 패턴
      .trim();
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

// ── 화제성축 헬퍼 ───────────────────────────────────────────────────────────
// 화제성 피드에서 나온 기사는 출처가 임의의 언론사다(대전일보, Daum 등). 그런데 articles는
// outlets FK를 물고 있고, 새 언론사를 outlets에 넣으면 is_active 개수가 늘어 침묵지수의 분모가
// 오염된다. 그래서 **기존 29곳으로 식별되는 기사만 저장**하고, 나머지는 저장하지 않는다.
// 저장하지 않아도 손해가 없다 — 화제성 신호(buzz)는 저장이 아니라 피드 자체에서 계산하기 때문이다.
// 이 축의 실질 이득은 "29곳이 쓴 기사인데 언론사축 15건 캡에 최신순으로 잘려나간 화제 기사"의 회수다.
function normalizeOutletName(name) {
  return String(name || '').toLowerCase().replace(/[\s.·]/g, '');
}

// 화제성 피드의 출처 표기는 세 가지 형태로 섞여 온다(2026-08-17 실측 272건 기준):
//   ① 한글 매체명 "동아일보"  ② 도메인 "hankyung.com"  ③ 자매지 "스포츠경향", "sports.donga.com"
// 이름 비교만으로는 ②③이 전부 미식별로 빠져 매칭률이 32%에 그쳤다. 도메인 표를 함께 둔다.
// 자매지는 발행 주체가 같은 언론사이므로 모지(母紙)로 귀속시키는 것이 사실에 맞다.
const DOMAIN_TO_OUTLET = {
  'chosun.com': '조선일보', 'tvchosun.com': 'TV조선',
  'joongang.co.kr': '중앙일보', 'joins.com': '중앙일보', 'jtbc.co.kr': 'JTBC',
  'donga.com': '동아일보', 'sports.donga.com': '동아일보', 'ichannela.com': '채널A',
  'hani.co.kr': '한겨레', 'khan.co.kr': '경향신문', 'seoul.co.kr': '서울신문',
  'hankookilbo.com': '한국일보', 'hankyung.com': '한국경제', 'mk.co.kr': '매일경제',
  'yna.co.kr': '연합뉴스', 'ytn.co.kr': 'YTN', 'kbs.co.kr': 'KBS',
  'imbc.com': 'MBC', 'mbc.co.kr': 'MBC', 'sbs.co.kr': 'SBS',
  'ohmynews.com': '오마이뉴스', 'pressian.com': '프레시안', 'newstapa.org': '뉴스타파',
  'etnews.com': '전자신문', 'zdnet.co.kr': '지디넷코리아', 'bloter.net': '블로터',
  'ddaily.co.kr': '디지털데일리', 'motorgraph.com': '모터그래프', 'autoview.co.kr': '오토뷰',
  'consumertimes.co.kr': '컨슈머타임스', 'consumernews.co.kr': '소비자가만드는신문',
  'korea.kr': '정책브리핑',
};

// 한글 자매지 표기 → 모지
const BRAND_ALIASES = {
  '스포츠경향': '경향신문', '스포츠동아': '동아일보', '한경비즈니스': '한국경제',
  '매경이코노미': '매일경제', 'jtbc뉴스': 'JTBC', 'sbs뉴스': 'SBS', 'kbs뉴스': 'KBS',
  'mbc뉴스': 'MBC', '연합뉴스tv': '연합뉴스', 'ytn사이언스': 'YTN',
};

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function buildOutletMatcher(outlets) {
  const byName = new Map();
  for (const o of outlets) {
    byName.set(normalizeOutletName(o.name), o);
    if (o.google_news_query) byName.set(normalizeOutletName(o.google_news_query), o);
  }
  const entries = outlets.map((o) => ({
    outlet: o,
    keys: [normalizeOutletName(o.name), normalizeOutletName(o.google_news_query)].filter(Boolean),
  }));

  return function matchOutlet(sourceName, url) {
    const s = normalizeOutletName(sourceName);

    // ① 자매지 별칭
    if (s && BRAND_ALIASES[s]) {
      const hit = byName.get(normalizeOutletName(BRAND_ALIASES[s]));
      if (hit) return hit;
    }

    // ② 도메인 — source_name이 도메인 형태이거나, 기사 URL 호스트로 판별.
    // 주의: normalizeOutletName은 점을 지우므로("hankyung.com"→"hankyungcom") 도메인 판별에는
    // 절대 쓰면 안 된다. 원문 문자열을 그대로 본다(2026-08-17 실측에서 13건이 이 이유로 누락됐다).
    const rawSource = String(sourceName || '').trim().toLowerCase().replace(/^www\./, '');
    const hosts = [rawSource.includes('.') ? rawSource : '', hostOf(url)].filter(Boolean);
    for (const h of hosts) {
      for (const [domain, outletName] of Object.entries(DOMAIN_TO_OUTLET)) {
        if (h === domain || h.endsWith('.' + domain)) {
          const hit = byName.get(normalizeOutletName(outletName));
          if (hit) return hit;
        }
      }
    }

    // ③ 매체명 — "MBC뉴스"→"MBC", "매일경제 마켓"→"매일경제" 처럼 접두 일치까지 허용
    if (s) {
      for (const e of entries) {
        for (const k of e.keys) {
          if (!k) continue;
          if (s === k || s.startsWith(k) || k.startsWith(s)) return e.outlet;
        }
      }
    }
    return null;
  };
}

// 인덱스(Top/섹션/트렌드)를 하나의 후보 목록으로 펼친다. url 기준 중복 제거.
function flattenBuzzCandidates(index) {
  const seen = new Set();
  const out = [];
  const push = (item, origin, resolved) => {
    if (!item || !item.url || !item.title) return;
    if (seen.has(item.url)) return;
    seen.add(item.url);
    out.push({ ...item, buzz_origin: origin, already_canonical: Boolean(resolved) });
  };

  (index.top || []).forEach((i) => push(i, 'TOP', false));
  for (const [key, items] of Object.entries(index.sections || {})) {
    (items || []).forEach((i) => push(i, key, false));
  }
  // 트렌드가 물고 온 기사 URL은 구글 리다이렉트가 아니라 원문 URL이다(v.daum.net, ytn.co.kr 등).
  // URL 해제 단계를 건너뛸 수 있어 오히려 품질이 좋다.
  for (const t of index.trends || []) {
    for (const n of t.news_items || []) {
      push({ ...n, published_at: new Date().toISOString() }, 'TRENDS', true);
    }
  }
  return out;
}

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // 어드민 키 체크
  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
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

          // outlet_id 추가 — url은 일단 Google 뉴스 링크로 저장(기존 동작과 동일), source_url에도
          // 같은 값을 보존해두고 원문 URL 해제는 아래 별도 단계에서 시도한다.
          const articles = items.map(item => ({
            ...item,
            outlet_id: outlet.id,
            source_url: item.url,
            url_resolution_status: 'pending',
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

    console.log(`언론사축 완료: 총 ${totalSaved}개 기사 저장`);

    // ── 화제성축 수집 (2026-08-17 신설) ─────────────────────────────────────
    // 9개 피드를 전부 병렬로 친다(실측 1.2초). 이 함수는 Background Function이 아니라 26초
    // 하드캡이 걸린 동기 함수라 순차 호출은 금지 — 2026-07-14 타임아웃 사고와 같은 구조다.
    // 전부 실패해도 위 언론사축 결과(totalSaved)는 이미 저장 완료라 영향이 없다.
    let buzzSaved = 0, buzzUnmatched = 0, buzzCandidates = 0;
    let buzzStats = null;
    const buzzByOrigin = {};
    try {
      const index = await fetchBuzzIndex({ perFeedLimit: 40, timeoutMs: 7000 });
      buzzStats = index.stats;

      const matchOutlet = buildOutletMatcher(outlets);
      const candidates = flattenBuzzCandidates(index);
      buzzCandidates = candidates.length;

      const rows = [];
      const seenUrls = new Set();
      for (const c of candidates) {
        const outlet = matchOutlet(c.source_name, c.url);
        if (!outlet) { buzzUnmatched++; continue; }
        if (seenUrls.has(c.url)) continue;
        seenUrls.add(c.url);
        rows.push({
          title: c.title,
          url: c.url,
          published_at: c.published_at,
          source_name: c.source_name,
          outlet_id: outlet.id,
          source_url: c.url,
          url_resolution_status: c.already_canonical ? 'resolved' : 'pending',
          ...(c.already_canonical ? { url_resolved_at: new Date().toISOString() } : {}),
        });
        buzzByOrigin[c.buzz_origin] = (buzzByOrigin[c.buzz_origin] || 0) + 1;
      }

      if (rows.length) {
        // 중복 URL은 Prefer: resolution=ignore-duplicates로 조용히 무시된다(기존 동작과 동일).
        await supabaseQuery('POST', 'articles', rows);
        buzzSaved = rows.length;
      }
      console.log(
        `화제성축 완료: 후보 ${buzzCandidates}건 → 저장 ${buzzSaved}건 ` +
        `(29곳 미식별 ${buzzUnmatched}건 제외), 피드 ${index.stats.feeds_ok}/8 트렌드 ${index.stats.trends}건`
      );
    } catch (e) {
      console.error('화제성축 수집 오류(언론사축 결과에는 영향 없음):', e.message);
    }

    // 원문 URL 해제 — best-effort, 시간 예산 내에서만 시도한다.
    // 여기서 실패/시간초과로 남은 pending 건은 resolve-article-urls.js 수동 백필이 이어서 처리하므로
    // 이 단계가 실패하거나 오래 걸려도 수집 자체(위 totalSaved)는 이미 끝난 상태라 영향 없음.
    let urlResolved = 0, urlFailed = 0;
    try {
      // 2026-08-17: 20초 → 9초. 화제성축 수집(약 1~2초)이 앞에 추가되면서 26초 하드캡 여유가
      // 줄었다. 여기서 못 푼 pending은 resolve-article-urls.js 백필이 이어받으므로 손실이 없고,
      // 반대로 여기서 캡을 넘기면 함수가 통째로 죽어 다음 단계 트리거까지 어긋난다.
      const RESOLVE_TIME_BUDGET_MS = 9000;
      const RESOLVE_CONCURRENCY = 3;
      const resolveStart = Date.now();

      const pending = await supabaseQuery(
        'GET', 'articles', null,
        '?url_resolution_status=eq.pending&select=id,url&order=created_at.desc&limit=20'
      );

      await mapWithConcurrency(pending, RESOLVE_CONCURRENCY, async (article) => {
        if (Date.now() - resolveStart > RESOLVE_TIME_BUDGET_MS) return; // 예산 초과분은 백필에 맡김
        try {
          const canonical = await resolveGoogleNewsUrl(article.url, 5000);
          if (!canonical) { urlFailed++; return; }

          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
            method: 'PATCH',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              url: canonical,
              url_resolution_status: 'resolved',
              url_resolved_at: new Date().toISOString(),
            }),
          });

          if (patchRes.ok) {
            urlResolved++;
          } else if (patchRes.status === 409) {
            // 다른 기사가 이미 같은 원문 URL로 해제돼 있음 — 중복 기사로 확정, url(고유 제약)은 건드리지 않는다
            await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ url_resolution_status: 'duplicate' }),
            });
            urlResolved++;
          } else {
            urlFailed++;
          }
        } catch {
          urlFailed++;
        }
      });
    } catch (e) {
      console.error('URL 해제 단계 오류(수집 결과에는 영향 없음):', e.message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        saved: totalSaved,
        buzz: {
          saved: buzzSaved,
          candidates: buzzCandidates,
          unmatchedOutlet: buzzUnmatched,
          byOrigin: buzzByOrigin,
          feeds: buzzStats,
        },
        urlResolved,
        urlFailed,
        errors: errors.length ? errors : undefined,
      }),
    };

  } catch(e) {
    console.error('collect-news 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
