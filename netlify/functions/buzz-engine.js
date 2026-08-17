// buzz-engine.js — 화제성(buzz) 신호 수집 + 산식 + 카테고리 쿼터 (공유 모듈, 자체 handler 없음)
//
// 배경(2026-08-17, PM 지시 "수집 파이프라인 전면 개편"):
// 기존 수집은 축이 "언론사"였다 — 활성 언론사 29곳 각각에 대해 구글뉴스 RSS 검색을 돌려
// 최신 15건씩 가져오는 방식이라, 그 기사가 화제인지 아닌지는 파이프라인 어디에서도 보지 않았다.
// 3시간마다 도는데 조선일보 같은 곳은 3시간에 15건을 훌쩍 넘겨 쓰므로, 실제로는 "최신순으로
// 잘려나가는" 손실이 매 실행마다 발생했다(잘리는 기준이 화제성과 무관).
//
// 이 모듈은 "무엇이 지금 화제인가"라는 축을 새로 만든다:
//   1) 구글뉴스 Top Stories RSS(KR)        — 구글이 편집한 한국 뉴스 화제성 랭킹
//   2) 구글뉴스 섹션 RSS 7종                — BUSINESS/TECHNOLOGY/SPORTS/ENTERTAINMENT/HEALTH/SCIENCE/WORLD
//   3) 구글 트렌드 KR RSS                   — 검색량(approx_traffic) + 관련 원문 기사 URL
//
// ── 왜 네이버 "많이 본 뉴스"는 안 쓰는가 (2026-08-17 실측) ──────────────────────
// news.naver.com/robots.txt 가 `User-agent: * / Disallow: /` 전면 금지이고, ClaudeBot·GPTBot·
// PerplexityBot 등을 명시 차단하며 "AI 학습 및 RAG 목적 봇 접근 엄격 금지"를 문서에 박아두었다.
// 랭킹 페이지가 HTTP 200을 주더라도 접근 가능 != 허용이다. 뉴스저울은 언론 보도를 다루는
// 서비스라 크롤링 분쟁 리스크가 특히 크므로 네이버 계열은 신호원에서 제외한다.
// 네이버 검색 Open API에는 조회수/랭킹 데이터가 아예 없어 합법 대체 경로도 없다.
//
// ── DDL을 쓰지 않는 이유 ────────────────────────────────────────────────────
// buzz 점수는 topics.ai_context(기존 jsonb).buzz 에 저장한다. 새 컬럼/테이블을 만들지 않으므로
// Supabase SQL Editor 마이그레이션을 기다리지 않고 코드 배포만으로 즉시 동작한다.
// (AGENTS.md 승인 경계: DB Schema 변경은 승인 대상 — 그 대기를 만들지 않는 설계를 택했다.)

const TRENDS_URL = 'https://trends.google.co.kr/trending/rss?geo=KR';
const GN_BASE = 'https://news.google.com/rss';
const GN_SUFFIX = 'hl=ko&gl=KR&ceid=KR:ko';

// 수집 대상 피드. section=null 이 Top Stories(전체 화제).
// quota_hint는 이 피드에서 나온 기사가 어느 쿼터 버킷 성격인지에 대한 힌트로,
// Topic category가 비어 있을 때의 폴백으로만 쓴다(정본은 topics.category).
const BUZZ_FEEDS = [
  { key: 'TOP', section: null, label: 'Top Stories(전체 화제)', quota_hint: null },
  { key: 'BUSINESS', section: 'BUSINESS', label: '경제/주식', quota_hint: 'economy' },
  { key: 'TECHNOLOGY', section: 'TECHNOLOGY', label: '테크/AI', quota_hint: 'tech_ai' },
  { key: 'SPORTS', section: 'SPORTS', label: '스포츠', quota_hint: 'sports' },
  { key: 'ENTERTAINMENT', section: 'ENTERTAINMENT', label: '연예/엔터', quota_hint: 'entertainment' },
  { key: 'HEALTH', section: 'HEALTH', label: '건강', quota_hint: 'etc' },
  { key: 'SCIENCE', section: 'SCIENCE', label: '과학', quota_hint: 'etc' },
  { key: 'WORLD', section: 'WORLD', label: '국제', quota_hint: 'politics_intl' },
];

function feedUrl(feed) {
  if (!feed.section) return `${GN_BASE}?${GN_SUFFIX}`;
  return `${GN_BASE}/headlines/section/topic/${feed.section}?${GN_SUFFIX}`;
}

// ── 산식 파라미터 ───────────────────────────────────────────────────────────
// PM 지시: "Top Stories 등장 가중치 높게, 구글 트렌드 검색량 반영, 최신순 보조".
// 그래서 Top Stories(60) > 트렌드(40) > 섹션(30) > 최신성(15) 순으로 상한을 두었다.
// 최신성은 단독으로는 절대 상위를 만들 수 없는 크기(15)로 묶어 "보조"라는 지시를 지킨다.
const W_TOP_MAX = 60;
const W_TOP_MIN = 25;   // Top Stories에 실렸다는 사실 자체의 하한(꼴찌라도 이만큼은 준다)
const W_SECTION_MAX = 30;
const W_SECTION_MIN = 8;
const W_TREND_MAX = 40;
const W_TREND_NEWS_BONUS = 10; // 트렌드가 물고 온 관련 기사 제목과도 맞으면 가산
const W_RECENCY_MAX = 15;
const RECENCY_FULL_HOURS = 6;   // 6시간 이내는 만점
const RECENCY_ZERO_HOURS = 48;  // 48시간이면 0

// ── 카테고리 쿼터 (PM 지시 2026-08-17) ──────────────────────────────────────
// "트럼프/이란 같은 단일 이슈가 전체를 독점하지 않게" — 상한(cap)이지 목표치(target)가 아니다.
// 어떤 버킷이 미달이어도 그 몫을 다른 버킷이 넘겨받지 않는다(넘겨받으면 상한의 의미가 사라진다).
// 합계는 정확히 100%.
// 2026-08-17 재조정(PM 지시 "정치/국제는 20도 많다, 15로"):
//   politics_intl 0.20 → 0.15. 남은 5%는 etc(건강·과학)로 돌려 합계 100%를 유지한다.
//   etc로 보낸 이유: 실측(8/10~8/16)에서 건강·과학은 게시 0%였다. 남는 몫을 이미 잘 나가는
//   경제·테크에 얹으면 "편중을 줄인다"는 목적과 반대로 간다.
const QUOTA_PLAN = [
  { bucket: 'politics_intl', label: '정치/국제', cap: 0.15 },
  { bucket: 'economy', label: '경제/주식', cap: 0.20 },
  { bucket: 'tech_ai', label: '테크/AI', cap: 0.15 },
  { bucket: 'sports', label: '스포츠', cap: 0.15 },
  { bucket: 'entertainment', label: '연예/엔터', cap: 0.15 },
  { bucket: 'product_consumer', label: '신제품/소비', cap: 0.10 },
  { bucket: 'etc', label: '기타', cap: 0.10 },
];

// ── 채널별 쿼터 (2026-08-17 PM 지시) ────────────────────────────────────────
// 계기: 스레드에서 처음으로 반응이 나온 글이 스트레이키즈(연예)였다(좋아요 18).
// 배급 채널은 "무엇이 실제로 읽히는가"에 맞추고, 웹 발행은 종전 균형을 유지한다.
//
// ★ 채널별로 표를 나눈 이유: QUOTA_PLAN은 발행 파이프라인(editorial-draft /
// publish-routed-content)도 함께 쓴다. 위 표를 그대로 바꾸면 웹사이트 발행까지 연예 70%가 되어
// 색인·SEO 축이 무너진다. 배급만 바꾸려면 표가 분리돼 있어야 한다.
//
// cap: 0인 버킷은 "상한 0"이 아니라 **게시 대상 제외**를 뜻한다(아래 capOf 계산 참고).
const THREADS_QUOTA_PLAN = [
  { bucket: 'entertainment', label: '연예/엔터', cap: 0.70 },
  { bucket: 'sports', label: '스포츠', cap: 0.20 },
  { bucket: 'politics_intl', label: '정치/국제', cap: 0.10 },
  { bucket: 'economy', label: '경제/주식', cap: 0 },
  { bucket: 'tech_ai', label: '테크/AI', cap: 0 },
  { bucket: 'product_consumer', label: '신제품/소비', cap: 0 },
  { bucket: 'etc', label: '기타', cap: 0 },
];

// 인스타는 연예/엔터만. 카드뉴스 포맷이 인물·작품 이슈에서 가장 잘 먹힌다는 판단.
const INSTAGRAM_QUOTA_PLAN = [
  { bucket: 'entertainment', label: '연예/엔터', cap: 1.00 },
  { bucket: 'sports', label: '스포츠', cap: 0 },
  { bucket: 'politics_intl', label: '정치/국제', cap: 0 },
  { bucket: 'economy', label: '경제/주식', cap: 0 },
  { bucket: 'tech_ai', label: '테크/AI', cap: 0 },
  { bucket: 'product_consumer', label: '신제품/소비', cap: 0 },
  { bucket: 'etc', label: '기타', cap: 0 },
];

// cap 0을 "제외"로 해석하는 상한 계산. cap>0일 때만 최소 1건을 보장한다
// (그러지 않으면 비율이 작은 버킷이 floor로 0이 되어 영구히 굶는다).
function capsFor(plan, total) {
  const caps = {};
  for (const q of plan) {
    caps[q.bucket] = q.cap > 0 ? Math.max(1, Math.floor(q.cap * total)) : 0;
  }
  return caps;
}

// topics.category(resolve-topics가 붙이는 대분류) → 쿼터 버킷.
// Sports는 이번 개편에서 새로 생긴 대분류다(종전에는 Entertainment가 스포츠를 함께 삼켰는데,
// 스포츠에 독립 쿼터 15%가 생긴 이상 같은 버킷에 두면 쿼터를 집행할 수 없다).
const CATEGORY_TO_BUCKET = {
  Society: 'politics_intl',
  World: 'politics_intl',
  Economy: 'economy',
  Business: 'economy',
  Crypto: 'economy',
  Technology: 'tech_ai',
  Sports: 'sports',
  Entertainment: 'entertainment',
  Lifestyle: 'product_consumer',
  Automobile: 'product_consumer',
  Health: 'etc',
  Science: 'etc',

  // 한글 카테고리 별칭(2026-08-17 추가). 운영 데이터는 영문이지만, 과거 데이터나 수동 입력으로
  // 한글 값이 들어오면 전부 'etc'로 뭉개져 조용히 잘못된 버킷에 배정된다. 방어적으로 매핑해둔다.
  '정치': 'politics_intl', '국제': 'politics_intl', '사회': 'politics_intl', '외교': 'politics_intl',
  '경제': 'economy', '금융': 'economy', '기업': 'economy', '증시': 'economy',
  'IT': 'tech_ai', '테크': 'tech_ai', 'AI': 'tech_ai', '과학': 'etc',
  '스포츠': 'sports',
  '연예': 'entertainment', '문화': 'entertainment', '영화': 'entertainment', '음악': 'entertainment',
  '자동차': 'product_consumer', '소비': 'product_consumer', '유통': 'product_consumer',
  '생활정보': 'product_consumer', '라이프': 'product_consumer',
  '건강': 'etc', '의료': 'etc',
};

function bucketOf(category, fallbackHint) {
  if (category && CATEGORY_TO_BUCKET[category]) return CATEGORY_TO_BUCKET[category];
  if (fallbackHint && QUOTA_PLAN.some((q) => q.bucket === fallbackHint)) return fallbackHint;
  return 'etc';
}

// ── 한국어 제목 매칭 ────────────────────────────────────────────────────────
// 형태소 분석기 없이 동작해야 한다(Netlify Function, 의존성 추가 금지 기조).
// 조사가 붙어 표기가 흔들리므로 단어 집합만으로는 취약하다 — 그래서 단어 집합과
// 문자 bigram을 함께 쓴다. bigram은 "이재명이"/"이재명은" 같은 조사 변형을 흡수한다.
const STOPWORDS = new Set([
  '기자', '뉴스', '속보', '단독', '종합', '영상', '사진', '오늘', '내일', '어제',
  '그리고', '하지만', '이번', '지난', '올해', '작년', '관련', '대한', '위해', '통해',
  '밝혔다', '말했다', '나섰다', '했다', '한다', '있다', '없다', '대해', '따라',
]);

// 같은 사건인데 표기만 다른 경우를 흡수한다. 실측 사례(2026-08-17): 구글 트렌드가 물고 온
// "거제 시간당 100㎜ 물폭탄"과 구글뉴스의 "경남 거제에 시간당 100mm 이상 집중호우"가
// ㎜/mm 차이와 조사('거제'/'거제에') 때문에 다른 사건으로 판정됐다.
const UNIT_MAP = [
  [/[㎜]/g, 'mm'], [/[㎝]/g, 'cm'], [/[㎞]/g, 'km'], [/[㎏]/g, 'kg'],
  [/[㎖]/g, 'ml'], [/[㎗]/g, 'dl'], [/[℃]/g, 'c'], [/[％]/g, '%'],
];

function normalize(text) {
  let s = String(text || '').replace(/&[a-z]+;/gi, ' ');
  for (const [re, rep] of UNIT_MAP) s = s.replace(re, rep);
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 조사 제거. 잘라낸 뒤 2글자 미만이 되면 자르지 않는다(‘속도’→‘속’ 같은 파괴 방지).
// 양쪽 제목에 같은 규칙을 적용하므로, 설령 일반명사가 잘못 잘려도 양쪽이 똑같이 잘려
// 매칭에는 해가 되지 않는다(오탐이 아니라 미탐 방향으로만 틀린다).
const PARTICLES_LONG = ['으로', '에서', '에게', '부터', '까지', '보다', '에는', '에도', '이라', '라고', '라며'];
const PARTICLES_SHORT = ['은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '로'];

function stemKo(word) {
  for (const p of PARTICLES_LONG) {
    if (word.length - p.length >= 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  for (const p of PARTICLES_SHORT) {
    if (word.length - p.length >= 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

function wordsOf(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 2)
    .map(stemKo)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function bigramsOf(text) {
  const s = normalize(text).replace(/ /g, '');
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function overlapRatio(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let hit = 0;
  for (const v of setA) if (setB.has(v)) hit++;
  return hit / Math.min(setA.size, setB.size);
}

// 단어 겹침을 "글자 수"로 가중한다. 단순 개수로 세면 '이상'·'주의' 같은 짧은 일반어와
// '집중호우'·'100mm' 같은 식별력 높은 단어가 같은 1표가 되어, 같은 사건인데도 점수가 낮게
// 나온다(실측 0.270). 긴 단어일수록 그 제목을 특정하는 힘이 크므로 길이로 가중한다.
function weightedOverlap(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  const sum = (s) => [...s].reduce((acc, w) => acc + w.length, 0);
  let hit = 0;
  for (const w of setA) if (setB.has(w)) hit += w.length;
  const denom = Math.min(sum(setA), sum(setB));
  return denom ? hit / denom : 0;
}

// 두 제목이 같은 사안을 가리키는지 0~1로 반환.
function titleSimilarity(a, b) {
  const wa = new Set(wordsOf(a));
  const wb = new Set(wordsOf(b));
  const wordScore = Math.max(overlapRatio(wa, wb), weightedOverlap(wa, wb));
  const bigramScore = overlapRatio(bigramsOf(a), bigramsOf(b));

  // 고유명사급(4글자 이상) 단어가 그대로 겹치면 강한 신호로 본다.
  let strongHit = false;
  for (const w of wa) if (w.length >= 4 && wb.has(w)) strongHit = true;

  const base = Math.max(wordScore, bigramScore * 0.9);
  return strongHit ? Math.max(base, 0.55) : base;
}

const MATCH_THRESHOLD = 0.42; // 실측 튜닝값 — 이보다 낮추면 무관한 기사끼리 붙는다

// ── RSS 파싱 ────────────────────────────────────────────────────────────────
function parseRssItems(xml, limit) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const rawTitle = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
    if (!rawTitle) continue;
    const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || '').trim();
    const link = (block.match(/<link>(https?:\/\/[^<]+)<\/link>/)?.[1] || '').trim();
    const guid = (block.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1] || '').trim();
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();

    // 구글뉴스 제목은 "제목 - 언론사" 형태다. 언론사명은 <source>로 따로 오므로 꼬리를 떼어낸다.
    let title = rawTitle.replace(/<[^>]+>/g, '').trim();
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    } else {
      title = title.replace(/ - [^-]{2,20}$/, '').trim();
    }

    if (title.length < 5) continue;
    items.push({
      title,
      source_name: source,
      url: guid || link,
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      rank: items.length + 1,
    });
    if (limit && items.length >= limit) break;
  }
  return items;
}

// 트렌드 RSS는 item 하나가 키워드 하나이고, 그 안에 ht:news_item이 여러 개 들어 있다.
function parseTrendsItems(xml) {
  const out = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = m[1];
    const keyword = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '').trim();
    if (!keyword) continue;
    const trafficRaw = (block.match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/)?.[1] || '').trim();
    const newsItems = [];
    for (const n of block.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/g)) {
      const nb = n[1];
      const t = (nb.match(/<ht:news_item_title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/ht:news_item_title>/)?.[1] || '').trim();
      const u = (nb.match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/)?.[1] || '').trim();
      const s = (nb.match(/<ht:news_item_source>([\s\S]*?)<\/ht:news_item_source>/)?.[1] || '').trim();
      if (t) newsItems.push({ title: t, url: u, source_name: s });
    }
    out.push({ keyword, traffic: parseTraffic(trafficRaw), traffic_raw: trafficRaw, news_items: newsItems });
  }
  return out;
}

// "200+", "1만+", "1,000+" 등을 숫자로.
function parseTraffic(raw) {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[,+\s]/g, '');
  const manMatch = cleaned.match(/^(\d+(?:\.\d+)?)만$/);
  if (manMatch) return Math.round(parseFloat(manMatch[1]) * 10000);
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}

async function fetchText(url, timeoutMs) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NewsjeoulBot/1.0; +https://newsjeoul.co.kr)',
      'Accept-Language': 'ko-KR,ko',
    },
    signal: AbortSignal.timeout(timeoutMs || 8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── 화제성 인덱스 수집 ──────────────────────────────────────────────────────
// 9개 피드를 전부 병렬로 친다. collect-news는 Background Function이 아니라 26초 하드캡이
// 걸린 동기 함수이므로(2026-07-14 타임아웃 사고 참고), 순차 호출은 절대 하지 않는다.
// 일부 피드가 죽어도 나머지로 계속 간다 — 화제성은 있으면 좋은 신호지 필수 경로가 아니다.
async function fetchBuzzIndex(options) {
  const opts = options || {};
  const perFeedLimit = opts.perFeedLimit || 40;
  const timeoutMs = opts.timeoutMs || 8000;

  const feedPromises = BUZZ_FEEDS.map(async (feed) => {
    try {
      const xml = await fetchText(feedUrl(feed), timeoutMs);
      return { feed, items: parseRssItems(xml, perFeedLimit), ok: true };
    } catch (e) {
      console.error(`BUZZ_FEED_FAILED ${feed.key}: ${e.message}`);
      return { feed, items: [], ok: false, error: e.message };
    }
  });

  const trendsPromise = (async () => {
    try {
      const xml = await fetchText(TRENDS_URL, timeoutMs);
      return { items: parseTrendsItems(xml), ok: true };
    } catch (e) {
      console.error(`BUZZ_TRENDS_FAILED: ${e.message}`);
      return { items: [], ok: false, error: e.message };
    }
  })();

  const [feedResults, trends] = await Promise.all([Promise.all(feedPromises), trendsPromise]);

  const index = {
    fetched_at: new Date().toISOString(),
    top: [],
    sections: {},
    trends: trends.items,
    maxTraffic: trends.items.reduce((m, t) => Math.max(m, t.traffic || 0), 0),
    stats: { feeds_ok: 0, feeds_failed: 0, items: 0, trends: trends.items.length },
  };

  for (const r of feedResults) {
    if (r.ok) index.stats.feeds_ok++; else index.stats.feeds_failed++;
    index.stats.items += r.items.length;
    if (r.feed.key === 'TOP') index.top = r.items;
    else index.sections[r.feed.key] = r.items;
  }
  index.stats.trends_ok = trends.ok;
  return index;
}

// ── 점수 산정 ───────────────────────────────────────────────────────────────
function rankedPoints(rank, total, maxPoints, minPoints) {
  if (!total) return minPoints;
  const ratio = 1 - (rank - 1) / Math.max(total, 1);
  return Math.round(minPoints + (maxPoints - minPoints) * ratio);
}

function recencyPoints(publishedAt) {
  if (!publishedAt) return 0;
  const ts = new Date(publishedAt).getTime();
  if (!Number.isFinite(ts)) return 0;
  const hours = (Date.now() - ts) / 3600000;
  if (hours <= RECENCY_FULL_HOURS) return W_RECENCY_MAX;
  if (hours >= RECENCY_ZERO_HOURS) return 0;
  const span = RECENCY_ZERO_HOURS - RECENCY_FULL_HOURS;
  return Math.round(W_RECENCY_MAX * (1 - (hours - RECENCY_FULL_HOURS) / span));
}

function bestMatch(title, items) {
  let best = null;
  for (const it of items) {
    const sim = titleSimilarity(title, it.title);
    if (sim >= MATCH_THRESHOLD && (!best || sim > best.sim)) best = { sim, item: it };
  }
  return best;
}

// 제목 하나의 화제성 점수. reasons에 "왜 이 점수인지"를 반드시 남긴다
// (update-topic-weight의 weight_reasons와 같은 원칙 — 근거 없는 숫자는 만들지 않는다).
function scoreTitle(title, index, options) {
  const opts = options || {};
  const reasons = [];
  let score = 0;
  let bucketHint = null;

  const topHit = bestMatch(title, index.top || []);
  if (topHit) {
    const pts = rankedPoints(topHit.item.rank, (index.top || []).length, W_TOP_MAX, W_TOP_MIN);
    score += pts;
    reasons.push(`Top Stories ${topHit.item.rank}위 (+${pts})`);
  }

  let bestSection = null;
  for (const [key, items] of Object.entries(index.sections || {})) {
    const hit = bestMatch(title, items);
    if (hit && (!bestSection || hit.sim > bestSection.hit.sim)) bestSection = { key, hit };
  }
  if (bestSection) {
    const items = index.sections[bestSection.key];
    const pts = rankedPoints(bestSection.hit.item.rank, items.length, W_SECTION_MAX, W_SECTION_MIN);
    score += pts;
    const feed = BUZZ_FEEDS.find((f) => f.key === bestSection.key);
    bucketHint = feed ? feed.quota_hint : null;
    reasons.push(`${feed ? feed.label : bestSection.key} 섹션 ${bestSection.hit.item.rank}위 (+${pts})`);
  }

  let bestTrend = null;
  for (const t of index.trends || []) {
    if (!t.keyword) continue;
    const direct = normalize(title).includes(normalize(t.keyword));
    const viaNews = t.news_items.some((n) => titleSimilarity(title, n.title) >= MATCH_THRESHOLD);
    if (!direct && !viaNews) continue;
    const cand = { trend: t, viaNews };
    if (!bestTrend || (t.traffic || 0) > (bestTrend.trend.traffic || 0)) bestTrend = cand;
  }
  if (bestTrend) {
    const traffic = bestTrend.trend.traffic || 0;
    // 검색량은 편차가 커서 선형으로 쓰면 1등이 전부를 먹는다 — 로그 스케일로 압축한다.
    const scaled = traffic > 0 ? Math.min(1, Math.log10(traffic + 1) / Math.log10(200001)) : 0;
    let pts = Math.round(W_TREND_MAX * scaled);
    if (bestTrend.viaNews) pts += W_TREND_NEWS_BONUS;
    score += pts;
    reasons.push(`구글 트렌드 "${bestTrend.trend.keyword}" 검색량 ${bestTrend.trend.traffic_raw || traffic} (+${pts})`);
  }

  const rec = recencyPoints(opts.publishedAt);
  if (rec > 0) {
    score += rec;
    reasons.push(`최신성 보조 (+${rec})`);
  }

  return {
    score,
    reasons,
    bucket_hint: bucketHint,
    matched: Boolean(topHit || bestSection || bestTrend),
  };
}

// ── 카테고리 쿼터 집행 ──────────────────────────────────────────────────────
// items: [{ id, category, buzz_score, ... }]
// limit: 이번 배치에서 최대 몇 건을 통과시킬지
// recentCounts: { bucket: 최근 창(window) 안에 이미 발행된 건수 } — 배치 하나만 보면
//   "매 배치 20%"가 되어 하루 전체로는 쿼터가 지켜지지 않는다. 최근 발행 이력을 함께 넣어
//   "전체 발행량 중 비율"이라는 지시를 실제로 집행한다.
//
// 반환: { selected, deferred, report }
function applyCategoryQuota(items, limit, recentCounts, options) {
  const opts = options || {};
  const counts = { ...(recentCounts || {}) };
  for (const q of QUOTA_PLAN) if (!counts[q.bucket]) counts[q.bucket] = 0;

  const priorTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const horizon = priorTotal + limit; // 쿼터를 재는 분모(과거 창 + 이번 배치)
  const capOf = {};
  for (const q of QUOTA_PLAN) {
    // 최소 1건은 허용한다 — 발행량이 적을 때 cap*horizon이 0으로 내려가면
    // 소수 버킷(기타 5% 등)이 영구히 한 건도 못 나가는 기아 상태가 된다.
    capOf[q.bucket] = Math.max(1, Math.floor(q.cap * horizon));
  }

  const sorted = [...items].sort((a, b) => {
    const d = (b.buzz_score || 0) - (a.buzz_score || 0);
    if (d !== 0) return d;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });

  const selected = [];
  const deferred = [];
  for (const item of sorted) {
    if (selected.length >= limit) { deferred.push({ ...item, defer_reason: 'batch_full' }); continue; }
    const bucket = bucketOf(item.category, item.buzz_bucket_hint);
    if (counts[bucket] >= capOf[bucket]) {
      deferred.push({ ...item, defer_reason: `quota_full:${bucket}` });
      continue;
    }
    counts[bucket]++;
    selected.push({ ...item, quota_bucket: bucket });
  }

  // 쿼터 때문에 배치가 텅 비는 것은 막는다(전 버킷이 상한에 닿은 경우).
  // 발행이 0이 되는 것보다는 상한을 한 바퀴 넘기더라도 buzz 상위를 내보내는 편이 낫다.
  if (opts.allowOverflow !== false && selected.length === 0 && sorted.length > 0) {
    const fallback = sorted.slice(0, Math.min(limit, sorted.length));
    return {
      selected: fallback.map((i) => ({ ...i, quota_bucket: bucketOf(i.category, i.buzz_bucket_hint), quota_overflow: true })),
      deferred: [],
      report: { horizon, capOf, counts, overflow: true },
    };
  }

  return { selected, deferred, report: { horizon, capOf, counts, overflow: false } };
}

// 쿼터를 재는 관측 창. 배치 하나만 보면 "매 배치 20%"가 되어버려 하루 전체로는 쿼터가
// 지켜지지 않는다(오전에 정치가 몰리면 오후에도 계속 20%씩 더 나간다). 최근 24시간에 실제로
// 발행된 분포를 분모에 넣어야 "전체 발행량 중 비율"이라는 지시가 집행된다.
const QUOTA_WINDOW_HOURS = 24;

// supabaseGet은 각 함수가 이미 갖고 있는 것을 주입받는다(이 모듈은 DB 자격증명을 알지 못한다).
async function fetchRecentPublished(supabaseGet, hours) {
  const since = new Date(Date.now() - (hours || QUOTA_WINDOW_HOURS) * 3600000).toISOString();
  try {
    return await supabaseGet(
      'topics',
      `?editorial_status=eq.published&updated_at=gte.${since}&select=category&limit=1000`
    );
  } catch (e) {
    // 창을 못 읽으면 쿼터를 "이번 배치 기준"으로만 걸고 진행한다 — 발행이 멈추는 것보다 낫다.
    console.error('QUOTA_WINDOW_FETCH_FAILED:', e.message);
    return [];
  }
}

// 최근 발행분에서 버킷별 건수를 센다(쿼터 분모용).
function countBuckets(topics) {
  const counts = {};
  for (const q of QUOTA_PLAN) counts[q.bucket] = 0;
  for (const t of topics || []) {
    const b = bucketOf(t.category, null);
    counts[b] = (counts[b] || 0) + 1;
  }
  return counts;
}

// topics.ai_context.buzz 에서 점수를 읽는다(없으면 0).
function readBuzz(topic) {
  const b = topic && topic.ai_context && topic.ai_context.buzz;
  if (!b || typeof b.score !== 'number') return { score: 0, reasons: [], computed_at: null };
  return b;
}

// buzz 우선 정렬(동점이면 최신순) — 발행 단계 공통 사용.
function sortByBuzz(topics) {
  return [...topics].sort((a, b) => {
    const d = readBuzz(b).score - readBuzz(a).score;
    if (d !== 0) return d;
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
  });
}

// 발행 단계 공통 진입점: buzz 정렬 + 카테고리 쿼터를 한 번에 적용한다.
function prioritizeForPublish(topics, limit, recentPublished, options) {
  const enriched = topics.map((t) => ({
    ...t,
    buzz_score: readBuzz(t).score,
    buzz_bucket_hint: (t.ai_context && t.ai_context.buzz && t.ai_context.buzz.bucket_hint) || null,
  }));
  return applyCategoryQuota(enriched, limit, countBuckets(recentPublished), options);
}

module.exports = {
  BUZZ_FEEDS,
  QUOTA_PLAN,
  THREADS_QUOTA_PLAN,
  INSTAGRAM_QUOTA_PLAN,
  capsFor,
  QUOTA_WINDOW_HOURS,
  fetchRecentPublished,
  CATEGORY_TO_BUCKET,
  MATCH_THRESHOLD,
  feedUrl,
  parseRssItems,
  parseTrendsItems,
  parseTraffic,
  fetchBuzzIndex,
  scoreTitle,
  titleSimilarity,
  bucketOf,
  countBuckets,
  applyCategoryQuota,
  prioritizeForPublish,
  readBuzz,
  sortByBuzz,
  recencyPoints,
};
