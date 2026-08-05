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
const HIGH_SCORE_MIN = 500;       // 규칙 2의 기준(지시: 500g 이상)
const MAX_CANDIDATES_PER_RUN = 12; // 판정에 쓰는 Claude 호출 상한(비용 통제)

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
function detectHighScore(topics, existingKeywords) {
  return topics
    .filter((t) => (t.importance_score ?? 0) >= HIGH_SCORE_MIN)
    // 이미 허브가 커버하는 키워드가 제목에 있으면 새 허브가 필요 없다.
    .filter((t) => !existingKeywords.some((k) => (t.name || '').includes(k)))
    .map((t) => ({
      name: t.name,
      trigger_reason: 'high_score_no_hub',
      trigger_detail: `무게 ${Math.round(t.importance_score)}g(기준 ${HIGH_SCORE_MIN}g 이상)인데 담당 허브가 없다`,
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
→ 공통점: 6개월 뒤에도 같은 걸 검색한다.

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
    const raw = [
      ...detectKeywordClusters(topics),
      ...detectHighScore(topics, existingKeywords),
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

    const candidates = [...byName.values()]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, MAX_CANDIDATES_PER_RUN);

    const stats = {
      topicsScanned: topics.length,
      detected: raw.length,
      afterDedup: byName.size,
      judged: candidates.length,
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
      ` → 중복제외 ${stats.afterDedup} → 판정 ${stats.judged} → 큐 ${stats.queued}, 부적합 ${stats.skipped}`
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
  CLUSTER_MIN_TOPICS, HIGH_SCORE_MIN, STOPWORDS,
};
