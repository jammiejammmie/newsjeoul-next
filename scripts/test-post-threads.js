// post-threads.js(Distribution Engine) 회귀 테스트 — 실제 서비스를 호출하지 않고 fetch를 모의(mock)해서 검증한다.
// 실행: node scripts/test-post-threads.js
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'fake';
process.env.ANTHROPIC_API_KEY = 'fake';
process.env.ADMIN_KEY = 'real-admin-key';
process.env.THREADS_USER_ID = 'fake-user';
process.env.THREADS_ACCESS_TOKEN = 'fake-token';

const path = require('path').resolve(__dirname, '../netlify/functions/post-threads.js');

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

const results = [];
function check(label, pass) { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); }

function freshHandler() {
  delete require.cache[require.resolve(path)];
  return require(path);
}

// scenario 기본값 — 대부분의 테스트는 "오늘 생산 200건, 오늘 게시 0건"인 여유로운 상황을 가정한다
// (dailyTarget≈10, adaptiveMinScore=하한 55) — 개별 테스트가 필요에 따라 override한다.
async function run(scenario) {
  const s = Object.assign({
    pool: [], recentPosted: [], producedTotal: 200, producedByCategory: {}, postedTotal: 0, postedByCategory: {},
  }, scenario);
  const patched = [];

  global.fetch = async (url, opts = {}) => {
    const method = opts.method || 'GET';

    if (method === 'GET' && url.includes('created_at=gte.')) {
      const rows = [];
      Object.entries(s.producedByCategory).forEach(([cat, n]) => { for (let i = 0; i < n; i++) rows.push({ category: cat }); });
      while (rows.length < s.producedTotal) rows.push({ category: '기타' });
      return jsonRes(rows.slice(0, s.producedTotal));
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
      return jsonRes(s.pool);
    }
    if (method === 'GET' && url.includes('select=ai_context')) {
      const id = decodeURIComponent(url.match(/id=eq\.([^&]+)/)[1]);
      const alreadyPosted = s.raceAlreadyPosted === id;
      return jsonRes(alreadyPosted ? [{ ai_context: { threads: { posted_at: new Date().toISOString() } } }] : [{ ai_context: {} }]);
    }
    if (method === 'PATCH' && url.includes('/rest/v1/topics?id=eq.')) {
      if (s.dedupSaveFails) return { ok: false, text: async () => 'dedup save error' };
      patched.push(JSON.parse(opts.body));
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('anthropic.com')) {
      if (s.claudeFails) return { ok: false, text: async () => 'claude api error' };
      return jsonRes({ content: [{ type: 'text', text: JSON.stringify({ hook_type: '정보격차', text: '문장.' }) }] });
    }
    if (method === 'POST' && url.includes('/rest/v1/threads_posts')) {
      return { ok: true, text: async () => '' };
    }
    if (method === 'POST' && url.includes('graph.threads.net') && url.includes('/threads_publish')) {
      if (s.threadsApiFails) return { ok: false, json: async () => ({ error: 'threads publish error' }) };
      return jsonRes({ id: s.postId || 'post-id-x' });
    }
    if (method === 'POST' && url.includes('graph.threads.net')) {
      if (s.threadsApiFails) return { ok: false, json: async () => ({ error: 'threads container error' }) };
      return jsonRes({ id: 'container-1' });
    }
    throw new Error('예상치 못한 호출: ' + method + ' ' + url);
  };

  const mod = freshHandler();
  const res = await mod.handler({ httpMethod: 'POST', headers: { 'x-admin-key': 'real-admin-key' } });
  return { res, body: JSON.parse(res.body), patched };
}

async function main() {
  // 1) Distribution Score 계산 — 고득점 후보(무게/완성도/출처/키워드 모두 충족)가 성공 게시
  {
    const t = makeTopic('t1', '정치A', '정치', 500);
    const { body } = await run({ pool: [t] });
    check('1) Distribution Score 계산 → 통과 후보 성공 게시', body.ok === true && body.scoreDetail.distributionScore >= 55);
  }

  // 2) 품질 기준 미달(본문 빈약) → below_quality_threshold — Distribution Score까지 가지 않고 차단
  {
    const thin = makeTopic('t2', '빈약한 글', '경제', 500, {
      ai_context: { draft: { lead: '짧음', blocks: [{ content: '짧다' }] }, evidence: { sources: [{ url: 'https://example.com/y' }] }, weight: {} },
    });
    const { body } = await run({ pool: [thin] });
    check('2) 본문 빈약 → below_quality_threshold Skip', body.skipped === true && body.reason === 'below_quality_threshold');
  }

  // 3) 후보 자체가 없을 때 no_candidate
  {
    const { body } = await run({ pool: [] });
    check('3) 후보 없음 → no_candidate Skip', body.skipped === true && body.reason === 'no_candidate');
  }

  // 4) 카테고리 배분 엔진 — 오늘 많이 생산됐지만 아직 게시가 적은 분야(자동차)가, 생산은 적은데
  //    이미 많이 게시된 분야(경제)보다 우선 선택돼야 한다("감점"이 아니라 "배분" 로직 검증)
  {
    const car = makeTopic('t-car', '자동차 이슈', '자동차', 450);
    const eco = makeTopic('t-eco', '경제 이슈', '경제', 460); // 무게는 오히려 경제가 더 높음
    const { body } = await run({
      pool: [car, eco],
      producedTotal: 100, producedByCategory: { 자동차: 80, 경제: 20 },
      postedTotal: 5, postedByCategory: { 경제: 5 },
    });
    check('4) 카테고리 배분(생산多·게시少 분야 우선) → 자동차 선택', body.ok === true && body.topicId === 't-car');
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
    const { body } = await run({ pool: [politics, tech], recentPosted: recent });
    check('5) 최근 3건 내 카테고리 반복 → IT로 전환', body.ok === true && body.topicId === 't-tech');
  }

  // 6) 검색 의도 — SEARCH_GUIDE 후보가 DEEP_DIVE 후보보다 (다른 조건 동일 시) 우선
  {
    const guide = makeTopic('t-guide', '가이드 글', '생활정보', 400, { gate_status: 'SEARCH_GUIDE' });
    const deep = makeTopic('t-deep', '심층 글', '생활정보', 410, { gate_status: 'DEEP_DIVE' }); // 무게는 오히려 더 높음
    const { body } = await run({ pool: [guide, deep] });
    check('6) 검색 의도(SEARCH_GUIDE) 우선 → guide 선택', body.ok === true && body.topicId === 't-guide');
  }

  // 7) 예상 CTR — 숫자/비교 표현이 있는 제목이 밋밋한 제목보다 우선
  {
    const catchy = makeTopic('t-catchy', '전기차 vs 하이브리드, 5년 유지비 비교', '자동차', 400);
    const plain = makeTopic('t-plain', '자동차 관련 소식', '자동차', 405); // 무게는 오히려 더 높음
    const { body } = await run({ pool: [catchy, plain] });
    check('7) 예상 CTR(숫자·비교 표현) 우선 → catchy 선택', body.ok === true && body.topicId === 't-catchy');
  }

  // 8) Topic Weight — 다른 조건이 동일하면 무게 높은 후보가 우선
  {
    const heavy = makeTopic('t-heavy', '무거운 이슈', '국제', 900);
    const light = makeTopic('t-light', '가벼운 이슈', '국제', 200);
    const { body } = await run({ pool: [heavy, light] });
    check('8) Topic Weight 높은 후보 우선 → heavy 선택', body.ok === true && body.topicId === 't-heavy');
  }

  // 9) Exploration 가능성(구 Expansion 가능성) — 이미 생성된 확장 앵글이 많은 후보가 (다른 조건 동일 시) 우선
  {
    const expanded = makeTopic('t-expanded', '확장된 글', '경제', 400, {
      ai_context: { ...makeTopic('x', '', '', 0).ai_context, expansion_drafts: [{ angle: 'guide' }, { angle: 'compare' }, { angle: 'faq' }] },
    });
    const bare = makeTopic('t-bare', '기본 글', '경제', 405); // 무게는 오히려 더 높음
    const { body } = await run({ pool: [expanded, bare] });
    check('9) Exploration 가능성 높은 후보 우선 → expanded 선택', body.ok === true && body.topicId === 't-expanded');
  }

  // 10) 오늘 생산량 비례 목표치 자동 계산(하드코딩 제거 검증) — PM 예시 3개 구간
  {
    const t = makeTopic('t-target100', '글', '경제', 400);
    const { body } = await run({ pool: [t], producedTotal: 100 });
    check('10-a) 생산 100건 → 목표 5~10건', body.dailyTarget >= 5 && body.dailyTarget <= 10);
  }
  {
    const t = makeTopic('t-target500', '글', '경제', 400);
    const { body } = await run({ pool: [t], producedTotal: 500 });
    check('10-b) 생산 500건 → 목표 20~30건', body.dailyTarget >= 20 && body.dailyTarget <= 30);
  }
  {
    const t = makeTopic('t-target1000', '글', '경제', 400);
    const { body } = await run({ pool: [t], producedTotal: 1000 });
    check('10-c) 생산 1000건 → 목표 40~60건', body.dailyTarget >= 40 && body.dailyTarget <= 60);
  }

  // 11) 적응형 임계값 — 오늘 목표치를 이미 채웠으면 평범한 후보는 Skip(below_distribution_threshold),
  //     정말 뛰어난 후보는 여전히 통과(하드 컷오프가 아님을 함께 확인)
  {
    const mediocre = makeTopic('t-mediocre', '평범한 글', '경제', 300);
    const { body } = await run({ pool: [mediocre], producedTotal: 100, postedTotal: 20 }); // 목표(≈10) 대비 이미 2배 게시
    check('11-a) 목표 초과 상태에서 평범한 후보 → below_distribution_threshold', body.skipped === true && body.reason === 'below_distribution_threshold');

    const excellentBase = makeTopic('t-excellent', '국제 1위 이슈 vs 대안, 비교', '국제', 950, { gate_status: 'SEARCH_GUIDE' });
    const excellent = Object.assign(excellentBase, {
      ai_context: {
        ...excellentBase.ai_context,
        draft: { ...excellentBase.ai_context.draft, perspective_markers: [{ perspective: 'A', claim: '주장1' }, { perspective: 'B', claim: '주장2' }] },
        expansion_drafts: [{ angle: 'guide' }, { angle: 'compare' }, { angle: 'faq' }],
      },
    });
    const { body: body2 } = await run({
      pool: [excellent], producedTotal: 100, postedTotal: 20,
      producedByCategory: { 국제: 50 }, postedByCategory: { 경제: 20 },
    });
    check('11-b) 목표 초과 상태여도 탁월한 후보는 통과(하드컷오프 아님)', body2.ok === true && body2.topicId === 't-excellent');
  }

  // 12) 이미지 null 상태에서도 정상 게시(이미지 필드를 아예 참조하지 않음)
  {
    const noImage = makeTopic('t-noimg', '이미지 없는 글', '사회', 400);
    delete noImage.og_image_url;
    const { body } = await run({ pool: [noImage] });
    check('12) 이미지 필드 없음 → 정상 게시(오류 아님)', body.ok === true && body.postId);
  }

  // 13) Claude 실패 처리
  {
    const t = makeTopic('t-claudefail', '글', '경제', 400);
    const { res, body } = await run({ pool: [t], claudeFails: true });
    check('13) Claude 실패 → claude_failed, 500', res.statusCode === 500 && body.reason === 'claude_failed');
  }

  // 14) Threads API 실패 처리
  {
    const t = makeTopic('t-threadsfail', '글', '경제', 400);
    const { res, body } = await run({ pool: [t], threadsApiFails: true });
    check('14) Threads API 실패 → threads_api_failed, 500', res.statusCode === 500 && body.reason === 'threads_api_failed');
  }

  // 15) dedup 저장 확인 — 게시 성공 시 topics.ai_context.threads에 posted_at/post_id 기록
  {
    const t = makeTopic('t-dedup', '글', '경제', 400);
    const { body, patched } = await run({ pool: [t], postId: 'real-post-id-999' });
    const savedThreads = patched[0]?.ai_context?.threads;
    check('15) dedup 저장 확인(ai_context.threads.post_id 기록)', body.ok === true && savedThreads?.post_id === 'real-post-id-999' && !!savedThreads?.posted_at);
  }

  // 16) dedup 저장 실패 시 postId 보존 + dedup_save_failed 반환(게시 자체는 이미 성공한 상태)
  {
    const t = makeTopic('t-dedupfail', '글', '경제', 400);
    const { res, body } = await run({ pool: [t], dedupSaveFails: true, postId: 'post-before-dedup-fail' });
    check('16) dedup 저장 실패 → dedup_save_failed, postId 보존', res.statusCode === 500 && body.reason === 'dedup_save_failed' && body.postId === 'post-before-dedup-fail');
  }

  // 16-b) Distribution Score 저장 확인 — ai_context.engines.distribution에 계산 근거가 버전과
  //       함께 실제로 저장되는지(PM 지시 2026-07-21 §4: 계산만 하고 버리지 말 것, v1/v2 공존 대비)
  {
    const t = makeTopic('t-distsave', '글', '경제', 400);
    const { body, patched } = await run({ pool: [t], postId: 'post-for-dist-save' });
    const saved = patched[0]?.ai_context?.engines?.distribution;
    check(
      '16-b) ai_context.engines.distribution 저장(version/score/components/channel/calculated_at)',
      body.ok === true && saved && saved.version === 1 && saved.score === body.scoreDetail.distributionScore &&
      typeof saved.components?.editorial_score === 'number' && saved.channel === 'threads' && !!saved.calculated_at
    );
  }

  // 17) 레이스 컨디션 — 선택 직후 다른 실행이 먼저 게시했으면 duplicate_topic으로 재차단
  {
    const t = makeTopic('t-race', '글', '경제', 400);
    const { body } = await run({ pool: [t], raceAlreadyPosted: 't-race' });
    check('17) 레이스 컨디션 재확인 → duplicate_topic Skip', body.skipped === true && body.reason === 'duplicate_topic');
  }

  // 18) 회귀 픽스처 — 실제 성공한 Post ID(18081263792288677)로 게시 성공 응답이 그 값을 그대로 반환
  {
    const t = makeTopic('iran-tanker-attack-war-fears', '이란 유조선 공격 및 전쟁 우려', '국제', 480);
    const { body } = await run({ pool: [t], postId: '18081263792288677' });
    check('18) 회귀 픽스처(Post ID 18081263792288677) 그대로 반환', body.ok === true && body.postId === '18081263792288677');
  }

  // 19) 회귀 픽스처 — 두 번째 실제 게시(18122769340814327)가 배분 로직 적용 후에도 정상 처리되는지
  {
    const t2 = makeTopic('choe-son-hui-moscow-visit', '최선희 북한 외무상 러시아 방문', '국제', 470);
    const recent = [{ category: '국제', ai_context: { threads: { posted_at: new Date().toISOString() } } }];
    const other = makeTopic('other-domestic', '국내 이슈', '경제', 460);
    const { body } = await run({ pool: [t2, other], recentPosted: recent, postId: '18122769340814327' });
    check('19) 회귀 픽스처(두 번째 실제 게시) 배분 적용 후 정상 처리', body.ok === true && body.postId === '18122769340814327');
  }

  // 20) 자격증명 없음 — Claude/Threads API 호출 전에 즉시 credential_missing으로 차단
  {
    delete process.env.THREADS_USER_ID;
    const t = makeTopic('t-nocred', '글', '경제', 400);
    const { res, body } = await run({ pool: [t] });
    check('20) 자격증명 없음 → credential_missing, Claude 호출 전 차단', res.statusCode === 500 && body.reason === 'credential_missing');
    process.env.THREADS_USER_ID = 'fake-user';
  }

  const failCount = results.filter((r) => !r.pass).length;
  console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
  process.exit(failCount === 0 ? 0 : 1);
}

main().catch((e) => { console.error('예외:', e); process.exit(1); });
