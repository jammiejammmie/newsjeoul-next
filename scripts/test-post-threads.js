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

function freshHandler() {
  delete require.cache[require.resolve(path)];
  return require(path);
}

// scenario 기본값 — "오늘 기사 250건(목표 25건 정확히), 오늘 게시 25건(=목표와 정확히 같음)"으로
// 고정해 remaining=0 → postsThisRun=1이 실제 현재 시각과 무관하게 항상 결정되도록 한다(테스트
// 결정성 확보). adaptiveMinScore도 progress=1<=1이라 항상 FLOOR(55)로 고정된다.
async function run(scenario) {
  const s = Object.assign({
    pool: [], recentPosted: [], articleCount: 250, producedByCategory: {}, postedTotal: 25, postedByCategory: {},
  }, scenario);
  const patched = [];
  const postedIds = new Set();
  const skipLogRows = [];
  const runLogRows = [];

  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';

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
      if (s.claudeFails) return { ok: false, text: async () => 'claude api error' };
      return jsonRes({ content: [{ type: 'text', text: JSON.stringify({ text: s.claudeText || '배경과 쟁점을 설명하는 문장입니다. '.repeat(4) }) }] });
    }
    if (method === 'POST' && url.includes('/rest/v1/threads_posts')) {
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
      return jsonRes({ id: 'container-1' });
    }
    throw new Error('예상치 못한 호출: ' + method + ' ' + url);
  };

  const mod = freshHandler();
  const res = await mod.handler({ httpMethod: 'POST', headers: { 'x-admin-key': 'real-admin-key' } });
  const body = JSON.parse(res.body);
  return { res, body, patched, first: body.results?.[0], skipLogRows, runLogRows };
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

  // 10) 오늘 목표 계산 공식 직접 검증(articles 기준, clamp 20~60) — PM 재조정 지시(2026-07-22)
  {
    const { computeDailyTarget } = require(path)._testUtils;
    const checks = [
      ['10-a) articles=0 → 최소 20', computeDailyTarget(0) === 20],
      ['10-b) articles=100 → 최소 20(100×0.1=10 clamp)', computeDailyTarget(100) === 20],
      ['10-c) articles=210 → 약 21', computeDailyTarget(210) === 21],
      ['10-d) articles=500 → 약 50', computeDailyTarget(500) === 50],
      ['10-e) articles=1000 → 최대 60(clamp)', computeDailyTarget(1000) === 60],
    ];
    checks.forEach(([label, pass]) => check(label, pass));
  }

  // 11) 이번 실행 게시 건수 계산(남은 목표÷남은 시간) 직접 검증 — PM 지시 예시와 동일
  {
    const { computePostsThisRun } = require(path)._testUtils;
    const noon12hLeft = new Date('2026-07-22T12:00:00Z'); // UTC 12:00 → 남은 12시간
    const evening10hLeft = new Date('2026-07-22T14:00:00Z'); // UTC 14:00 → 남은 10시간
    const checks = [
      ['11-a) 목표24,게시0,12시간남음 → 시간당 2건', computePostsThisRun(24, 0, noon12hLeft) === 2],
      ['11-b) 목표40,게시10,10시간남음 → 시간당 3건', computePostsThisRun(40, 10, evening10hLeft) === 3],
      ['11-c) 목표 이미 달성(remaining<=0) → 최소 1건은 시도', computePostsThisRun(20, 25, noon12hLeft) === 1],
      ['11-d) 최대 3건 상한 유지(아무리 남아도)', computePostsThisRun(60, 0, noon12hLeft) === 3],
    ];
    checks.forEach(([label, pass]) => check(label, pass));
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

  // 23) 1회 실행 다건 게시 — 남은 목표가 충분하면 최대 3건까지, 서로 다른 Topic을 순차 게시
  //     (postedTotal=0, articleCount=600 → dailyTarget=60(clamp) → remaining=60 → 시간대 무관하게
  //     항상 postsThisRun=3으로 결정됨을 이용해 테스트 결정성 확보)
  {
    const t1 = makeTopic('t-multi-1', '정치 이슈', '정치', 500);
    const t2 = makeTopic('t-multi-2', '경제 이슈', '경제', 490);
    const t3 = makeTopic('t-multi-3', 'IT 이슈', 'IT', 480);
    const { body, patched } = await run({ pool: [t1, t2, t3], articleCount: 600, postedTotal: 0, postIds: ['multi-post-1', 'multi-post-2', 'multi-post-3'] });
    const distinctTopics = new Set(body.results.map((r) => r.topicId));
    check('23) 1회 실행에서 최대 3건 게시, 서로 다른 Topic 선택', body.postsAttemptedThisRun === 3 && body.postsSucceededThisRun === 3 && distinctTopics.size === 3 && patched.length === 3);
  }

  // 24) 후보 소진 시 조기 중단 — 목표는 충분히 남았지만(3건 시도 가능) 후보가 1개뿐이면 1건만
  //     게시하고 억지로 채우지 않고 중단(no_candidate로 자연 종료)
  {
    const only = makeTopic('t-only-one', '단일 후보', '사회', 500);
    const { body } = await run({ pool: [only], articleCount: 600, postedTotal: 0 });
    check(
      '24) 후보 소진 시 조기 중단(억지로 채우지 않음)',
      body.postsAttemptedThisRun === 2 && body.postsSucceededThisRun === 1 && body.results[1].reason === 'no_candidate'
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

  // 27) 마무리 문구 — 짧은 훅+CTA가 아니라 "오늘 이 외에도 N개 이슈를 다루고 있습니다" + 실제
  //     활성 Topic 수 + 링크로 마무리되는 완결형 구조인지(2026-07-29 포스팅 방향 전면 개편)
  {
    const t = makeTopic('t-closing', '글', '경제', 400);
    const { first } = await run({ pool: [t], activeTopicCount: 41 });
    check(
      '27) 마무리 문구가 활성 이슈 개수 안내 + 링크로 끝남(CTA 라이브러리 미사용)',
      first?.ok === true &&
      first.text.includes('오늘 이 외에도 41개 이슈를 다루고 있습니다') &&
      first.text.includes(first.url) &&
      !first.ctaPhraseId
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

  // ── 2026-08-03 사고 회귀 테스트 ──────────────────────────────────────────
  // 사고: 본문+마무리+링크를 이어붙인 뒤 통째로 slice(0,499)해서, 본문이 길면 링크가 잘려나갔다.
  // 아래 3개는 "본문이 아무리 길어도 링크는 반드시 남는다"를 서로 다른 각도에서 고정한다.

  // 29) 본문이 예산을 크게 넘겨도 링크가 살아있고 전체가 500자 이내인지(핵심 회귀 테스트)
  {
    const t = makeTopic('t-longbody', '글', '경제', 400);
    const { first } = await run({ pool: [t], claudeText: '아주 긴 배경 설명 문장입니다. '.repeat(60) }); // 약 1000자
    const ok = first?.ok === true && first.text.includes(first.url) && first.text.length <= 500;
    check(
      `29) 본문 1000자여도 링크 보존 + 500자 이내(실측 ${first?.text?.length}자)`,
      ok
    );
    check(
      '29b) 링크가 문구의 맨 끝에 온전히 붙어있음',
      first?.ok === true && first.text.endsWith(first.url)
    );
  }

  // 30) slug가 비정상적으로 길어도(예산 압박) 링크가 최우선으로 보존되는지
  {
    const t = makeTopic('t-longslug', '글', '경제', 400, { slug: 'a'.repeat(200) });
    const { first } = await run({ pool: [t], claudeText: '긴 본문입니다. '.repeat(50) });
    check(
      `30) slug 200자 + 긴 본문에도 링크 보존 + 500자 이내(실측 ${first?.text?.length}자)`,
      first?.ok === true && first.text.includes(first.url) && first.text.length <= 500
    );
  }

  // 31) 짧은 본문은 잘리지 않고 마무리 문구까지 그대로 유지되는지(과잉 절단 방지)
  {
    const t = makeTopic('t-shortbody', '글', '경제', 400);
    const short = '핵심만 담은 짧은 본문입니다. 두 번째 문장입니다.';
    const { first } = await run({ pool: [t], claudeText: short, activeTopicCount: 41 });
    check(
      '31) 짧은 본문은 원문 그대로 + 마무리 문구 + 링크 유지(불필요한 절단 없음)',
      first?.ok === true && first.text.startsWith(short) &&
      first.text.includes('오늘 이 외에도 41개 이슈를 다루고 있습니다') && first.text.endsWith(first.url)
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

  const failCount = results.filter((r) => !r.pass).length;
  console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error('예외:', e); process.exit(1); });
