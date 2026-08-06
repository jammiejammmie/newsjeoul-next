// generate-evergreen-hub-background.js
// evergreen_queue에서 priority 상위 N개를 꺼내 허브를 자동 생성한다.
//
// 생성물은 hubs 테이블의 config(jsonb)에 저장한다. lib/hubs/*.ts는 빌드에 컴파일되므로
// 런타임에 만들 수 없다 — 그래서 자동 생성 허브는 DB가 정본이고, 페이지가
// TS 레지스트리 → DB 순으로 설정을 찾는다(lib/hubs/index.ts).
//
// ★ 제휴 링크는 자동 생성하지 않는다.
//   affiliate는 항상 { allowed: false }로 넣는다. 상품 링크는 수익이 걸린 판단이고
//   §8.3이 신차·정책 카테고리를 금지하는데, 그 판단을 모델에게 맡길 수 없다.
//   사람이 검수하고 TS 설정으로 승격할 때 붙인다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const MAX_PER_RUN = 3;      // 지시: priority 상위 3개
const MAX_ATTEMPTS = 3;     // 실패가 반복되는 항목은 큐를 막지 않게 failed로 내린다

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

const KIND_LABEL = {
  product: '제품', car: '신차', policy: '정부 제도·지원금', program: '소프트웨어·서비스',
};

// 에버그린 4포맷의 라벨은 kind마다 다르다(설계서 §3.3). 라벨만 바뀌고 키는 고정이다.
const EVERGREEN_LABELS = {
  product: { howto: '기능·설정법', troubleshoot: '고장·문제 대처', compare: '비교', buying: '구매 준비' },
  car: { howto: '기능·옵션 이해', troubleshoot: '결함·리콜 대처', compare: '경쟁 모델 비교', buying: '계약·출고 준비' },
  policy: { howto: '신청 방법', troubleshoot: '탈락 사유별 대처', compare: '유사 제도 비교', buying: '서류 체크리스트' },
  program: { howto: '사용법·단축키', troubleshoot: '오류 해결', compare: '대체 도구 비교', buying: '요금제 선택' },
};

async function generateHubConfig(item, sampleArticles) {
  const kind = item.kind || 'product';
  const labels = EVERGREEN_LABELS[kind] || EVERGREEN_LABELS.product;
  const newsContext = sampleArticles.length
    ? `\n참고용 최근 기사 제목(사실 확인에만 쓰고, 없는 내용을 만들지 마라):\n${sampleArticles.map((a) => '- ' + a.title).join('\n')}`
    : '\n(관련 기사를 찾지 못했다. 일반적으로 확실한 사실만 쓰고, 모르는 값은 비워라.)';

  const prompt = `'${item.suggested_title}'(${KIND_LABEL[kind]})에 대한 토픽 허브 페이지 설정을 만들어라.

토픽 허브는 사람들이 검색해서 찾아오는 실체를 한 페이지에 모으는 곳이다.
독자는 "이게 뭔지, 얼마인지, 어떻게 신청/구매하는지, 뭐가 문제인지"를 알고 싶어 한다.

★ 절대 규칙:
1. **모르는 값은 비워라.** 가격·날짜·수치를 추측해서 채우지 마라. 확실하지 않으면 그 항목을
   아예 넣지 마라. 빈 칸은 고칠 수 있지만 틀린 숫자는 독자를 잘못된 결정으로 이끈다.
2. 제목·URL에 연도나 날짜를 넣지 마라.
3. verdict는 "지금 이걸 검색하는 사람이 알아야 할 핵심 판단" 한 문장이다. 광고 문구가 아니다.
4. specs/stats에 확실한 값이 없으면 빈 배열로 두어라. 채우는 게 목적이 아니다.
5. faq는 실제로 검색될 질문만. "무엇인가요?" 같은 뻔한 질문 대신 자격·금액·기한·예외를 물어라.

${newsContext}

아래 JSON 구조로만 반환해라(설명·코드블록 없이):
{
  "definition": "이 페이지가 무엇을 모아둔 곳인지 2~3문장. 검색 결과에 그대로 노출된다.",
  "trackingNote": "무엇을 추적하는지 한 줄. 예: '공고·단가 변경을 추적합니다'",
  "verdict": "핵심 판단 한 문장",
  "stats": [{"label": "짧은 항목명", "value": "값", "note": "보조설명(선택)"}],
  "specsTitle": "${kind === 'policy' ? '지원 조건' : '주요 사양'}",
  "specs": [{"label": "항목", "value": "값"}],
  "faq": [{"q": "질문", "a": "답변 2~3문장"}],
  "timelineTitle": "주요 경과",
  "timeline": [{"date": "YYYY-MM-DD", "title": "무슨 일", "detail": "한 줄 설명"}],
  "evergreen": {
    "howto":        {"label": "${labels.howto}",        "items": [{"title": "문서 제목"}]},
    "troubleshoot": {"label": "${labels.troubleshoot}", "items": [{"title": "문서 제목"}]},
    "compare":      {"label": "${labels.compare}",      "items": [{"title": "문서 제목"}]},
    "buying":       {"label": "${labels.buying}",       "items": [{"title": "문서 제목"}]}
  },
  "newsKeywords": ["기사 제목 검색어", "..."],
  "newsExclude": ["오탐 제외어(짧은 키워드일 때만)"],
  "tags": ["태그"],
  "schema": {"brand": "제조사(제품/신차만)", "provider": "제공기관(제도만)", "applicationCategory": "분류(프로그램만)"}
}

evergreen 각 칸에 문서 제목 3~5개씩. 실제로 검색되는 질문형 제목으로 써라
(예: '청년월세 소득 기준 계산법', '엑셀 VLOOKUP #N/A 오류 해결').
timeline은 확실한 날짜만. 모르면 빈 배열.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 8000 /* 2026-08-06: sonnet-5 adaptive thinking이 max_tokens를 함께 소진한다 — 잘림 여유 확보 */, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`설정 파싱 실패(stop=${data.stop_reason}, len=${raw.length})`);
  return JSON.parse(m[0]);
}

/**
 * 모델 출력을 HubConfig 형태로 정규화한다.
 * 모델이 빠뜨리거나 엉뚱한 타입으로 준 항목이 페이지를 깨뜨리지 않게, 여기서 전부 형태를 맞춘다.
 * 렌더러는 이 함수를 통과한 config만 본다.
 */
function normalizeConfig(gen, item, today) {
  const kind = ['product', 'car', 'policy', 'program'].includes(item.kind) ? item.kind : 'product';
  const labels = EVERGREEN_LABELS[kind];
  const arr = (v) => (Array.isArray(v) ? v : []);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const ever = (key) => {
    const src = gen.evergreen?.[key] || {};
    return {
      label: str(src.label, 40) || labels[key],
      items: arr(src.items)
        .map((i) => ({ title: str(i?.title, 120) }))
        .filter((i) => i.title)
        .slice(0, 6),
    };
  };

  return {
    slug: item.hub_slug,
    kind,
    title: str(item.suggested_title, 120),
    breadcrumb: ['홈', str(item.category, 40) || KIND_LABEL[kind]],
    category: str(item.category, 40) || KIND_LABEL[kind],
    definition: str(gen.definition, 600) || `${item.suggested_title} 관련 정보를 모으는 페이지입니다.`,
    trackingNote: str(gen.trackingNote, 120) || '변경 사항을 추적합니다',
    stats: arr(gen.stats).map((s) => ({
      label: str(s?.label, 30), value: str(s?.value, 60), note: str(s?.note, 80) || undefined,
    })).filter((s) => s.label && s.value).slice(0, 4),

    createdAt: today,
    updatedAtFallback: today,
    updateCountFallback: 0,

    newsKeywords: arr(gen.newsKeywords).map((k) => str(k, 40)).filter(Boolean).slice(0, 6),
    newsExclude: arr(gen.newsExclude).map((k) => str(k, 40)).filter(Boolean).slice(0, 8),

    // 추이는 자동 생성하지 않는다 — 시계열은 실제로 수집한 값이어야 한다.
    // 모델이 만든 가격 추이 그래프는 그냥 거짓이다.
    verdict: str(gen.verdict, 400) || `${item.suggested_title}에 대한 판단은 검수 후 추가됩니다.`,

    evergreen: {
      howto: ever('howto'), troubleshoot: ever('troubleshoot'),
      compare: ever('compare'), buying: ever('buying'),
    },
    specsTitle: str(gen.specsTitle, 40) || (kind === 'policy' ? '지원 조건' : '주요 사양'),
    specs: arr(gen.specs).map((s) => ({ label: str(s?.label, 40), value: str(s?.value, 200) }))
      .filter((s) => s.label && s.value).slice(0, 20),
    faq: arr(gen.faq).map((f) => ({ q: str(f?.q, 200), a: str(f?.a, 900) }))
      .filter((f) => f.q && f.a).slice(0, 10),
    timelineTitle: str(gen.timelineTitle, 40) || '주요 경과',
    timeline: arr(gen.timeline)
      // 날짜 형식이 어긋나면 버린다. 모델이 '2026년 여름' 같은 값을 넣는다.
      .filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(String(t?.date || '')))
      .map((t) => ({ date: t.date, title: str(t?.title, 120), detail: str(t?.detail, 300) }))
      .filter((t) => t.title).slice(0, 12),

    // ★ 자동 생성 허브에는 제휴 링크를 절대 붙이지 않는다(위 주석 참고).
    affiliate: {
      allowed: false,
      reason: '자동 생성 허브입니다. 제휴 링크는 사람이 검수한 뒤에만 붙입니다.',
    },
    // HubEditor의 필수 키는 name / beat / statement다. role·note 같은 이름으로 넣으면
    // Person 스키마에 jobTitle: 'undefined 에디터'가 그대로 나간다(2026-08-05 타입 대조로 확인).
    editor: {
      name: 'AI 편집국',
      beat: str(item.category, 40) || KIND_LABEL[kind],
      statement:
        '이 페이지는 수집된 기사와 공개 정보를 바탕으로 자동 생성됐고, 아직 사람이 검수하지 않았습니다. ' +
        '금액·기한처럼 결정에 직접 쓰이는 값은 공식 공고나 제조사 자료로 다시 확인하세요.',
    },
    related: [],
    tags: arr(gen.tags).map((t) => str(t, 30)).filter(Boolean).slice(0, 10),
    schema: {
      brand: str(gen.schema?.brand, 60) || undefined,
      provider: str(gen.schema?.provider, 60) || undefined,
      applicationCategory: str(gen.schema?.applicationCategory, 60) || undefined,
      // price/releaseDate는 자동 생성하지 않는다 — 틀린 가격은 구조화 데이터로 퍼진다.
    },
  };
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
  const limit = Math.min(Number(event.queryStringParameters?.limit) || MAX_PER_RUN, 6);

  try {
    const items = await sb('GET',
      `evergreen_queue?status=eq.pending&attempts=lt.${MAX_ATTEMPTS}` +
      `&select=*&order=priority.desc,created_at.asc&limit=${limit}`);

    const stats = { picked: items.length, created: 0, failed: 0 };
    const results = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const item of items) {
      try {
        if (!isDry) {
          await sb('PATCH', `evergreen_queue?id=eq.${item.id}`,
            { status: 'processing', attempts: (item.attempts || 0) + 1 });
        }

        // 뉴스 컨텍스트 — 생성 근거를 실제 기사에서 가져온다.
        let articles = [];
        const kws = (item.keywords || []).filter(Boolean);
        if (kws.length) {
          const or = kws.map((k) => `title.ilike.*${k}*`).join(',');
          articles = await sb('GET',
            `articles?or=(${or})&select=title&order=published_at.desc&limit=8`) || [];
        }

        const gen = await generateHubConfig(item, articles);
        const config = normalizeConfig(gen, item, today);

        // 최소 품질 게이트 — 껍데기만 있는 허브를 게시하지 않는다.
        const docCount = Object.values(config.evergreen).reduce((n, b) => n + b.items.length, 0);
        if (config.faq.length < 2 || docCount < 4) {
          throw new Error(`생성 품질 미달(faq ${config.faq.length}, 가이드 ${docCount}) — 게시하지 않는다`);
        }

        if (!isDry) {
          await sb('POST', 'hubs', [{
            slug: config.slug,
            title: config.title,
            category: config.category,
            config,
            auto_generated: true,
            review_status: 'unreviewed',
            source_queue_id: item.id,
          }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
          await sb('PATCH', `evergreen_queue?id=eq.${item.id}`, { status: 'done', error_message: null });
        }
        stats.created++;
        results.push({ slug: config.slug, title: config.title, faq: config.faq.length, docs: docCount, specs: config.specs.length });
      } catch (e) {
        stats.failed++;
        const attempts = (item.attempts || 0) + 1;
        if (!isDry) {
          await sb('PATCH', `evergreen_queue?id=eq.${item.id}`, {
            // 재시도 여지가 남았으면 pending으로 돌린다. 소진되면 failed로 내려 큐를 막지 않는다.
            status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            error_message: String(e.message).slice(0, 300),
          });
        }
        console.error(`EVERGREEN_HUB_FAILED: ${item.hub_slug} (${attempts}/${MAX_ATTEMPTS}):`, e.message);
        results.push({ slug: item.hub_slug, error: e.message.slice(0, 120) });
      }
    }

    console.log(`EVERGREEN_HUB_DONE${isDry ? '[dry]' : ''}: 선택 ${stats.picked} → 생성 ${stats.created}, 실패 ${stats.failed}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: isDry, ...stats, results }) };
  } catch (e) {
    console.error('EVERGREEN_HUB_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports._testUtils = { normalizeConfig, EVERGREEN_LABELS, KIND_LABEL };
