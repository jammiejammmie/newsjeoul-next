// post-threads-background.js(Distribution Engine) 회귀 테스트 — 실제 서비스를 호출하지 않고
// fetch를 모의(mock)해서 검증한다. 실행: node scripts/test-post-threads.js
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'fake';
process.env.ANTHROPIC_API_KEY = 'fake';
process.env.ADMIN_KEY = 'real-admin-key';
process.env.THREADS_USER_ID = 'fake-user';
process.env.THREADS_ACCESS_TOKEN = 'fake-token';
// 실제 2~5분 대기를 그대로 기다리면 테스트가 몇 분씩 걸리므로 테스트 전용으로 짧게 오버라이드.
process.env.POST_GAP_MIN_MS = '5';
process.env.POST_GAP_MAX_MS = '10';
// 두 스위치는 운영 기본값과 테스트에서 보고 싶은 상태가 다르다. 아래 회귀 테스트들은
// "돌 때 제대로 도는가"를 검증하는 것이므로 여기서 켜고 시작하고, 스위치 자체의 동작은
// 맨 끝 전용 테스트에서 따로 확인한다.
process.env.THREADS_DISTRIBUTION_PAUSED = 'false';
// 에버그린은 2026-08-12부터 기본 OFF다(PM 지시 — 품질 점검 동안 뉴스만 돌린다).
process.env.THREADS_EVERGREEN_ENABLED = 'true';
// 채널 쿼터는 운영 기본값이 연예70/스포츠20/정치10이라(PM 지시 2026-08-17) 경제·테크·자동차
// 후보가 아예 제외된다. 아래 배분 회귀 테스트들은 "여러 카테고리 중 무엇을 고르는가"를 보는
// 것이라 그 상태에서는 40건이 통째로 실패한다. 균형 모드로 돌려서 선택 로직 자체를 검증한다
// (채널 쿼터의 동작은 scripts/test-category-quota.js가 따로 검증한다).
// ※ 이 줄이 없으면 40건 실패가 나는데, 원인이 환경 문제로 오인되기 쉽다(2026-08-18 실제 오진).
process.env.THREADS_QUOTA_MODE = 'balanced';

const path = require('path').resolve(__dirname, '../netlify/functions/post-threads-background.js');

function makeTopic(id, name, category, importance, overrides) {
  return Object.assign(
    {
      id, slug: id, name, summary: '요약', category, importance_score: importance,
      updated_at: new Date().toISOString(),
      ai_context: {
        plan: { editors_assigned: [{ name: '에디터', perspective: '관점' }] },
        draft: { lead: '리드 문장입니다'.repeat(3), blocks: [{ axis: '비교', content: '본문 내용입니다. '.repeat(30) }], display_keywords: ['키워드1', '키워드2'] },
        evidence: { sources: [{ title: '기사', url: 'https://example.com/x', outlet: '연합뉴스' }] },
        weight: { reasons: ['이유1'], components: { controversy_score_bonus: 20, dual_perspective_bonus: 10 } },
      },
    },
    overrides || {}
  );
}

function jsonRes(obj) { return { ok: true, json: async () => obj, text: async () => JSON.stringify(obj) }; }
function headRes(count) { return { ok: true, headers: { get: (k) => (k === 'content-range' ? `0-0/${count}` : null) }, text: async () => '' }; }

const results = [];
function check(label, pass) { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); }

// 인스타그램은 이 테스트의 대상이 아니다. post-threads-background는 실행 끝에
// instagram-publish를 await로 부르는데(2026-08-17 "스레드와 동시 실행" 지시), 그 안의
// waitForContainer가 컨테이너당 최대 60초씩 폴링한다. 스텁으로 막지 않으면 스위트가
// 21번 부근에서 사실상 끝나지 않고 뒤쪽 테스트가 한 번도 실행되지 않는다
// (2026-08-18 실측: 두 기기 모두 45건에서 멈춰 있었다).
// 프로덕션 코드에 테스트 전용 분기를 넣지 않으려고 require.cache에 스텁을 심는다.
const IG_PATH = require('path').resolve(__dirname, '../netlify/functions/instagram-publish.js');
function stubInstagram() {
  require.cache[IG_PATH] = {
    id: IG_PATH, filename: IG_PATH, loaded: true, exports: {
      handler: async () => ({ statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'test-stub' }) }),
    },
  };
}

function freshHandler() {
  delete require.cache[require.resolve(path)];
  stubInstagram();
  return require(path);
}

// scenario 기본값 — "오늘 게시 수 = 오늘 목표"로 맞춰 remaining=0 → postsThisRun=1이 실제 현재
// 시각과 무관하게 항상 결정되도록 한다(테스트 결정성 확보). adaptiveMinScore도 progress=1<=1이라
// 항상 FLOOR(55)로 고정된다.
//
// 2026-08-17: 하루 목표가 20~60 → 10~15로 바뀌면서 postedTotal을 25 → 15로 맞췄다.
// 25로 두면 목표(15)를 167% 초과한 상태가 되어 adaptiveMinScore가 72까지 올라가고,
// 그 결과 "정상 게시"를 검증하려던 테스트들이 전부 below_distribution_threshold로 떨어진다.
// 기사 250건 × 0.10 = 25 → 상한 15로 clamp되므로 목표는 15다.
async function run(scenario) {
  const s = Object.assign({
    pool: [], recentPosted: [], articleCount: 250, producedByCategory: {}, postedTotal: 15, postedByCategory: {},
  }, scenario);
  const patched = [];
  const postedIds = new Set();
  const skipLogRows = [];
  const runLogRows = [];
  const claudeRequests = [];

  const threadsPostRows = [];
  const commentRequests = [];

  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    // 시나리오가 "어떤 조회가 일어났는가" 자체를 검사할 수 있게 훅을 둔다
    // (예: 에버그린 OFF일 때 허브 조회를 아예 하지 않는지).
    if (s.onFetch) s.onFetch(url, method);

    // ── 2026-08-12 개편으로 추가된 조회들 ────────────────────────────────
    // threads_posts 계열은 topics의 'posted_at=gte.' 분기보다 먼저 걸러야 한다
    // (두 쿼리 모두 posted_at=gte.를 포함해서, 순서가 바뀌면 조용히 엉뚱한 답을 준다).
    if (url.includes('/hub-targets.json')) {
      return jsonRes(s.hubs || []);
    }
    if (method === 'HEAD' && url.includes('/rest/v1/threads_posts?')) {
      return headRes(s.evergreenPostedToday ?? 0);
    }
    if (method === 'GET' && url.includes('/rest/v1/threads_posts?')) {
      // dedup 조회(source_url like /hub/)와 "오늘 게시한 허브" 조회 둘 다 같은 형태로 답한다.
      if (s.dedupFetchFails) return { ok: false, text: async () => 'dedup fetch error' };
      return jsonRes((s.postedHubUrls || []).map((u) => ({ source_url: u })));
    }
    if (method === 'GET' && url.includes('/rest/v1/hub_documents?')) {
      const docs = s.hubDocs || [];
      if (url.includes('blocks')) {
        const hub = decodeURIComponent((url.match(/hub_slug=eq\.([^&]+)/) || [])[1] || '');
        const slug = decodeURIComponent((url.match(/[?&]slug=eq\.([^&]+)/) || [])[1] || '');
        const found = docs.find((d) => d.hub_slug === hub && d.slug === slug) || docs[0];
        return jsonRes(found ? [Object.assign({ lead: '리드 문장', blocks: [{ heading: '설정', content: '설정 방법 본문입니다. '.repeat(10) }] }, found)] : []);
      }
      return jsonRes(docs);
    }

    if (method === 'HEAD' && url.includes('/rest/v1/articles?')) {
      return headRes(s.articleCount);
    }
    if (method === 'HEAD' && url.includes('/rest/v1/topics?') && url.includes('status=eq.active')) {
      return headRes(s.activeTopicCount ?? 41);
    }
    if (method === 'GET' && url.includes('created_at=gte.')) {
      const rows = [];
      Object.entries(s.producedByCategory).forEach(([cat, n]) => { for (let i = 0; i < n; i++) rows.push({ category: cat }); });
      const total = Object.values(s.producedByCategory).reduce((a, b) => a + b, 0) || 200;
      while (rows.length < total) rows.push({ category: '기타' });
      return jsonRes(rows);
    }
    if (method === 'GET' && url.includes('posted_at=gte.')) {
      const rows = [];
      Object.entries(s.postedByCategory).forEach(([cat, n]) => { for (let i = 0; i < n; i++) rows.push({ category: cat }); });
      while (rows.length < s.postedTotal) rows.push({ category: '기타' });
      return jsonRes(rows.slice(0, s.postedTotal));
    }
    if (method === 'GET' && url.includes('posted_at=not.is.null')) {
      return jsonRes(s.recentPosted);
    }
    if (method === 'GET' && url.includes('posted_at=is.null')) {
      return jsonRes(s.pool.filter((t) => !postedIds.has(t.id)));
    }
    if (method === 'GET' && url.includes('select=ai_context')) {
      const id = decodeURIComponent(url.match(/id=eq\.([^&]+)/)[1]);
      const alreadyPosted = s.raceAlreadyPosted === id;
      return jsonRes(alreadyPosted ? [{ ai_context: { threads: { posted_at: new Date().toISOString() } } }] : [{ ai_context: {} }]);
    }
    if (method === 'PATCH' && url.includes('/rest/v1/topics?id=eq.')) {
      if (s.dedupSaveFails) return { ok: false, text: async () => 'dedup save error' };
      const id = decodeURIComponent(url.match(/id=eq\.([^&]+)/)[1]);
      postedIds.add(id);
      patched.push(JSON.parse(opts.body));
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('anthropic.com')) {
      claudeRequests.push(JSON.parse(opts.body));
      if (s.claudeFails) return { ok: false, text: async () => 'claude api error' };
      // claudeHook: 호출마다 'EMPTY'(빈 응답 재현) 또는 null(정상)을 돌려주게 해서
      // "첫 후보에서만 실패" 같은 시나리오를 만든다(2026-08-04 실측 사고 재현용).
      const hook = s.claudeHook ? s.claudeHook() : null;
      if (hook === 'EMPTY') return jsonRes({ content: [], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 0 } });
      return jsonRes({ content: [{ type: 'text', text: JSON.stringify({ text: s.claudeText || '배경과 쟁점을 설명하는 문장입니다. '.repeat(4) }) }] });
    }
    if (method === 'POST' && url.includes('/rest/v1/threads_posts')) {
      threadsPostRows.push(JSON.parse(opts.body));
      if (s.postLogFails) return { ok: false, text: async () => 'threads_posts insert error' };
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('/rest/v1/distribution_skip_log')) {
      skipLogRows.push(...JSON.parse(opts.body));
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('/rest/v1/distribution_run_log')) {
      runLogRows.push(JSON.parse(opts.body));
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('graph.threads.net') && url.includes('/threads_publish')) {
      if (s.threadsApiFails) return { ok: false, json: async () => ({ error: 'threads publish error' }) };
      return jsonRes({ id: (s.postIds && s.postIds[postedIds.size]) || s.postId || 'post-id-' + (postedIds.size + 1) });
    }
    if (method === 'POST' && url.includes('graph.threads.net')) {
      if (s.threadsApiFails) return { ok: false, json: async () => ({ error: 'threads container error' }) };
      const params = opts.body;
      const get = (k) => (typeof params?.get === 'function' ? params.get(k) : null);
      const replyTo = get('reply_to_id');
      if (replyTo) {
        // 링크 댓글 컨테이너 — 본문 컨테이너와 구분해 따로 모은다.
        commentRequests.push({ replyTo, text: get('text') });
        if (s.commentFails) return { ok: false, json: async () => ({ error: 'reply container error' }) };
        return jsonRes({ id: 'comment-container-1' });
      }
      return jsonRes({ id: 'container-1' });
    }
    throw new Error('예상치 못한 호출: ' + method + ' ' + url);
  };

  const mod = freshHandler();
  const res = await mod.handler({ httpMethod: 'POST', headers: { 'x-admin-key': 'real-admin-key' } });
  const body = JSON.parse(res.body);
  return { res, body, patched, first: body.results?.[0], skipLogRows, runLogRows, claudeRequests, threadsPostRows, commentRequests };
}

async function main() {
  // 1) Distribution Score 계산 → 고득점 후보가 성공 게시(이번 실행 성공 1건)
  {
    const t = makeTopic('t1', '정치A', '정치', 500);
    const { body, first } = await run({ pool: [t] });
    check('1) Distribution Score 계산 → 통과 후보 성공 게시', first?.ok === true && first.scoreDetail.distributionScore >= 55 && body.postsSucceededThisRun === 1);
  }

  // 2) 품질 기준 미달(본문 빈약) → below_quality_threshold — Distribution Score까지 가지 않고 차단
  {
    const thin = makeTopic('t2', '빈약한 글', '경제', 500, {
      ai_context: { draft: { lead: '짧음', blocks: [{ content: '짧다' }] }, evidence: { sources: [{ url: 'https://example.com/y' }] }, weight: {} },
    });
    const { first, body } = await run({ pool: [thin] });
    check('2) 본문 빈약 → below_quality_threshold Skip', first?.reason === 'below_quality_threshold' && body.postsSucceededThisRun === 0);
  }

  // 3) 후보 자체가 없을 때 no_candidate
  {
    const { first } = await run({ pool: [] });
    check('3) 후보 없음 → no_candidate Skip', first?.reason === 'no_candidate');
  }

  // 4) 카테고리 배분 엔진 — 오늘 많이 생산됐지만 아직 게시가 적은 분야(자동차)가, 생산은 적은데
  //    이미 많이 게시된 분야(경제)보다 우선 선택돼야 한다("감점"이 아니라 "배분" 로직 검증)
  {
    const car = makeTopic('t-car', '자동차 이슈', '자동차', 450);
    const eco = makeTopic('t-eco', '경제 이슈', '경제', 460); // 무게는 오히려 경제가 더 높음
    const { first } = await run({
      pool: [car, eco],
      producedByCategory: { 자동차: 80, 경제: 20 },
      postedTotal: 5, postedByCategory: { 경제: 5 },
    });
    check('4) 카테고리 배분(생산多·게시少 분야 우선) → 자동차 선택', first?.ok === true && first.topicId === 't-car');
  }

  // 5) 최근 3건 다양성 — 최근 3건 안에 등장한 카테고리는 감점되어 다른 분야로 전환
  {
    const politics = makeTopic('t-politics2', '정치 이슈2', '정치', 500);
    const tech = makeTopic('t-tech', 'IT 이슈', 'IT', 480);
    const recent = [
      { category: '경제', ai_context: { threads: { posted_at: new Date(Date.now() - 1000).toISOString() } } },
      { category: '정치', ai_context: { threads: { posted_at: new Date(Date.now() - 2000).toISOString() } } },
      { category: '사회', ai_context: { threads: { posted_at: new Date(Date.now() - 3000).toISOString() } } },
    ];
    const { first } = await run({ pool: [politics, tech], recentPosted: recent });
    check('5) 최근 3건 내 카테고리 반복 → IT로 전환', first?.ok === true && first.topicId === 't-tech');
  }

  // 6) 검색 의도 — SEARCH_GUIDE 후보가 DEEP_DIVE 후보보다 (다른 조건 동일 시) 우선
  {
    const guide = makeTopic('t-guide', '가이드 글', '생활정보', 400, { gate_status: 'SEARCH_GUIDE' });
    const deep = makeTopic('t-deep', '심층 글', '생활정보', 410, { gate_status: 'DEEP_DIVE' });
    const { first } = await run({ pool: [guide, deep] });
    check('6) 검색 의도(SEARCH_GUIDE) 우선 → guide 선택', first?.ok === true && first.topicId === 't-guide');
  }

  // 7) 예상 CTR — 숫자/비교 표현이 있는 제목이 밋밋한 제목보다 우선
  {
    const catchy = makeTopic('t-catchy', '전기차 vs 하이브리드, 5년 유지비 비교', '자동차', 400);
    const plain = makeTopic('t-plain', '자동차 관련 소식', '자동차', 405);
    const { first } = await run({ pool: [catchy, plain] });
    check('7) 예상 CTR(숫자·비교 표현) 우선 → catchy 선택', first?.ok === true && first.topicId === 't-catchy');
  }

  // 8) Topic Weight — 다른 조건이 동일하면 무게 높은 후보가 우선
  {
    const heavy = makeTopic('t-heavy', '무거운 이슈', '국제', 900);
    const light = makeTopic('t-light', '가벼운 이슈', '국제', 200);
    const { first } = await run({ pool: [heavy, light] });
    check('8) Topic Weight 높은 후보 우선 → heavy 선택', first?.ok === true && first.topicId === 't-heavy');
  }

  // 9) Exploration 가능성 — 이미 생성된 확장 앵글이 많은 후보가 (다른 조건 동일 시) 우선
  {
    const expanded = makeTopic('t-expanded', '확장된 글', '경제', 400, {
      ai_context: { ...makeTopic('x', '', '', 0).ai_context, expansion_drafts: [{ angle: 'guide' }, { angle: 'compare' }, { angle: 'faq' }] },
    });
    const bare = makeTopic('t-bare', '기본 글', '경제', 405);
    const { first } = await run({ pool: [expanded, bare] });
    check('9) Exploration 가능성 높은 후보 우선 → expanded 선택', first?.ok === true && first.topicId === 't-expanded');
  }

  // 10) 오늘 목표 계산 공식 직접 검증(articles 기준, clamp 20~20)
  //     2026-08-17 PM 결정: 20~60 → 10~15 → 최종 20 고정.
  //     20으로 고정한 근거는 카테고리 쿼터의 반올림이다 — 상한은 floor(비율 × 목표)인데
  //     목표 15면 15%×15=2.25→2로 깎여 7개 버킷 합이 13건(목표보다 2건 손실)이 된다.
  //     20이면 15%×20=3, 20%×20=4, 10%×20=2로 전부 정수라 손실 0, 합이 정확히 20이다.
  {
    const { computeDailyTarget } = require(path)._testUtils;
    const checks = [
      ['10-a) articles=0 → 최소 20', computeDailyTarget(0) === 20],
      ['10-b) articles=100 → 20(하한)', computeDailyTarget(100) === 20],
      ['10-c) articles=200 → 20', computeDailyTarget(200) === 20],
      ['10-d) articles=1000 → 20(상한)', computeDailyTarget(1000) === 20],
      ['10-e) 실제 생산량(540건) → 20', computeDailyTarget(540) === 20],
      // 쿼터 반올림 손실이 0인지 — 이 성질이 깨지면 목표를 올려도 게시가 안 늘어난다.
      ['10-f) 카테고리 상한 합계가 목표(20)와 정확히 일치', (() => {
        const { QUOTA_PLAN } = require('../netlify/functions/buzz-engine');
        const sum = QUOTA_PLAN.reduce((a, q) => a + Math.max(1, Math.floor(q.cap * 20)), 0);
        return sum === 20;
      })()],
    ];
    checks.forEach(([label, pass]) => check(label, pass));
  }

  // 11) 이번 실행 게시 건수 계산(남은 목표 ÷ 남은 실행 기회) 직접 검증
  //     2026-08-03: cron 30분 주기(RUNS_PER_HOUR=2)로 바뀌어 분모가 "남은 시간"에서
  //     "남은 시간 × 2"로 변경됐다 — 기대값도 그에 맞춰 갱신.
  {
    const { computePostsThisRun, MAX_POSTS_PER_RUN, CONFIGURED_RUNS_PER_HOUR } = require(path)._testUtils;
    const noon12hLeft = new Date('2026-07-22T12:00:00Z'); // UTC 12:00 → 남은 12시간
    const evening10hLeft = new Date('2026-07-22T14:00:00Z'); // UTC 14:00 → 남은 10시간
    const checks = [
      ['11-a) 목표24,게시0,12시간(24회)남음 → 실행당 1건', computePostsThisRun(24, 0, noon12hLeft, 2) === 1],
      ['11-b) 목표40,게시10,10시간(20회)남음 → 실행당 2건(남은 30÷20=1.5→2)', computePostsThisRun(40, 10, evening10hLeft, 2) === 2],
      ['11-c) 목표 이미 달성(remaining<=0) → 최소 1건은 시도', computePostsThisRun(20, 25, noon12hLeft, 2) === 1],
      [`11-d) 최대 ${MAX_POSTS_PER_RUN}건 상한 유지(아무리 남아도)`, computePostsThisRun(600, 0, noon12hLeft, 2) === MAX_POSTS_PER_RUN],
      ['11-e) 하루 끝자락(남은 1시간)에도 상한을 넘지 않음', computePostsThisRun(60, 0, new Date('2026-07-22T23:30:00Z'), 2) === MAX_POSTS_PER_RUN],
      ['11-f) runsPerHour 인자 생략 시 선언값으로 폴백', computePostsThisRun(40, 10, evening10hLeft) === computePostsThisRun(40, 10, evening10hLeft, CONFIGURED_RUNS_PER_HOUR)],
      // 실측 주기가 느릴 때(0.64회/시) 같은 목표라도 실행당 건수를 더 크게 잡아야 한다 —
      // 이게 08-03에 하루 누적 4건(목표 47)으로 끝난 원인이었다(선언값 2회/시로 3배 과대평가).
      // 2026-08-17: MAX_POSTS_PER_RUN이 6 → 2로 낮아지면서, 목표 47 같은 큰 값에서는 두 주기 모두
      // 상한(2)에 걸려 차이가 드러나지 않는다. 상한이 물리지 않는 목표(20)로 바꿔 같은 성질을 본다.
      ['11-h) 실측 0.64회/시면 같은 목표에서 더 많이 시도(선언값 2회/시보다 큼)',
        computePostsThisRun(20, 4, noon12hLeft, 0.64) > computePostsThisRun(20, 4, noon12hLeft, 2)],
      ['11-i) 실측 0.64회/시, 목표47·게시4, 12시간 남음 → 상한까지 시도',
        computePostsThisRun(47, 4, noon12hLeft, 0.64) === MAX_POSTS_PER_RUN],
    ];
    checks.forEach(([label, pass]) => check(label, pass));
  }

  // 11g) 스케줄 주기와 선언값(CONFIGURED_RUNS_PER_HOUR)이 어긋나지 않는지.
  //      실측 추정이 실패했을 때 쓰이는 폴백이므로 여전히 맞아야 한다. 둘이 갈라지면 각각은
  //      정상으로 보여서 알아채기 어렵기 때문에 스케줄 정의 파일을 직접 읽어 고정한다.
  //
  //      2026-08-04: 진실의 원천이 GitHub Actions에서 Supabase pg_cron으로 옮겨졌다.
  //      post-threads.yml에는 이제 schedule이 없고 원복용 주석으로만 cron이 남아 있어서,
  //      그 파일을 계속 읽으면 "주석을 읽고 통과하는" 무의미한 테스트가 된다.
  //      그래서 supabase/pg_cron_migration.sql의 nj-post-threads 등록문을 읽는다.
  {
    const fs = require('fs');
    const sql = fs.readFileSync(require('path').resolve(__dirname, '../supabase/pg_cron_migration.sql'), 'utf8');
    const { CONFIGURED_RUNS_PER_HOUR } = require(path)._testUtils;
    const m = sql.match(/cron\.schedule\('nj-post-threads',\s*'([^']+)'/);
    const cron = m ? m[1] : '';
    const everyN = cron.match(/^\*\/(\d+) \* \* \* \*$/);
    const expected = everyN ? 60 / Number(everyN[1]) : (/^\d+ \* \* \* \*$/.test(cron) ? 1 : null);
    check(
      `11g) pg_cron nj-post-threads('${cron}')이 CONFIGURED_RUNS_PER_HOUR(${CONFIGURED_RUNS_PER_HOUR})과 일치`,
      expected === CONFIGURED_RUNS_PER_HOUR
    );
    // 워크플로우에 활성 schedule이 되살아나면 이중 실행이 되므로 그것도 감지한다.
    // (주석 처리된 원복용 cron은 '#'로 시작하므로 걸리지 않는다)
    const yml = fs.readFileSync(require('path').resolve(__dirname, '../.github/workflows/post-threads.yml'), 'utf8');
    check(
      '11g-2) post-threads.yml에 활성 schedule이 없음(pg_cron과 이중 실행 방지)',
      !/^\s+schedule:\s*$/m.test(yml)
    );
  }

  // 11j) 실측 주기 추정 — 중앙값 기반, 표본 부족 시 폴백, 극단값에 흔들리지 않는지
  {
    const { estimateRunsPerHourFromLog, CONFIGURED_RUNS_PER_HOUR, MIN_RUNS_PER_HOUR, MAX_RUNS_PER_HOUR } = require(path)._testUtils;
    const mk = (gapsMin) => { // 최신순 timestamp 배열 생성
      let t = Date.parse('2026-08-04T12:00:00Z'); const out = [new Date(t).toISOString()];
      for (const g of gapsMin) { t -= g * 60000; out.push(new Date(t).toISOString()); }
      return out;
    };
    const checks = [
      ['11j) 표본 3개 미만이면 선언값 폴백', estimateRunsPerHourFromLog(['2026-08-04T12:00:00Z']).runsPerHour === CONFIGURED_RUNS_PER_HOUR],
      ['11j-b) 빈 배열/undefined도 폴백(예외 없음)', estimateRunsPerHourFromLog([]).runsPerHour === CONFIGURED_RUNS_PER_HOUR && estimateRunsPerHourFromLog(undefined).runsPerHour === CONFIGURED_RUNS_PER_HOUR],
      // 실측된 실제 패턴: 약 94분 간격 → 60/94 ≈ 0.64회/시
      ['11j-c) 94분 간격 → 약 0.64회/시로 추정', Math.abs(estimateRunsPerHourFromLog(mk([94, 94, 94, 94])).runsPerHour - 0.638) < 0.02],
      ['11j-d) 30분 간격 → 2회/시로 추정', Math.abs(estimateRunsPerHourFromLog(mk([30, 30, 30, 30])).runsPerHour - 2) < 0.01],
      // 수동 실행이 끼어 간격 하나가 1분이어도 중앙값이라 흔들리지 않아야 한다(평균이면 크게 틀어진다)
      ['11j-e) 극단값 1개(수동 실행)에 흔들리지 않음(중앙값)', Math.abs(estimateRunsPerHourFromLog(mk([94, 1, 94, 94])).runsPerHour - 0.638) < 0.02],
      ['11j-f) 비정상적으로 빠른 간격도 상한으로 클램프', estimateRunsPerHourFromLog(mk([1, 1, 1, 1])).runsPerHour === MAX_RUNS_PER_HOUR],
      ['11j-g) 비정상적으로 느린 간격도 하한으로 클램프', estimateRunsPerHourFromLog(mk([9999, 9999, 9999])).runsPerHour === MIN_RUNS_PER_HOUR],
      ['11j-h) 추정 근거(source)를 남겨 로그에서 확인 가능', /measured/.test(estimateRunsPerHourFromLog(mk([94, 94, 94])).source)],
    ];
    checks.forEach(([label, pass]) => check(label, pass));
  }

  // 11k) 시간 예산 가드 상수가 Netlify 한도(15분)보다 안전하게 낮은지 + 상한 건수와 정합적인지
  {
    const { RUN_BUDGET_MS, PER_POST_ESTIMATE_MS, MAX_POSTS_PER_RUN } = require(path)._testUtils;
    check('11k) RUN_BUDGET_MS가 Netlify 15분 한도보다 낮음', RUN_BUDGET_MS < 15 * 60 * 1000);
    check(
      `11k-b) 예산 가드가 실제로 상한을 제약함(상한 ${MAX_POSTS_PER_RUN}건은 예산만으론 다 못 채울 수 있어 가드가 필요)`,
      PER_POST_ESTIMATE_MS > 0 && RUN_BUDGET_MS > PER_POST_ESTIMATE_MS * 2
    );
  }

  // 12) 적응형 임계값 — 오늘 목표치를 초과했으면 평범한 후보는 Skip(below_distribution_threshold),
  //     정말 뛰어난 후보는 여전히 통과(하드 컷오프가 아님을 함께 확인)
  {
    const mediocre = makeTopic('t-mediocre', '평범한 글', '경제', 300);
    const { first } = await run({ pool: [mediocre], postedTotal: 40 }); // 목표 25 대비 60% 초과 게시된 상태
    check('12-a) 목표 초과 상태에서 평범한 후보 → below_distribution_threshold', first?.reason === 'below_distribution_threshold');

    const excellentBase = makeTopic('t-excellent', '국제 1위 이슈 vs 대안, 비교', '국제', 950, { gate_status: 'SEARCH_GUIDE' });
    const excellent = Object.assign(excellentBase, {
      ai_context: {
        ...excellentBase.ai_context,
        draft: { ...excellentBase.ai_context.draft, perspective_markers: [{ perspective: 'A', claim: '주장1' }, { perspective: 'B', claim: '주장2' }] },
        expansion_drafts: [{ angle: 'guide' }, { angle: 'compare' }, { angle: 'faq' }],
      },
    });
    const { first: first2 } = await run({
      pool: [excellent], postedTotal: 40,
      producedByCategory: { 국제: 50 }, postedByCategory: { 경제: 40 },
    });
    check('12-b) 목표 초과 상태여도 탁월한 후보는 통과(하드컷오프 아님)', first2?.ok === true && first2.topicId === 't-excellent');
  }

  // 13) 이미지 null 상태에서도 정상 게시(이미지 필드를 아예 참조하지 않음)
  {
    const noImage = makeTopic('t-noimg', '이미지 없는 글', '사회', 400);
    delete noImage.og_image_url;
    const { first } = await run({ pool: [noImage] });
    check('13) 이미지 필드 없음 → 정상 게시(오류 아님)', first?.ok === true && !!first.postId);
  }

  // 14) Claude 실패 처리
  {
    const t = makeTopic('t-claudefail', '글', '경제', 400);
    const { first } = await run({ pool: [t], claudeFails: true });
    check('14) Claude 실패 → claude_failed', first?.reason === 'claude_failed');
  }

  // 15) Threads API 실패 처리
  {
    const t = makeTopic('t-threadsfail', '글', '경제', 400);
    const { first } = await run({ pool: [t], threadsApiFails: true });
    check('15) Threads API 실패 → threads_api_failed', first?.reason === 'threads_api_failed');
  }

  // 16) dedup 저장 확인 — 게시 성공 시 topics.ai_context.threads에 posted_at/post_id 기록
  {
    const t = makeTopic('t-dedup', '글', '경제', 400);
    const { first, patched } = await run({ pool: [t], postId: 'real-post-id-999' });
    const savedThreads = patched[0]?.ai_context?.threads;
    check('16) dedup 저장 확인(ai_context.threads.post_id 기록)', first?.ok === true && savedThreads?.post_id === 'real-post-id-999' && !!savedThreads?.posted_at);
  }

  // 17) dedup 저장 실패 시 postId 보존 + dedup_save_failed 반환(게시 자체는 이미 성공한 상태)
  {
    const t = makeTopic('t-dedupfail', '글', '경제', 400);
    const { first } = await run({ pool: [t], dedupSaveFails: true, postId: 'post-before-dedup-fail' });
    check('17) dedup 저장 실패 → dedup_save_failed, postId 보존', first?.reason === 'dedup_save_failed' && first.postId === 'post-before-dedup-fail');
  }

  // 18) ai_context.engines.distribution 저장 확인(version/score/components/channel/calculated_at)
  {
    const t = makeTopic('t-distsave', '글', '경제', 400);
    const { first, patched } = await run({ pool: [t], postId: 'post-for-dist-save' });
    const saved = patched[0]?.ai_context?.engines?.distribution;
    check(
      '18) ai_context.engines.distribution 저장',
      first?.ok === true && saved && saved.version === 1 && saved.score === first.scoreDetail.distributionScore &&
      typeof saved.components?.editorial_score === 'number' && saved.channel === 'threads' && !!saved.calculated_at
    );
  }

  // 19) 레이스 컨디션 — 선택 직후 다른 실행이 먼저 게시했으면 duplicate_topic으로 재차단
  {
    const t = makeTopic('t-race', '글', '경제', 400);
    const { first } = await run({ pool: [t], raceAlreadyPosted: 't-race' });
    check('19) 레이스 컨디션 재확인 → duplicate_topic Skip', first?.reason === 'duplicate_topic');
  }

  // 20) 회귀 픽스처 — 실제 성공한 Post ID(18081263792288677)로 게시 성공 응답이 그 값을 그대로 반환
  {
    const t = makeTopic('iran-tanker-attack-war-fears', '이란 유조선 공격 및 전쟁 우려', '국제', 480);
    const { first } = await run({ pool: [t], postId: '18081263792288677' });
    check('20) 회귀 픽스처(Post ID 18081263792288677) 그대로 반환', first?.ok === true && first.postId === '18081263792288677');
  }

  // 21) 회귀 픽스처 — 두 번째 실제 게시(18122769340814327)가 배분 로직 적용 후에도 정상 처리되는지
  {
    const t2 = makeTopic('choe-son-hui-moscow-visit', '최선희 북한 외무상 러시아 방문', '국제', 470);
    const recent = [{ category: '국제', ai_context: { threads: { posted_at: new Date().toISOString() } } }];
    const other = makeTopic('other-domestic', '국내 이슈', '경제', 460);
    const { first } = await run({ pool: [t2, other], recentPosted: recent, postId: '18122769340814327' });
    check('21) 회귀 픽스처(두 번째 실제 게시) 배분 적용 후 정상 처리', first?.ok === true && first.postId === '18122769340814327');
  }

  // 22) 자격증명 없음 — Claude/Threads API 호출 전에 즉시 credential_missing으로 차단(top-level, statusCode 500)
  {
    delete process.env.THREADS_USER_ID;
    const t = makeTopic('t-nocred', '글', '경제', 400);
    const { res, body } = await run({ pool: [t] });
    check('22) 자격증명 없음 → credential_missing, Claude 호출 전 차단', res.statusCode === 500 && body.reason === 'credential_missing');
    process.env.THREADS_USER_ID = 'fake-user';
  }

  // 23) 1회 실행 다건 게시 — 남은 목표가 충분하면 상한까지, 서로 다른 Topic을 순차 게시.
  //     2026-08-03: 예전엔 "항상 3건"으로 단정할 수 있었다(구 공식에선 remaining=60이면 시간대와
  //     무관하게 3이 나왔다). 30분 주기로 분모가 바뀐 뒤엔 실행 시각에 따라 2~4건으로 달라지므로,
  //     기대값을 상수로 박지 않고 같은 함수로 계산해 비교한다(시간대 무관하게 결정적).
  //     remaining=60 기준 최소값이 2(하루 시작 시점: 60÷48)이므로 다건 게시 경로는 항상 검증된다.
  {
    const { computePostsThisRun } = require(path)._testUtils;
    // 2026-08-17: dailyTarget clamp가 20~60 → 10~15로 바뀌었다. articleCount=600이면
    // 600×0.10=60 → 상한 15로 clamp되므로 기대값도 15 기준으로 계산해야 한다(60을 그대로 두면
    // 코드가 쓰는 목표와 어긋나 항상 실패한다).
    const expected = computePostsThisRun(15, 0);
    // 후보를 실행당 상한(MAX_POSTS_PER_RUN=6)만큼 채운다. 예전엔 4개만 뒀는데 expected는 실행
    // 시각에 따라 2~6으로 달라져서, 하루 끝 무렵에는 후보가 모자라 실패했다 — 코드가 아니라
    // 테스트가 시간에 의존하던 결함이다(실측: 2026-08-12 22:26 UTC에서 expected=6, 후보 4).
    const pool = [
      makeTopic('t-multi-1', '정치 이슈', '정치', 500),
      makeTopic('t-multi-2', '경제 이슈', '경제', 490),
      makeTopic('t-multi-3', 'IT 이슈', 'IT', 480),
      makeTopic('t-multi-4', '문화 이슈', '문화', 470),
      makeTopic('t-multi-5', '사회 이슈', '사회', 460),
      makeTopic('t-multi-6', '국제 이슈', '국제', 450),
    ];
    const { body, patched } = await run({ pool, articleCount: 600, postedTotal: 0 });
    const distinctTopics = new Set(body.results.map((r) => r.topicId));
    check(
      // expected >= 2 요구를 뺀 이유: 하루 목표가 15로 줄어 하루 끝 무렵에는 실행당 1건이
      // 정상값이 된다(remaining 15 ÷ 남은 실행 기회). 다건 경로 자체는 11-a~11-i 유닛이 고정한다.
      // 여기서 지켜야 할 것은 "계산된 건수만큼, 서로 다른 Topic으로, 실제로 게시되는가"다.
      `23) 1회 실행에서 ${expected}건 게시(상한 내), 서로 다른 Topic 선택`,
      expected >= 1 && body.postsAttemptedThisRun === expected && body.postsSucceededThisRun === expected &&
      distinctTopics.size === expected && patched.length === expected
    );
  }

  // 23b) 실행시간이 Netlify Background Function 한도(15분) 안에서 끝나는지.
  //      2026-08-04 재작성: 상한을 6건으로 올리면서 안전장치가 "정적 상한 x 간격 산술"에서
  //      "실행 중 경과시간 가드(RUN_BUDGET_MS)"로 바뀌었다. 6건 x 최대간격 3분은 산술로는
  //      17분이라 예산을 넘지만, 가드가 예산 도달 시 스스로 멈추므로 실제로는 넘지 않는다.
  //      그래서 검증 대상도 가드 자체의 건전성이어야 한다.
  //
  //      가드는 대기 전에 `경과 + 대기 + 건당추정 <= 예산`을 확인하므로, 통과한 게시가 끝난
  //      시점의 경과는 (실제 소요 <= 추정인 한) 예산을 넘지 않는다. 따라서 전체 실행시간의
  //      상한은 대략 예산 + 추정보다 오래 걸린 마지막 한 건이다 — 그 합이 15분 미만이어야 한다.
  //      주의: 이 파일 맨 위에서 POST_GAP_*_MS를 테스트용으로 5~10ms로 덮어쓰므로, 간격 관련
  //      검사는 운영 기본값으로 다시 로드해서 해야 한다(안 하면 무의미하게 통과한다).
  {
    const savedMin = process.env.POST_GAP_MIN_MS;
    const savedMax = process.env.POST_GAP_MAX_MS;
    delete process.env.POST_GAP_MIN_MS;
    delete process.env.POST_GAP_MAX_MS;
    const prod = freshHandler()._testUtils; // 운영 기본값(2~3분)으로 로드된 모듈
    process.env.POST_GAP_MIN_MS = savedMin;
    process.env.POST_GAP_MAX_MS = savedMax;

    const PLATFORM_LIMIT_MS = 15 * 60 * 1000;
    const worstCaseMs = prod.RUN_BUDGET_MS + prod.PER_POST_ESTIMATE_MS;
    check(
      `23b) 가드 기준 최악 실행시간 ${(worstCaseMs / 60000).toFixed(2)}분 < 플랫폼 한도 15분` +
      ` (예산 ${prod.RUN_BUDGET_MS / 60000}분 + 건당추정 ${prod.PER_POST_ESTIMATE_MS / 1000}초)`,
      worstCaseMs < PLATFORM_LIMIT_MS
    );
    check(
      '23b-2) 운영 간격이 실제 분 단위값(테스트 오버라이드가 아닌 값으로 검사됐는지)',
      prod.MIN_GAP_MS >= 60 * 1000 && prod.MAX_GAP_MS >= prod.MIN_GAP_MS
    );
    // 상한을 6건까지 올려둔 것이 의미가 있으려면, 예산 안에서 최소 몇 건은 실제로 소화돼야 한다.
    // (간격 최소값 기준으로 계산 — 최악이 아니라 "정상적인 경우 몇 건 가능한가")
    const feasibleAtMinGap = Math.floor(prod.RUN_BUDGET_MS / (prod.MIN_GAP_MS + prod.PER_POST_ESTIMATE_MS));
    check(
      `23b-3) 최소간격 기준 예산 안에서 ${feasibleAtMinGap}건 소화 가능(상한 ${prod.MAX_POSTS_PER_RUN}건이 과도하지 않음)`,
      feasibleAtMinGap >= 3
    );
  }

  // 24) 후보 소진 시 조기 중단 — 목표는 충분히 남았지만(3건 시도 가능) 후보가 1개뿐이면 1건만
  //     게시하고 억지로 채우지 않고 중단(no_candidate로 자연 종료)
  {
    // 2026-08-17: 시도 건수를 2로 하드코딩하고 있었는데, 하루 목표가 15로 줄면서 실행 시각에
    // 따라 실행당 1건이 정상값이 됐다. 시각에 의존하지 않도록 기대값을 코드와 같은 식으로 구한다.
    const { computePostsThisRun } = require(path)._testUtils;
    const expected = computePostsThisRun(15, 0);
    const only = makeTopic('t-only-one', '단일 후보', '사회', 500);
    const { body } = await run({ pool: [only], articleCount: 600, postedTotal: 0 });
    check(
      `24) 후보 소진 시 조기 중단(억지로 채우지 않음, 이번 실행 시도 ${expected}건)`,
      expected >= 2
        // 2건 이상 시도할 수 있는 시각이면: 1건 성공 후 후보가 없어 두 번째에서 멈춰야 한다
        ? body.postsAttemptedThisRun === expected && body.postsSucceededThisRun === 1 && body.results[1].reason === 'no_candidate'
        // 1건만 시도하는 시각이면: 그 1건이 성공하고 끝나는 것이 정상(조기 중단할 여지가 없다)
        : body.postsAttemptedThisRun === 1 && body.postsSucceededThisRun === 1
    );
  }

  // 25) 탈락 후보 로그 — 품질 미달/배급 문턱 미달 후보가 distribution_skip_log에 사유·점수와 함께 기록되는지
  {
    const winner = makeTopic('t-log-winner', '당첨 후보', '정치', 500);
    const thin = makeTopic('t-log-thin', '빈약 후보', '경제', 500, {
      ai_context: { draft: { lead: '짧음', blocks: [{ content: '짧다' }] }, evidence: { sources: [{ url: 'https://example.com/y' }] }, weight: {} },
    });
    const { skipLogRows } = await run({ pool: [winner, thin] });
    const thinRow = skipLogRows.find((r) => r.topic_id === 't-log-thin');
    check('25) 품질 미달 후보가 distribution_skip_log에 reason=quality_threshold로 기록', thinRow?.reason === 'quality_threshold' && typeof thinRow.editorial_score === 'number');
  }

  // 26) 시간대별 목표/실적 로그 — 매 실행마다 distribution_run_log에 목표/시도/성공 건수가 기록되는지
  {
    const t = makeTopic('t-runlog', '글', '경제', 400);
    const { runLogRows, body } = await run({ pool: [t] });
    const row = runLogRows[0];
    check(
      '26) distribution_run_log에 목표/시도/성공 건수 기록',
      row && row.channel === 'threads' && row.daily_target === body.dailyTarget &&
      row.posts_attempted === body.postsAttemptedThisRun && row.posts_succeeded === body.postsSucceededThisRun
    );
  }

  // 27) 링크 위치 — 2026-08-12 개편으로 링크가 본문에서 첫 댓글로 내려갔다.
  //     본문은 링크 없이 읽어도 완결이어야 하고, 링크는 반드시 댓글로 나가야 한다.
  {
    const t = makeTopic('t-closing', '글', '경제', 400);
    const { first, commentRequests } = await run({ pool: [t], activeTopicCount: 41 });
    check(
      '27) ★ 본문에는 링크가 없고, 링크는 첫 댓글(reply_to_id)로 나감',
      first?.ok === true &&
      !first.text.includes('http') &&
      commentRequests.length === 1 &&
      commentRequests[0].replyTo === first.postId &&
      commentRequests[0].text.includes(first.url)
    );
    check(
      '27b) 활성 이슈 개수 안내가 댓글 라벨에 유지됨(수치는 실제 조회값)',
      commentRequests[0]?.text.includes('오늘 다루는 이슈 41개')
    );
    check(
      '27c) 게시 결과에 댓글 성공 여부가 기록됨',
      first?.commentOk === true && typeof first.commentPostId === 'string'
    );
  }

  // 28) UTM은 source/medium 최소 조합만 — utm_campaign/utm_content는 본문 예산만 잡아먹어 제거했다
  //     (2026-08-03). hook_type 접미사가 없어야 한다는 기존 요구(2026-07-29)도 함께 유지 검증.
  {
    const t = makeTopic('t-utm', '글', '경제', 400);
    const { first } = await run({ pool: [t] });
    check(
      '28) UTM이 source/medium만 담고 utm_campaign/utm_content/hook_type 접미사가 없음',
      first?.ok === true &&
      first.url.includes('utm_source=threads') && first.url.includes('utm_medium=social') &&
      !first.url.includes('utm_campaign') && !first.url.includes('utm_content')
    );
  }

  // ── 길이·링크 회귀 테스트(2026-08-03 사고 → 2026-08-12 개편으로 계약이 바뀜) ─────
  // 옛 계약: 본문 끝에 링크를 붙이므로 "본문이 길어도 링크는 남아야 한다"가 핵심이었다.
  // 새 계약: 링크는 댓글로 갔다. 그래서 고정해야 하는 것은 두 가지로 갈린다 —
  //   (1) 본문은 링크가 없고 500자를 넘지 않는다,
  //   (2) 링크는 본문 길이와 무관하게 항상 댓글에 온전히 나간다(본문이 잘려도 영향 없음).

  // 29) 본문이 예산을 크게 넘겨도 500자 이내로 마감되고, 링크는 댓글에서 온전한지
  {
    const t = makeTopic('t-longbody', '글', '경제', 400);
    const { first, commentRequests } = await run({ pool: [t], claudeText: '아주 긴 배경 설명 문장입니다. '.repeat(60) }); // 약 1000자
    check(
      `29) 본문 1000자여도 500자 이내로 마감(실측 ${first?.text?.length}자) + 본문에 링크 없음`,
      first?.ok === true && first.text.length <= 500 && !first.text.includes('http')
    );
    // 2026-08-17: 참여 유도(CTA)가 링크 뒤에 붙으면서 "링크로 끝난다"는 조건은 더 이상 성립하지
    // 않는다. 이 테스트가 지키려던 것은 "본문이 잘려도 링크만은 온전하다"이므로, 끝 위치가 아니라
    // 링크가 훼손 없이 들어있는지를 본다.
    check(
      '29b) 본문이 잘려도 링크는 댓글에 온전히 들어있음',
      commentRequests.some((c) => c.text.includes(first.url))
    );
  }

  // 30) slug가 비정상적으로 길어도(옛 구조에선 본문 예산을 잡아먹던 조건) 링크가 온전한지.
  //     이제 slug 길이는 본문 예산과 무관하다 — 그 독립성 자체를 고정한다.
  {
    const t = makeTopic('t-longslug', '글', '경제', 400, { slug: 'a'.repeat(200) });
    const { first, commentRequests } = await run({ pool: [t], claudeText: '긴 본문입니다. '.repeat(50) });
    check(
      `30) slug 200자여도 본문 예산이 줄지 않고(실측 ${first?.text?.length}자) 댓글 링크 온전`,
      first?.ok === true && first.text.length > 400 && commentRequests[0]?.text.includes(first.url)
    );
  }

  // 31) 짧은 본문은 잘리지 않고 그대로 나가는지(과잉 절단 방지)
  {
    const t = makeTopic('t-shortbody', '글', '경제', 400);
    const short = '핵심만 담은 짧은 본문입니다. 두 번째 문장입니다.';
    const { first, commentRequests } = await run({ pool: [t], claudeText: short, activeTopicCount: 41 });
    check(
      '31) 짧은 본문은 원문 그대로(불필요한 절단·유도문구 추가 없음)',
      first?.ok === true && first.text === short && commentRequests[0]?.text.includes(first.url)
    );
  }

  // 32) 문장 경계 절단 — 예산을 넘길 때 문장 중간에서 끊지 않는지(순수 함수 직접 검증)
  {
    const { truncateAtSentenceBoundary } = freshHandler()._testUtils;
    const src = '첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.';
    const cut = truncateAtSentenceBoundary(src, 30);
    check(
      `32) 예산 초과 시 문장 종결부까지만 남김(결과: "${cut}")`,
      cut === '첫 번째 문장입니다. 두 번째 문장입니다.' && cut.length <= 30
    );
    check(
      '32b) 예산 이내면 원문 그대로 반환',
      truncateAtSentenceBoundary(src, 500) === src
    );
    // 2026-08-03: 이 테스트가 원래 `r.length <= 13`(budget+1)을 허용해서 off-by-one을 놓쳤다.
    // 말줄임표도 예산에 포함되는 문자이므로 budget을 초과하면 안 된다 — 엄격하게 검사한다.
    check(
      '32c) 한 문장이 예산보다 길면 말줄임표로 마감하되 예산을 넘지 않음',
      (() => { const r = truncateAtSentenceBoundary('종결부가 아주 늦게 오는 매우 긴 한 문장입니다', 12); return r.length <= 12 && r.endsWith('…'); })()
    );
    // 32e) 불변식 전수 검사 — 위 32c 같은 개별 케이스는 경계를 한 군데만 본다. 종결부 유무·
    //      위치·공백 패턴을 섞은 입력을 모든 예산값에 대해 돌려 "절대 budget 초과 없음"을 고정한다.
    //      실제 사고가 "말줄임표 분기에서만 +1"이었으므로 분기별 커버리지가 필요하다.
    {
      const samples = [
        '종결부가 전혀 없는 아주 긴 한 문장 텍스트입니다만 마침표가 없습니다',
        '짧다. 그리고 뒤가 아주 아주 길게 이어지는 두 번째 문장입니다',
        '가나다라마바사아자차카타파하가나다라마바사아자차카타파하',
        '끝에 공백이 오는 경우입니다.   그 다음 문장.   ',
        '지지율은 49.6% 수준으로 나타났다. 다음 문장입니다.',
        '쉼표로 끝나는 경우, 그리고 더 긴 내용, 계속 이어짐, 끝없이',
      ];
      let over = 0, empty = 0;
      for (const s of samples) {
        for (let budget = 1; budget <= 60; budget++) {
          const r = truncateAtSentenceBoundary(s, budget);
          if (r.length > budget) { over++; console.log(`   위반: budget=${budget} → ${r.length}자 "${r}" (원문: ${s.slice(0, 12)}…)`); }
          if (s.trim().length > 0 && budget >= 3 && r.length === 0) empty++;
        }
      }
      check(`32e) 불변식: 입력 ${samples.length}종 x 예산 1~60 전수(${samples.length * 60}건) 모두 budget 초과 없음`, over === 0);
      check('32f) 예산이 3자 이상이면 빈 문자열을 반환하지 않음', empty === 0);
    }
    check(
      '32d) 소수점을 문장 종결부로 오인하지 않음',
      !truncateAtSentenceBoundary('지지율은 49.6% 수준으로 나타났다. 다음 문장입니다.', 22).endsWith('49.')
    );
  }

  // 33) 하드 실패도 distribution_skip_log에 사유가 남는지(2026-08-03 추가)
  //     이 로그가 없어서 posts_succeeded=0인 실행 3건의 원인을 DB로 특정할 수 없었다.
  {
    const t = makeTopic('t-claudefail', '글', '경제', 400);
    const { skipLogRows, first } = await run({ pool: [t], claudeFails: true });
    const row = skipLogRows.find((r) => r.reason === 'claude_failed');
    check(
      '33) Claude 실패 시 skip_log에 reason=claude_failed + 에러 메시지 기록',
      first?.reason === 'claude_failed' && !!row && row.topic_name === '글' && typeof row.detail?.error === 'string' && row.detail.error.length > 0
    );
  }
  {
    const t = makeTopic('t-threadsfail', '글', '경제', 400);
    const { skipLogRows, first } = await run({ pool: [t], threadsApiFails: true });
    const row = skipLogRows.find((r) => r.reason === 'threads_api_failed');
    check(
      '33b) Threads API 실패 시 skip_log에 reason=threads_api_failed 기록',
      first?.reason === 'threads_api_failed' && !!row && typeof row.detail?.error === 'string'
    );
  }
  {
    const t = makeTopic('t-dedupfail', '글', '경제', 400);
    const { skipLogRows, first } = await run({ pool: [t], dedupSaveFails: true });
    const row = skipLogRows.find((r) => r.reason === 'dedup_save_failed');
    check(
      '33c) dedup 저장 실패 시 skip_log에 기록 + 게시된 Post ID 보존',
      first?.reason === 'dedup_save_failed' && !!row && !!row.detail?.postId
    );
  }

  // 34) 후보 단위 실패 시 다른 후보로 재시도하는지(2026-08-04 실측 사고 회귀 테스트)
  //     사고: Claude가 빈 응답을 한 번 주자(claude_failed) 후보가 165건 남아 있는데도
  //     그 실행이 0건으로 끝났다. 어떤 실패든 무조건 break였기 때문이다.
  {
    // 첫 Claude 호출만 실패하고 그 뒤로는 성공하게 만든다.
    let claudeCalls = 0;
    const t1 = makeTopic('t-fail-first', '실패할 후보', '경제', 500);
    const t2 = makeTopic('t-ok-second', '성공할 후보', '사회', 490);
    const { body, patched } = await run({
      // 2026-08-17: postedTotal 25 → 15(새 목표와 동일). 25로 두면 목표를 167% 초과한 상태라
      // 적응형 문턱이 72로 올라가 재시도 후보까지 전부 탈락한다 — 검증하려는 것은 재시도 동작이지
      // 문턱 동작이 아니므로 목표와 같은 값으로 맞춘다.
      pool: [t1, t2], articleCount: 250, postedTotal: 15,
      claudeHook: () => { claudeCalls++; return claudeCalls === 1 ? 'EMPTY' : null; },
    });
    const posted = body.results.filter((r) => r.ok);
    check(
      '34) Claude가 첫 후보에서 빈 응답이어도 다른 후보로 재시도해 게시한다',
      posted.length === 1 && posted[0].topicId === 't-ok-second' && patched.length === 1
    );
    check(
      '34b) 실패한 후보를 다시 고르지 않는다(같은 실패 반복 방지)',
      body.results.filter((r) => r.reason === 'claude_failed').length === 1
    );
  }

  // 35) 시스템성 실패(threads_api_failed)는 재시도하지 않고 중단하는지
  //     계정·API 차원의 문제라 다른 후보로도 실패한다 — 재시도는 Claude 비용만 낭비한다.
  {
    const t1 = makeTopic('t-api-1', '후보1', '경제', 500);
    const t2 = makeTopic('t-api-2', '후보2', '사회', 490);
    const { body } = await run({ pool: [t1, t2], threadsApiFails: true });
    check(
      '35) threads_api_failed는 재시도 없이 즉시 중단(비용 낭비 방지)',
      body.results.length === 1 && body.results[0].reason === 'threads_api_failed'
    );
  }

  // 36) 후보 단위 실패가 계속되면 재시도 상한에서 멈추는지(무한 재시도 방지)
  {
    const pool = [1, 2, 3, 4, 5, 6].map((n) => makeTopic('t-allfail-' + n, '후보' + n, '경제', 500 - n));
    const { body } = await run({ pool, claudeFails: true });
    const { MAX_CANDIDATE_RETRIES } = require(path)._testUtils;
    check(
      `36) 후보 단위 실패가 반복되면 최초 1회 + 재시도 ${MAX_CANDIDATE_RETRIES}회에서 멈춤`,
      body.results.length === MAX_CANDIDATE_RETRIES + 1 && body.results.every((r) => r.reason === 'claude_failed')
    );
  }

  // 37) 품질 미달 등 "다시 시도해도 같은" 사유는 재시도하지 않는지
  {
    const thin = makeTopic('t-thin-2', '빈약', '경제', 100, {
      ai_context: { draft: { lead: '짧음', blocks: [{ axis: 'a', content: '짧다' }] }, evidence: { sources: [{ url: 'https://x.com' }] } },
    });
    const { body } = await run({ pool: [thin] });
    check(
      '37) 품질 미달은 재시도 없이 1회로 종료(결과가 달라지지 않는 사유)',
      body.results.length === 1 && body.results[0].skipped === true
    );
  }

  // ── 2026-08-06 claude_failed 70건 사고 회귀 테스트 ──────────────────────────
  // 증상: 응답이 {"stop_reason":"max_tokens","blockTypes":["thinking"],"rawLen":0}.
  // claude-sonnet-5는 thinking을 생략하면 adaptive thinking이 켜지고, max_tokens는
  // thinking+텍스트 합계 상한이라 800토큰을 thinking이 다 먹어 본문이 0바이트로 왔다.
  {
    const t = makeTopic('t-cfg', '설정검증', '경제', 500);
    const { claudeRequests } = await run({ pool: [t] });
    const req = claudeRequests[0];
    check(
      '38) ★ 본문 생성 호출이 thinking을 명시적으로 끈다 (thinking이 max_tokens를 삼키던 사고)',
      req && req.thinking && req.thinking.type === 'disabled'
    );
    check(
      '39) ★ max_tokens가 800에서 올라가 있다 (잘림 여유)',
      req && req.max_tokens >= 2000
    );
    check(
      '40) budget_tokens를 보내지 않는다 (sonnet-5에서 제거된 파라미터 — 400을 낸다)',
      req && req.thinking.budget_tokens === undefined && req.budget_tokens === undefined
    );
  }

  // ══ 2026-08-12 전면 개편 회귀 테스트(PM 지시 5개 항목) ═══════════════════
  // 결정성 확보 방법: 시각(KST)에 의존하는 분기를 테스트에서 직접 흔들지 않고, 시각과 무관하게
  // 결과가 고정되는 두 입력만 쓴다 —
  //   · 신규 문서(48h 내)가 대기 중이면 항상 에버그린 우선(freshDocTrigger)
  //   · 오늘 에버그린 비중이 상한(40%) 이상이면 항상 뉴스 우선
  // 그래서 이 테스트들은 실행 시각이 새벽이든 저녁이든 같은 결과를 낸다.
  const nowIso = new Date().toISOString();
  const oldIso = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const makeDoc = (hub, slug, format, created) => ({ hub_slug: hub, slug, format, title: `${slug} 가이드`, created_at: created || oldIso, status: 'published' });
  const FOLD_HUB = { slug: 'galaxy-z-fold8', title: '갤럭시 Z 폴드8', newsKeywords: ['갤럭시 Z 폴드8', '폴드8'], newsExclude: ['폴드7'] };

  // 41) 에버그린 게시 경로 — 신규 문서가 대기 중이면 뉴스가 아니라 허브 문서가 나간다.
  {
    const t = makeTopic('t-ever-news', '일반 뉴스', '경제', 500);
    const doc = makeDoc('galaxy-z-fold8', 'battery-setting', 'howto', nowIso);
    const { body, first, threadsPostRows, commentRequests } = await run({
      pool: [t], hubs: [FOLD_HUB], hubDocs: [doc],
    });
    check(
      '41) ★ 신규 허브 문서 트리거 → 에버그린 게시(뉴스보다 우선)',
      first?.ok === true && first.type === 'evergreen' && first.hubSlug === 'galaxy-z-fold8' && body.evergreenThisRun === 1
    );
    check(
      '41b) 에버그린은 topics가 아니라 threads_posts에 hook_type=evergreen으로 기록(dedup 정본)',
      threadsPostRows.some((r) => r.hook_type === 'evergreen' && r.topic_id === null && r.source_url.includes('/hub/galaxy-z-fold8/battery-setting'))
    );
    check(
      '41c) 에버그린 댓글에 문서 링크 + 허브 링크가 함께 나감',
      commentRequests[0]?.text.includes('/hub/galaxy-z-fold8/battery-setting') &&
      commentRequests[0]?.text.includes('/hub/galaxy-z-fold8?')
    );
  }

  // 42) 에버그린 dedup — 이미 게시된 문서는 다시 뽑히지 않는다(threads_posts.source_url이 정본)
  {
    const t = makeTopic('t-dedup-news', '일반 뉴스', '경제', 500);
    const posted = makeDoc('galaxy-z-fold8', 'battery-setting', 'howto', nowIso);
    const { first } = await run({
      pool: [t], hubs: [FOLD_HUB], hubDocs: [posted],
      postedHubUrls: ['https://newsjeoul.co.kr/hub/galaxy-z-fold8/battery-setting?utm_source=threads&utm_medium=social'],
    });
    check(
      '42) ★ 이미 게시된 허브 문서는 재선택되지 않고 뉴스로 넘어감',
      first?.ok === true && first.type !== 'evergreen'
    );
  }

  // 43) 포맷 우선순위 — 같은 조건이면 사용법(howto)이 구매(buying)보다 먼저 나간다(PM 지시 §2)
  {
    const t = makeTopic('t-fmt-news', '일반 뉴스', '경제', 500);
    const { first } = await run({
      pool: [t], hubs: [FOLD_HUB],
      hubDocs: [makeDoc('galaxy-z-fold8', 'buy-guide', 'buying', nowIso), makeDoc('galaxy-z-fold8', 'battery-setting', 'howto', nowIso)],
    });
    check('43) 같은 신규 문서끼리는 howto가 buying보다 먼저', first?.type === 'evergreen' && first.format === 'howto');
  }

  // 44) 허브 연결 트리거(PM 지시 §5) — 제목이 허브 키워드를 건드리면 그 허브 링크가 댓글에 함께 붙는다.
  //     에버그린 비중이 상한을 넘긴 상태로 두어 유형이 뉴스로 고정되게 한다.
  {
    const hubTopic = makeTopic('t-hub-match', '갤럭시 Z 폴드8 배터리 논란 확산', 'IT', 450);
    const plain = makeTopic('t-plain-2', '일반 경제 소식 정리', '경제', 460);
    const { first, commentRequests, threadsPostRows } = await run({
      pool: [hubTopic, plain], hubs: [FOLD_HUB], evergreenPostedToday: 20,
    });
    check(
      '44) ★ 허브 키워드가 걸린 뉴스가 트리거로 우선 선택됨',
      first?.ok === true && first.topicId === 't-hub-match' && first.hub?.slug === 'galaxy-z-fold8'
    );
    // 2026-08-17 개편: 링크가 한 댓글에 두 줄로 들어가던 구조가 4단 연재로 바뀌었다
    // (댓글3 = 허브 링크, 댓글4 = 뉴스저울 링크). 두 링크가 서로 다른 댓글로 나가는지 본다.
    const allCommentText = commentRequests.map((c) => c.text).join('\n---\n');
    const hubComment = commentRequests.find((c) => c.text.includes('/hub/galaxy-z-fold8?'));
    const siteComment = commentRequests.find((c) => c.text.includes('/topic/t-hub-match'));
    check(
      '44b) 허브 링크와 토픽 링크가 각각 별도 댓글로 나감(4단 연재)',
      Boolean(hubComment) && Boolean(siteComment) && hubComment !== siteComment && allCommentText.length > 0
    );
    check('44c) 유형이 news_hub로 기록됨', threadsPostRows.some((r) => r.hook_type === 'news_hub'));
  }

  // 45) 어색한 연결 방지(PM 지시 §5) — 관련성이 문턱(70) 미만이면 허브를 붙이지 않는다.
  //     '갤럭시'(3자, 신뢰도 60)만 걸리는 제목은 폴드8 허브와 연결하지 않는다.
  {
    const weak = makeTopic('t-weak-match', '갤럭시 워치 신제품 공개', 'IT', 500);
    const { first, commentRequests } = await run({ pool: [weak], hubs: [{ ...FOLD_HUB, newsKeywords: ['갤럭시', '폴드8'] }], evergreenPostedToday: 20 });
    check(
      '45) ★ 관련성 낮으면 허브를 붙이지 않고 일반 뉴스로 발행',
      first?.ok === true && first.hub === null && !commentRequests[0]?.text.includes('/hub/')
    );
  }

  // 46) 비중 상한 — 에버그린이 40%를 넘었으면 신규 문서가 있어도 뉴스로 돌린다("뉴스는 기본 유지").
  {
    const t = makeTopic('t-cap-news', '일반 뉴스', '경제', 500);
    const { first } = await run({
      pool: [t], hubs: [FOLD_HUB], hubDocs: [makeDoc('galaxy-z-fold8', 'x-doc', 'howto', nowIso)],
      evergreenPostedToday: 20, // 25(뉴스) + 20 = 45건 중 44% → 상한 초과
    });
    check('46) ★ 에버그린 비중 상한(40%) 초과 시 신규 문서가 있어도 뉴스 우선', first?.ok === true && first.type !== 'evergreen');
  }

  // 47) 링크 댓글 실패 — 본문은 이미 완결형이므로 게시 자체는 성공으로 남기고, 사유만 기록한다.
  {
    const t = makeTopic('t-comment-fail', '글', '경제', 400);
    const { first, skipLogRows } = await run({ pool: [t], commentFails: true, evergreenPostedToday: 20 });
    check(
      '47) ★ 링크 댓글 실패해도 게시는 성공으로 유지되고 comment_failed가 기록됨',
      first?.ok === true && first.commentOk === false && skipLogRows.some((r) => r.reason === 'comment_failed')
    );
  }

  // 48) dedup 조회 실패 — 중복 게시보다 미게시가 낫다. 에버그린을 아예 시도하지 않는다.
  {
    const t = makeTopic('t-dedupfail', '일반 뉴스', '경제', 500);
    const { first } = await run({
      pool: [t], hubs: [FOLD_HUB], hubDocs: [makeDoc('galaxy-z-fold8', 'y-doc', 'howto', nowIso)],
      dedupFetchFails: true,
    });
    check('48) ★ dedup 조회 실패 시 에버그린을 건너뛰고 뉴스로 진행(중복 게시 방지)', first?.ok === true && first.type !== 'evergreen');
  }

  // 49) 같은 실행 안 중복 — threads_posts 스냅샷은 실행 시작 시점이라, 연속 게시에서 같은 문서를
  //     두 번 고르지 않는지 확인한다(usedDocKeys).
  {
    const docs = [makeDoc('galaxy-z-fold8', 'd1', 'howto', nowIso), makeDoc('audi-q9', 'd2', 'howto', nowIso)];
    const { body } = await run({
      pool: [makeTopic('t-multi-ever', '뉴스', '경제', 500)], hubs: [FOLD_HUB], hubDocs: docs,
      articleCount: 600, postedTotal: 0, // 다건 시도 유도
    });
    const everKeys = body.results.filter((r) => r.ok && r.type === 'evergreen').map((r) => r.docKey);
    check('49) ★ 같은 실행에서 같은 허브 문서를 두 번 게시하지 않음', new Set(everKeys).size === everKeys.length);
  }

  // 50) 전략 순수 함수 — 시간대 규칙(PM 지시 §4)을 상수와 함께 고정한다.
  {
    const st = require('../netlify/functions/threads-strategy');
    check('50) 오전 9시(KST)는 뉴스 우선', st.pickTypePreference(9, 5, 3, false)[0] === 'news');
    check('50b) 저녁 8시(KST)는 에버그린 우선', st.pickTypePreference(20, 5, 3, false)[0] === 'evergreen');
    check('50c) 밴드 하한(30%) 미달이면 시간대와 무관하게 에버그린 보충', st.pickTypePreference(9, 9, 1, false)[0] === 'evergreen');
    check('50d) KST 변환(UTC+9) 정확', st.kstHour(new Date('2026-08-12T10:00:00Z')) === 19);
    check('50e) 문턱 미만 관련성은 0이 아니라 "연결 안 함"으로 걸러짐',
      st.pickHubForTopic('갤럭시 워치 공개', [{ slug: 'x', title: 'x', newsKeywords: ['갤럭시'] }]) === null);
    check('50f) 제외어가 걸리면 관련성 0', st.scoreHubMatch('폴드8 vs 폴드7', { slug: 'x', title: 'x', newsKeywords: ['폴드8'], newsExclude: ['폴드7'] }) === 0);

    // ── 규칙 순서 회귀(2026-08-12 첫 배포 직후 실측으로 발견) ───────────────
    // 처음엔 신규 문서 트리거를 규칙 맨 위에 뒀는데, 허브 문서가 매일 생성되는 탓에
    // 트리거가 사실상 상시 참이 되어 뉴스 시간대(07~14시)까지 에버그린이 밀고 들어갔다.
    // 지시 §4("뉴스는 오전 7시~오후 2시 집중")를 §1 트리거가 덮어쓰면 안 된다.
    check(
      '50g) ★ 뉴스 시간대(09시)에는 신규 문서가 있어도 뉴스가 우선',
      st.pickTypePreference(9, 7, 3, true)[0] === 'news'
    );
    check(
      '50h) 창 밖(16시)에서는 신규 문서 트리거가 작동',
      st.pickTypePreference(16, 7, 3, true)[0] === 'evergreen'
    );
    check(
      '50i) 창 밖이라도 신규 문서가 없고 밴드 안이면 뉴스가 기본값',
      st.pickTypePreference(16, 7, 3, false)[0] === 'news'
    );
    check(
      '50j) 신규 문서가 있어도 목표치(35%)를 넘어서까지 밀지 않음',
      st.pickTypePreference(16, 6, 4, true)[0] === 'news'
    );
    check(
      '50k) 상한(40%) 초과는 저녁 창에서도 뉴스로 되돌림',
      st.pickTypePreference(20, 5, 5, true)[0] === 'news'
    );
  }

  // 51) 정지 스위치 — 켜져 있으면 Claude도 Threads API도 부르지 않고 끝나야 한다.
  //     정지가 "게시만 막고 비용은 나가는" 상태면 정지가 아니다. 호출 자체가 0이어야 한다.
  {
    process.env.THREADS_DISTRIBUTION_PAUSED = 'true';
    let claudeCalls = 0, threadsCalls = 0;
    global.fetch = async (url) => {
      if (String(url).includes('anthropic.com')) claudeCalls++;
      if (String(url).includes('graph.threads.net')) threadsCalls++;
      return jsonRes({});
    };
    const mod = freshHandler();
    const res = await mod.handler({ httpMethod: 'POST', headers: { 'x-admin-key': 'real-admin-key' } });
    const body = JSON.parse(res.body);
    process.env.THREADS_DISTRIBUTION_PAUSED = 'false';
    check(
      '51) ★ 정지 상태면 Claude·Threads 호출 0건으로 즉시 종료(비용도 게시도 없음)',
      body.paused === true && res.statusCode === 200 && claudeCalls === 0 && threadsCalls === 0
    );
  }

  // 52) 두 스위치의 기본값이 코드에 명시돼 있는지 — 값이 조용히 뒤집히면 테스트가 같이 바뀐다.
  {
    const src = require('fs').readFileSync(path, 'utf8');
    const paused = src.match(/:\s*(true|false);\s*\/\/\s*←\s*정지하려면 true/);
    const evergreen = src.match(/:\s*(true|false);\s*\/\/\s*←\s*에버그린 재개 시 true/);
    check(
      `52) 정지 스위치 기본값이 명시돼 있음(현재: ${paused ? paused[1] : '못 찾음'} — true면 전면 정지)`,
      paused !== null
    );
    check(
      `52b) 에버그린 스위치 기본값이 명시돼 있음(현재: ${evergreen ? evergreen[1] : '못 찾음'} — false면 뉴스만)`,
      evergreen !== null
    );
  }

  // 53) 에버그린 OFF — 허브 문서가 잔뜩 대기 중이어도 뉴스만 나가야 한다.
  //     "뉴스만 돌린다"가 실제로 뉴스만인지, 그리고 쓰지 않을 허브·문서 조회를 하지 않는지까지 본다.
  {
    process.env.THREADS_EVERGREEN_ENABLED = 'false';
    let hubCalls = 0;
    const { first, body, commentRequests } = await run({
      pool: [makeTopic('t-news-only', '뉴스 후보', '경제', 500)],
      hubs: [FOLD_HUB],
      hubDocs: [makeDoc('galaxy-z-fold8', 'fresh-doc', 'howto', nowIso)],
      onFetch: (url) => {
        if (String(url).includes('hub-targets.json') || String(url).includes('hub_documents')) hubCalls++;
      },
    });
    process.env.THREADS_EVERGREEN_ENABLED = 'true';
    check(
      '53) ★ 에버그린 OFF면 신규 문서가 대기해도 뉴스만 게시',
      first?.ok === true && first.type === 'news' && body.evergreenThisRun === 0
    );
    check(
      '53b) 에버그린 OFF면 허브 목록·문서 조회를 아예 하지 않음(쓰지 않을 왕복 제거)',
      hubCalls === 0
    );
    check(
      '53c) 에버그린 OFF면 댓글도 토픽 링크만 — 허브 링크가 붙지 않는다(원래 동작)',
      commentRequests[0]?.text.includes('/topic/t-news-only') && !commentRequests[0]?.text.includes('/hub/')
    );
  }

  const failCount = results.filter((r) => !r.pass).length;
  // ── 카테고리 배분: 표본 부족 시 배급 잠금 방지 (2026-08-18 실사고 회귀) ──
  // 오늘 게시 2건(Sports1·Society1)만으로 두 카테고리 게시비중이 0.50이 되어 점수가 0으로
  // 떨어졌고, 채널 쿼터가 점수 높은 카테고리를 제외하고 있어 14회 연속 게시 실패했다.
  // 게시가 안 되니 그 2건이 계속 50%로 남아 스스로 풀리지 않았다.
  {
    const { computeCategoryAllocationScore: alloc, CATEGORY_ALLOCATION_MIN_SAMPLE: MIN } = require(path)._testUtils;
    const produced = { total: 14, byCategory: { Society: 1, Sports: 2, Technology: 5, Economy: 3, Entertainment: 1, Business: 1, Crypto: 1 } };
    const tiny = { total: 2, byCategory: { Sports: 1, Society: 1 } };
    const raw = Math.max(0, Math.min(100, 50 + (1 / 14 - 0.5) * 200));
    const got = alloc("Society", produced, tiny);
    check("배분1) 표본 2건일 때 Society가 0점으로 죽지 않는다", got > 20, "보정전 " + raw.toFixed(0) + " → 현재 " + got.toFixed(0));

    const enough = { total: MIN, byCategory: { Society: 5, Sports: 5 } };
    const full = alloc("Society", produced, enough);
    check("배분2) 표본이 충분하면 보정 없이 종전과 동일", Math.abs(full - raw) < 0.001, "현재 " + full.toFixed(1) + " / 종전 " + raw.toFixed(1));

    check("배분3) 게시 실적이 없으면 감점되지 않는다", alloc("Entertainment", produced, { total: 0, byCategory: {} }) >= 50);
  }

  console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error('예외:', e); process.exit(1); });
