// detect-evergreen-candidates-background.js
// 수집되는 topics에서 "허브로 만들 값이 있는 실체"를 감지해 evergreen_queue에 쌓는다.
//
// 감지 규칙 3개(지시 그대로):
//   1) keyword_cluster    — 같은 제품명/키워드가 3건 이상 토픽에 집중
//   2) high_score_no_hub  — importance_score 500g 이상인데 허브가 없다
//   3) repeat_surge       — 같은 키워드가 24시간 안에 반복 등장(검색 급상승 대리지표)
//
// ★ 적합성 게이트가 필요한 이유(실측 근거):
//   score>=500 활성 토픽 16건이 전부 정치·국제 뉴스다("트럼프 이란 보복 예고" 등).
//   규칙만 그대로 돌리면 큐가 뉴스 이벤트로 찬다. 그런데 허브의 주인공은 뉴스가 아니라
//   검색되는 실체다(설계서 §3.1) — 지나가는 사건으로 허브를 만들면 한 달 뒤 죽은 페이지가 된다.
//   그래서 감지된 후보를 Claude가 "에버그린 실체인가"로 한 번 판정하고, 부적합은 버리지 않고
//   status=skipped + 이유로 남긴다(무엇이 왜 걸러졌는지 볼 수 있어야 규칙을 고칠 수 있다).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const LOOKBACK_HOURS = 96;        // 감지 대상 토픽 범위
const SURGE_WINDOW_HOURS = 24;    // 규칙 3의 반복 판정 창
const CLUSTER_MIN_TOPICS = 3;     // 규칙 1의 집중 기준(지시: 3건 이상)
const HIGH_SCORE_MIN = 500;       // 규칙 2의 기준(지시: 500g 이상) — 뉴스성 카테고리에 적용
const MAX_CANDIDATES_PER_RUN = 12; // 판정에 쓰는 Claude 호출 상한(비용 통제)

// ── 2026-08-06: 감지 0건 사고 대응 ──────────────────────────────────────────
// 증상: 파이프라인 가동 후 28시간(감지 9회 이상) 동안 evergreen_queue에 pending 0건,
//       자동 생성 허브 0개. 원인은 두 가지가 겹친 것이다.
//
//  (1) HIGH_SCORE_MIN=500이 **도달 불가능한 값**이 됐다.
//      2026-08-05 Weight Engine에 신선도 감쇠(ce1ec67)가 들어가면서 전체 무게가 내려갔다.
//      실측(2026-08-06 홈): 1위 398g · 2위 378g · 3위 362g — 상위 어느 토픽도 500g에 닿지
//      않는다. 즉 규칙 2(high_score_no_hub)는 감쇠 도입 시점부터 구조적으로 0건이었다.
//      고정 임계값이 다른 엔진의 산식 변경에 조용히 무력화된 것이다.
//
//  (2) 판정 예산 12칸을 정치·국제 토픽이 매번 다 먹었다.
//      priority가 등장 빈도·무게로만 정해져서, 뉴스 회전이 빠른 정치·국제 키워드가 항상
//      상위를 차지했다. 판정된 이름은 status=skipped로 영구 기록돼 다시 판정하지 않으므로
//      (비용 통제상 의도된 동작), 매 회차 12칸이 "어차피 부적합 판정될 것"으로 채워지고
//      IT·소비재·생활 후보는 순번이 오지 않았다.
//
// 대응: 카테고리 성향을 보고 (a) 무게 기준을 달리 적용하고 (b) 판정 순번을 조정한다.
//       뉴스성 카테고리를 버리지는 않는다 — 최종 적합성 판정은 여전히 모델 게이트가 한다.
const HIGH_SCORE_MIN_EVERGREEN = 250; // 에버그린 성향 카테고리에 적용하는 완화 기준
const HIGH_SCORE_FLOOR = 120;         // 상대 기준이 아무리 내려가도 이 밑으로는 안 내려간다
const PRIORITY_WEIGHT = { evergreen: 1.5, neutral: 1, news: 0.4 };

// 카테고리 조각별 성향. 실제 DB에 있는 33종을 기준으로 만들었다(영문·한글·'A/B' 복합 혼재).
const EVERGREEN_SEGMENTS = new Set([
  'technology', 'it', 'business', 'economy', 'lifestyle', 'automobile', 'health', 'science', 'crypto',
  '기술', '산업', '기업', '경제', '물가', '보안', '생활', '자동차', '건강', '과학', '유통', '소비', '부동산',
]);
const NEWS_SEGMENTS = new Set([
  'society', 'entertainment', 'sports', 'politics',
  '정치', '국제', '사회', '사건사고', '사고', '재난', '중동', '북한', '안보',
  '날씨', '기후', '지역', '행정', '스포츠', '사법', '연예',
]);

/**
 * 카테고리 성향 판정. 'A/B' 복합 카테고리는 조각별로 세어 뉴스 쪽이 같거나 많으면 뉴스로 본다.
 * 예: '정치/경제'는 뉴스(정치 맥락의 경제 기사다), '경제/기업'은 에버그린, '산업/기술'은 에버그린.
 */
function categoryStance(category) {
  const segs = String(category || '').split(/[/·,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!segs.length) return 'neutral';
  let ever = 0, news = 0;
  for (const s of segs) {
    if (EVERGREEN_SEGMENTS.has(s)) ever++;
    else if (NEWS_SEGMENTS.has(s)) news++;
  }
  if (!ever && !news) return 'neutral';
  return ever > news ? 'evergreen' : 'news';
}

/** 카테고리 성향별 무게 기준. bars가 없으면 기존 상수를 쓴다(테스트·단독 호출 호환). */
function scoreBarFor(category, bars) {
  const stance = categoryStance(category);
  const b = bars || { evergreen: HIGH_SCORE_MIN_EVERGREEN, neutral: HIGH_SCORE_MIN, news: HIGH_SCORE_MIN };
  return b[stance] ?? HIGH_SCORE_MIN;
}

/**
 * 무게 기준을 이번 실행의 실제 분포에서도 뽑는다 — 산식이 또 바뀌어도 규칙이 조용히 죽지 않게.
 * 상위 15% 지점과 절대 기준 중 **낮은 쪽**을 쓴다. 뉴스성 카테고리는 완화하지 않는다.
 */
function computeScoreBars(topics) {
  const scores = topics.map((t) => t.importance_score ?? 0)
    .filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => b - a);
  const p85 = scores.length ? scores[Math.min(scores.length - 1, Math.floor(scores.length * 0.15))] : 0;
  const dynamic = Math.max(HIGH_SCORE_FLOOR, Math.round(p85));
  return {
    evergreen: Math.min(HIGH_SCORE_MIN_EVERGREEN, dynamic),
    neutral: Math.min(HIGH_SCORE_MIN, dynamic),
    news: HIGH_SCORE_MIN,
    _dynamic: dynamic,
  };
}

// 토픽 이름에서 실체 후보를 뽑을 때 버릴 말. 뉴스 문장에 흔하지만 검색 대상 실체가 아니다.
const STOPWORDS = new Set([
  '논의','발표','확대','추진','검토','예고','우려','비판','합의','회담','정상','협력','협정',
  '지속','피해','대응','조사','수사','의혹','갈등','반발','촉구','요구','대책','방안','계획',
  '가능성','전망','분석','상황','문제','사태','영향','결과','이후','관련','대한','위한','따른',
  '인한','통해','대해','있는','없는','하는','되는','이번','올해','내년','지난','최근','오늘',
  '정부','대통령','장관','국회','법안','개정','폐지','신설','도입','시행','적용','기준','제도',
  '지원','사업','정책','예산','투자','시장','기업','산업','실적','주가','금리','물가','환율',
  '미국','중국','일본','한국','유럽','러시아','우크라','이란','이스라엘','북한','중동',
]);

async function sb(method, path, body, extraHeaders) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json', ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} 실패: ` + await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * 모델이 준 slug를 검증·정규화한다. 통과하지 못하면 null(그 후보를 큐에 넣지 않는다).
 *
 * ★ 왜 코드로 슬러그를 만들지 않는가(2026-08-05 실측):
 *   원래는 한글→영문 하드코딩 사전으로 만들었다. 그 결과 감지된 39건 중 37건이
 *   슬러그를 만들지 못해 탈락하고, 살아남은 2건은 '2026'(연도!)과 'fifa'였다.
 *   사전에 없는 한글은 음절을 버리므로 대부분 빈 문자열이 된다 — 감지가 사실상 작동하지 않았다.
 *   번역은 모델이 훨씬 잘한다('세제개편안'→'tax-reform'). 대신 규칙 위반은 여기서 막는다.
 */
function normalizeSlug(raw) {
  let s = String(raw || '').toLowerCase().trim()
    .replace(/[^a-z0-9-]/g, '-')      // 한글·공백·기호는 모두 하이픈으로
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // 연도 제거 — URL에 날짜를 넣지 않는다(§6.1). 모델이 넣어도 여기서 떼낸다.
  s = s.replace(/\b(19|20)\d{2}\b/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (s.length < 3 || s.length > 60) return null;
  // 숫자만인 슬러그는 의미가 없다('2026' 사건).
  if (/^[0-9-]+$/.test(s)) return null;
  return s;
}

/** 이름 기준 중복 판정 키 — 같은 후보를 매 3시간 재판정하지 않기 위해 쓴다. */
function dedupeKey(name) {
  return String(name || '').replace(/\s+/g, '').toLowerCase();
}

function tokensOf(name) {
  return String(name || '')
    .split(/[\s,·\/()\[\]"'`~!?.·:;]+/)
    .map((w) => w.replace(/[은는이가을를의에서와과로도만]$/, ''))
    .filter((w) => w.length >= 2 && w.length <= 12 && !STOPWORDS.has(w))
    .filter((w) => !/^\d+$/.test(w));
}

// ── 규칙 1: 같은 키워드가 3건 이상 토픽에 집중 ──────────────────────────────
function detectKeywordClusters(topics) {
  const byToken = new Map();
  for (const t of topics) {
    for (const tok of new Set(tokensOf(t.name))) {
      if (!byToken.has(tok)) byToken.set(tok, []);
      byToken.get(tok).push(t);
    }
  }
  const out = [];
  for (const [tok, list] of byToken) {
    if (list.length < CLUSTER_MIN_TOPICS) continue;
    const top = list.slice().sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))[0];
    out.push({
      name: tok,
      trigger_reason: 'keyword_cluster',
      trigger_detail: `'${tok}'가 최근 ${LOOKBACK_HOURS}시간 토픽 ${list.length}건에 반복 등장: ` +
        list.slice(0, 3).map((t) => t.name).join(' / '),
      trigger_topic_id: top.id,
      keywords: [tok],
      // 집중도와 대표 토픽 무게를 함께 반영한다.
      priority: list.length * 100 + Math.round((top.importance_score ?? 0) / 10),
      category: top.category || null,
    });
  }
  return out;
}

// ── 규칙 2: 무게 500g 이상인데 허브가 없다 ──────────────────────────────────
function detectHighScore(topics, existingKeywords, bars) {
  return topics
    .filter((t) => (t.importance_score ?? 0) >= scoreBarFor(t.category, bars))
    // 이미 허브가 커버하는 키워드가 제목에 있으면 새 허브가 필요 없다.
    .filter((t) => !existingKeywords.some((k) => (t.name || '').includes(k)))
    .map((t) => ({
      name: t.name,
      trigger_reason: 'high_score_no_hub',
      trigger_detail: `무게 ${Math.round(t.importance_score)}g(${t.category || '분류없음'} 기준 ` +
        `${scoreBarFor(t.category, bars)}g 이상)인데 담당 허브가 없다`,
      trigger_topic_id: t.id,
      keywords: tokensOf(t.name).slice(0, 3),
      priority: Math.round(t.importance_score ?? 0),
      category: t.category || null,
    }));
}

// ── 규칙 3: 같은 키워드가 24시간 안에 반복(검색 급상승 대리지표) ─────────────
// 진짜 검색량 데이터는 없다. 대신 "같은 키워드를 가진 토픽이 24시간 안에 2건 이상 새로
// 만들어졌다"를 급상승 신호로 쓴다 — 없는 데이터를 있는 척하지 않고, 가진 신호로 대체한다.
function detectRepeatSurge(topics) {
  const cutoff = Date.now() - SURGE_WINDOW_HOURS * 3600000;
  const recent = topics.filter((t) => Date.parse(t.created_at || t.updated_at || 0) >= cutoff);
  const byToken = new Map();
  for (const t of recent) {
    for (const tok of new Set(tokensOf(t.name))) {
      if (!byToken.has(tok)) byToken.set(tok, []);
      byToken.get(tok).push(t);
    }
  }
  const out = [];
  for (const [tok, list] of byToken) {
    if (list.length < 2) continue;
    const top = list.slice().sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))[0];
    out.push({
      name: tok,
      trigger_reason: 'repeat_surge',
      trigger_detail: `'${tok}'가 ${SURGE_WINDOW_HOURS}시간 안에 신규 토픽 ${list.length}건으로 재등장(급상승 신호)`,
      trigger_topic_id: top.id,
      keywords: [tok],
      priority: 300 + list.length * 50,
      category: top.category || null,
    });
  }
  return out;
}

// ── 적합성 판정 ─────────────────────────────────────────────────────────────
// 감지 규칙은 "뭔가 자주 나온다"만 안다. 그게 검색되는 실체인지 지나가는 사건인지는 모른다.
async function judgeCandidates(cands) {
  const list = cands.map((c, i) => `${i + 1}. ${c.name} — 근거: ${c.trigger_detail}`).join('\n');
  const prompt = `아래는 뉴스 토픽에서 자동 감지된 "토픽 허브" 후보다.
토픽 허브는 사람들이 **검색해서 반복적으로 찾아오는 실체**를 한 페이지에 모아두는 곳이다.
갤럭시 Z 폴드8(제품), 전기차 보조금(제도), 엑셀(프로그램), 아우디 Q9(신차)이 좋은 예다.

각 후보를 판정해라.

허브로 적합한 것(suitable: true):
- 제품·모델(스마트폰, 자동차, 가전)
- 정부 제도·지원금·정책 프로그램(신청·자격·금액을 검색한다)
- 소프트웨어·서비스(사용법을 검색한다)
- 자격증·시험·채용 전형
- 생활·소비 항목(요금제, 보험, 대출·청약, 세금 신고, 구독 서비스 등 매년 다시 찾아보는 것)
→ 공통점: 6개월 뒤에도 같은 걸 검색한다.

★ IT·기술·소비재·생활·금융 영역의 실체는 뉴스 기사에서 감지됐다는 이유로 탈락시키지 마라.
  판단 기준은 "어떤 카테고리의 기사에서 나왔는가"가 아니라 "6개월 뒤에도 검색되는가"다.
  예: '전기요금 누진제'는 요금 인상 뉴스에서 감지돼도 계속 검색되는 실체이므로 적합하다.

허브로 부적합한 것(suitable: false):
- 특정 사건·사고·재난 (지나가면 검색이 사라진다)
- 정치 공방·외교 회담·발언·수사·재판
- 인물 자체 (트럼프, 이재명 같은 사람 이름)
- 국가·지역명, 일반 명사 조각
- 스포츠 경기 결과, 연예 이슈
→ 공통점: 뉴스이지 검색 대상 실체가 아니다.

후보:
${list}

각 항목에 대해:
- suitable: 위 기준으로 참/거짓
- reason: 왜 그렇게 판정했는지 한 문장(부적합이면 특히 명확하게)
- title: 적합할 때만. 허브 제목(연도·날짜 넣지 마라). 예: '갤럭시 Z 폴드8', '청년월세 특별지원'
- kind: 적합할 때만. product | car | policy | program 중 하나
- category: 적합할 때만. 짧은 분야명. 예: '모바일', '신차', '청년지원', '오피스'
- slug: 적합할 때만. URL로 쓸 영문 소문자 식별자(하이픈 구분).
  ★ 연도·날짜를 절대 넣지 마라. 'tax-reform-2026'이 아니라 'tax-reform'이다.
    (연도가 붙으면 해마다 URL이 바뀌어 누적된 검색 자산이 리셋된다.)
  ★ 숫자만으로 만들지 마라. '2026' 같은 값은 무의미하다.
  ★ 한글을 음차하지 말고 뜻으로 옮겨라: '청년월세 특별지원'→'youth-monthly-rent',
    '전기차 구매 보조금'→'ev-subsidy', '갤럭시 Z 폴드8'→'galaxy-z-fold8',
    '세제개편안'→'tax-reform'. 제품 모델명의 숫자는 남겨도 된다(fold8).

설명 없이 JSON만 반환해라(코드블록 없이):
{"results":[{"index":1,"suitable":true,"reason":"...","title":"...","slug":"galaxy-z-fold8","kind":"product","category":"모바일"}]}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 2500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('판정 파싱 실패: ' + raw.slice(0, 200));
  return JSON.parse(m[0]).results || [];
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
    const [topics, hubs, queued] = await Promise.all([
      sb('GET', `topics?status=eq.active&updated_at=gte.${encodeURIComponent(since)}` +
        `&select=id,name,category,importance_score,created_at,updated_at&order=importance_score.desc&limit=300`),
      sb('GET', 'hubs?select=slug,title,config'),
      sb('GET', 'evergreen_queue?select=hub_slug,suggested_title,status'),
    ]);

    // 이미 있는 허브·큐는 다시 만들지 않는다.
    // 슬러그는 판정 단계(모델)에서 나오므로, 판정 전 중복 제거는 **이름**으로 한다.
    // done/skipped도 제외한다 — 한 번 판정한 것을 매 3시간 재판정하면 비용만 든다.
    const existingSlugs = new Set(hubs.map((h) => h.slug));
    const judgedNames = new Set([
      ...queued.map((q) => dedupeKey(q.suggested_title)),
      ...hubs.map((h) => dedupeKey(h.title)),
    ]);
    const existingKeywords = hubs.map((h) => h.title).filter(Boolean);

    // 3개 규칙 실행 → 같은 이름은 우선순위 높은 쪽만 남긴다.
    const bars = computeScoreBars(topics);
    const raw = [
      ...detectKeywordClusters(topics),
      ...detectHighScore(topics, existingKeywords, bars),
      ...detectRepeatSurge(topics),
    ];
    const byName = new Map();
    for (const c of raw) {
      const key = dedupeKey(c.name);
      if (!key || key.length < 2) continue;
      if (judgedNames.has(key)) continue;
      const prev = byName.get(key);
      if (!prev || c.priority > prev.priority) byName.set(key, c);
    }

    // 판정 예산(12칸) 배분 — 카테고리 성향으로 순번을 조정한다. 뉴스성 후보를 버리는 게
    // 아니라 뒤로 미루는 것이다(적합 판정은 여전히 모델이 한다). 이 보정이 없으면 회전이
    // 빠른 정치·국제 키워드가 매 회차 12칸을 다 먹고, 한 번 판정된 이름은 영구 skipped라
    // IT·소비재·생활 후보에 순번이 영영 오지 않는다.
    const ranked = [...byName.values()].map((c) => {
      const stance = categoryStance(c.category);
      return { ...c, stance, rankScore: c.priority * PRIORITY_WEIGHT[stance] };
    });
    const candidates = ranked
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, MAX_CANDIDATES_PER_RUN);

    const stanceTally = (list) => list.reduce((acc, c) => {
      const s = c.stance || categoryStance(c.category);
      acc[s] = (acc[s] || 0) + 1; return acc;
    }, {});

    const stats = {
      topicsScanned: topics.length,
      detected: raw.length,
      afterDedup: byName.size,
      judged: candidates.length,
      scoreBars: bars,
      stanceDetected: stanceTally(ranked),
      stanceJudged: stanceTally(candidates),
      queued: 0, skipped: 0, badSlug: 0,
    };

    if (!candidates.length) {
      console.log(`EVERGREEN_DETECT_DONE: 토픽 ${topics.length} → 신규 후보 0건(중복 제외 후)`);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...stats }) };
    }

    const verdicts = await judgeCandidates(candidates);
    const rows = [];
    const skippedSamples = [];
    for (const v of verdicts) {
      const c = candidates[(v.index ?? 0) - 1];
      if (!c) continue;
      const slug = v.suitable ? normalizeSlug(v.slug) : null;
      if (v.suitable && v.title && v.kind && slug && !existingSlugs.has(slug)) {
        existingSlugs.add(slug); // 같은 실행 안에서 두 후보가 같은 슬러그를 내는 경우 방어
        rows.push({
          hub_slug: slug,
          suggested_title: String(v.title).slice(0, 120),
          category: String(v.category || c.category || '').slice(0, 40) || null,
          kind: ['product', 'car', 'policy', 'program'].includes(v.kind) ? v.kind : 'product',
          trigger_topic_id: c.trigger_topic_id,
          trigger_reason: c.trigger_reason,
          trigger_detail: c.trigger_detail,
          keywords: c.keywords,
          priority: c.priority,
          status: 'pending',
        });
      } else {
        // 부적합·슬러그 실패도 기록한다 — 무엇이 왜 걸러졌는지 봐야 규칙을 고칠 수 있다.
        // hub_slug는 NOT NULL이므로 안정적인 대체값을 넣는다. unique 인덱스는
        // pending/processing에만 걸려 있어 skipped끼리는 충돌하지 않는다.
        if (v.suitable && !slug) stats.badSlug++;
        rows.push({
          hub_slug: `skip-${dedupeKey(c.name).slice(0, 40) || 'unknown'}`.slice(0, 60),
          suggested_title: c.name.slice(0, 120),
          trigger_topic_id: c.trigger_topic_id,
          trigger_reason: c.trigger_reason,
          trigger_detail: c.trigger_detail,
          keywords: c.keywords,
          priority: 0,
          status: 'skipped',
          error_message: String(v.suitable && !slug ? `슬러그 생성 실패(모델값: ${v.slug})` : (v.reason || '에버그린 실체가 아님')).slice(0, 300),
        });
        if (skippedSamples.length < 5) skippedSamples.push(`${c.name}: ${v.reason}`);
      }
    }
    stats.queued = rows.filter((r) => r.status === 'pending').length;
    stats.skipped = rows.filter((r) => r.status === 'skipped').length;

    if (rows.length && !isDry) {
      await sb('POST', 'evergreen_queue', rows, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
    }

    console.log(
      `EVERGREEN_DETECT_DONE${isDry ? '[dry]' : ''}: 토픽 ${stats.topicsScanned} → 감지 ${stats.detected}` +
      ` → 중복제외 ${stats.afterDedup} → 판정 ${stats.judged} → 큐 ${stats.queued}, 부적합 ${stats.skipped}` +
      ` | 무게기준 ${JSON.stringify(bars)} | 성향(감지) ${JSON.stringify(stats.stanceDetected)}` +
      ` | 성향(판정) ${JSON.stringify(stats.stanceJudged)}`
    );
    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, dry: isDry, ...stats,
        queuedItems: rows.filter((r) => r.status === 'pending').map((r) => `${r.hub_slug} (${r.suggested_title}, p=${r.priority})`),
        skippedSamples,
      }),
    };
  } catch (e) {
    console.error('EVERGREEN_DETECT_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports._testUtils = {
  normalizeSlug, dedupeKey, tokensOf, detectKeywordClusters, detectHighScore, detectRepeatSurge,
  categoryStance, scoreBarFor, computeScoreBars,
  CLUSTER_MIN_TOPICS, HIGH_SCORE_MIN, HIGH_SCORE_MIN_EVERGREEN, HIGH_SCORE_FLOOR,
  PRIORITY_WEIGHT, STOPWORDS,
};
