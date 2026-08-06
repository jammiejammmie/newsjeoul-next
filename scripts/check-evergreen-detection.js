// 에버그린 감지 실측 — 카테고리 게이트 수정(2026-08-06)이 실제 데이터에서 후보를 만드는지 본다.
//
// 왜 필요한가: detect 함수는 Background Function이라 호출하면 202만 돌아오고 결과는 로그로만
// 간다. 감지가 0건이었던 사고를 고친 뒤 "정말 후보가 생기는가"를 확인할 방법이 없으면
// 다음 실행까지 3시간을 기다려야 한다. 판정(Claude) 앞단의 규칙은 전부 순수 함수이므로
// anon 키로 토픽만 읽어 오면 같은 계산을 여기서 그대로 돌려볼 수 있다.
//
// 이 스크립트는 읽기만 한다 — evergreen_queue에 아무것도 쓰지 않는다.

const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

const d = require(path.join(__dirname, '..', 'netlify', 'functions', 'detect-evergreen-candidates-background.js'))._testUtils;

const LOOKBACK_HOURS = 96;

(async () => {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 3600000).toISOString();
  const [topics, hubs] = await Promise.all([
    fetch(`${U}/rest/v1/topics?status=eq.active&updated_at=gte.${encodeURIComponent(since)}` +
      `&select=id,name,category,importance_score,created_at,updated_at&order=importance_score.desc&limit=300`,
      { headers: H }).then((r) => r.json()),
    fetch(`${U}/rest/v1/hubs?select=slug,title`, { headers: H }).then((r) => r.json()),
  ]);

  if (!Array.isArray(topics)) { console.error('토픽 조회 실패:', topics); process.exit(1); }
  console.log(`대상 토픽 ${topics.length}건(최근 ${LOOKBACK_HOURS}시간) · 기존 허브 ${hubs.length}개\n`);

  const scores = topics.map((t) => t.importance_score ?? 0).filter((n) => n > 0).sort((a, b) => b - a);
  console.log(`무게 분포: 최고 ${scores[0]} · 상위15% ${scores[Math.floor(scores.length * 0.15)]} · 중앙 ${scores[Math.floor(scores.length / 2)]} · 최저 ${scores[scores.length - 1]}`);

  const bars = d.computeScoreBars(topics);
  console.log(`적용 기준: 에버그린 ${bars.evergreen}g · 중립 ${bars.neutral}g · 뉴스 ${bars.news}g (상대기준 ${bars._dynamic}g)`);
  console.log(`  ※ 수정 전 기준은 카테고리 무관 ${d.HIGH_SCORE_MIN}g 고정 — 최고 무게가 ${scores[0]}g이므로 도달 불가였다\n`);

  const stanceOf = d.categoryStance;
  const tally = {};
  for (const t of topics) { const s = stanceOf(t.category); tally[s] = (tally[s] || 0) + 1; }
  console.log('토픽 카테고리 성향:', JSON.stringify(tally), '\n');

  const existingKeywords = hubs.map((h) => h.title).filter(Boolean);
  const raw = [
    ...d.detectKeywordClusters(topics),
    ...d.detectHighScore(topics, existingKeywords, bars),
    ...d.detectRepeatSurge(topics),
  ];

  // 수정 전 동작 재현 — 고정 500g + 가중치 없음.
  const before = [
    ...d.detectKeywordClusters(topics),
    ...d.detectHighScore(topics, existingKeywords, { evergreen: 500, neutral: 500, news: 500 }),
    ...d.detectRepeatSurge(topics),
  ];
  const byReason = (list) => list.reduce((a, c) => { a[c.trigger_reason] = (a[c.trigger_reason] || 0) + 1; return a; }, {});
  console.log('감지 결과 (수정 전):', JSON.stringify(byReason(before)));
  console.log('감지 결과 (수정 후):', JSON.stringify(byReason(raw)), '\n');

  // 판정 예산 12칸에 무엇이 들어가는지 — 사고의 두 번째 원인.
  const rank = (list, weighted) => {
    const byName = new Map();
    for (const c of list) {
      const k = d.dedupeKey(c.name);
      if (!k || k.length < 2) continue;
      const prev = byName.get(k);
      if (!prev || c.priority > prev.priority) byName.set(k, c);
    }
    return [...byName.values()]
      .map((c) => ({ ...c, stance: stanceOf(c.category), rankScore: c.priority * (weighted ? d.PRIORITY_WEIGHT[stanceOf(c.category)] : 1) }))
      .sort((a, b) => b.rankScore - a.rankScore).slice(0, 12);
  };

  const show = (label, list) => {
    const t2 = list.reduce((a, c) => { a[c.stance] = (a[c.stance] || 0) + 1; return a; }, {});
    console.log(`${label} — 성향 ${JSON.stringify(t2)}`);
    list.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}. [${c.stance}] ${c.name} (${c.category || '분류없음'}, p=${Math.round(c.rankScore)})`));
    console.log();
  };

  show('판정 예산 12칸 (수정 전: 가중치 없음)', rank(before, false));
  show('판정 예산 12칸 (수정 후: 성향 가중)', rank(raw, true));
})();
