// generate-hub-documents-background.js
// 허브 에버그린 4포맷의 "제목만 있는 항목"을 실제 문서로 채운다.
//
// 왜 필요한가: 파일럿 5개 허브에 가이드 항목이 97개 있는데 문서는 1개도 없었다(실측).
// 제목만 있는 목록은 독자에게 막다른 길이고, 검색으로 들어올 페이지 자체가 없다는 뜻이다.
//
// 이 함수가 파일럿과 자동 생성 허브를 동시에 처리하는 이유: 둘 다 "제목 목록 → 문서" 문제이고,
// 엔진을 하나로 두면 파일럿을 채우는 과정이 자동 허브의 검증이 된다.
// TS 레지스트리 허브의 제목 목록은 lib/hubs/*.ts에 있으므로, 이 함수가 읽을 수 있도록
// hub_document_targets 뷰 대신 빌드시 생성한 JSON(public/hub-targets.json)을 쓴다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.URL || 'https://newsjeoul.co.kr';

const MAX_DOCS_PER_RUN = 8;   // Claude 1회/문서. 3시간마다 8건 = 하루 64건
const MIN_BLOCKS = 2;
const FORMATS = ['howto', 'troubleshoot', 'compare', 'buying'];

// 2026-08-06: 3500 → 8000. 실측에서 회당 8건 시도 중 3~5건만 생성되고 나머지가 조용히
// 실패하고 있었다(파일럿 5개 중 excel 0건·ev-subsidy 2건의 직접 원인 중 하나). 원인은
// "blocks 3~6개 × 각 2~5문단"을 한국어로 쓰면 3500토큰을 넘겨 응답이 잘리고, 잘린 JSON이
// 파싱 실패로 통째로 버려진 것이다. 한국어는 같은 내용에 영어보다 토큰을 더 쓴다.
const MAX_TOKENS = 8000;

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

/** 문서 제목 → URL 조각. 한글 제목이 대부분이라 해시 접미사로 유일성을 만든다. */
function docSlug(title, format) {
  const ascii = String(title).toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
  // 제목이 전부 한글이면 ascii가 빈다 — format + 안정적 해시로 만든다.
  let h = 0;
  for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) % 0xffffffff;
  const suffix = h.toString(36).slice(0, 6);
  const head = ascii ? ascii.slice(0, 40).replace(/^-|-$/g, '') : format;
  return `${head}-${suffix}`;
}

const FORMAT_INTENT = {
  howto: '독자는 "어떻게 하는지" 단계를 알고 싶다. 순서대로 실행할 수 있게 써라.',
  troubleshoot: '독자는 이미 문제를 겪고 있다. 원인별로 나눠 각각의 해결 방법을 써라.',
  compare: '독자는 선택을 앞두고 있다. 무엇이 다른지, 어떤 경우에 무엇을 골라야 하는지 써라.',
  buying: '독자는 준비 중이다. 미리 챙길 것과 놓치기 쉬운 것을 체크리스트로 써라.',
};

/**
 * 모델 응답 → 문서 객체. 응답이 잘린 경우(stop_reason=max_tokens) 통째로 버리지 않고
 * **완결된 블록만** 건져낸다.
 *
 * 왜 구제하는가: 잘림은 마지막 블록 하나만 미완인 경우가 대부분이다. 앞의 완결된 3~5개
 * 블록은 멀쩡한 본문인데, JSON.parse가 실패한다는 이유로 문서 전체를 버리면 그 회차의
 * 생성 슬롯이 통째로 날아간다. 아래 MIN_BLOCKS 검증은 그대로 통과해야 하므로 품질 기준이
 * 낮아지지는 않는다 — 구제해도 블록이 부족하면 여전히 실패로 처리된다.
 */
function parseDocumentJson(raw, stopReason) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* 아래 구제 경로로 넘어간다 */ }
  }
  const lead = (raw.match(/"lead"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
  const sourceNote = (raw.match(/"sourceNote"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
  // heading/content 쌍이 **둘 다 닫힌** 것만 취한다. 미완 블록은 여기서 자연히 빠진다.
  const blocks = [];
  const pairRe = /"heading"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let hit;
  while ((hit = pairRe.exec(raw))) {
    try {
      blocks.push({ heading: JSON.parse(`"${hit[1]}"`), content: JSON.parse(`"${hit[2]}"`) });
    } catch { /* 이 블록만 버린다 */ }
  }
  if (!blocks.length) {
    throw new Error(`문서 파싱 실패(stop=${stopReason}, len=${raw.length}) — 구제 가능한 블록 없음`);
  }
  console.warn(`HUB_DOC_SALVAGED: stop=${stopReason} · 완결 블록 ${blocks.length}개만 저장`);
  return {
    lead: lead ? JSON.parse(`"${lead}"`) : '',
    blocks,
    sourceNote: sourceNote ? JSON.parse(`"${sourceNote}"`) : null,
  };
}

async function generateDocument(target) {
  const prompt = `'${target.hubTitle}' 허브에 들어갈 가이드 문서를 써라.

문서 제목: ${target.title}
문서 성격: ${FORMAT_INTENT[target.format] || FORMAT_INTENT.howto}

★ 절대 규칙:
1. **모르는 것은 쓰지 마라.** 구체적 금액·날짜·모델명·법조항이 확실하지 않으면 그 문장을
   쓰지 말고, 대신 "어디서 확인해야 하는지"를 알려줘라. 틀린 숫자는 독자를 잘못된 결정으로 이끈다.
2. 확인이 필요한 값은 "거주지 공고에서 확인" 같은 식으로 명시해라. 추측한 값을 단정하지 마라.
3. 일반론으로 분량을 채우지 마라("잘 알아보는 것이 중요합니다" 같은 문장은 정보가 0이다).
   쓸 내용이 부족하면 블록 수를 줄여라.
4. 독자가 실제로 막히는 지점을 다뤄라. 목차 같은 서술이 아니라 실행 가능한 내용이어야 한다.

아래 JSON만 반환해라(설명·코드블록 없이):
{
  "lead": "이 문서가 무엇을 해결해 주는지 1~2문장",
  "blocks": [
    {"heading": "소제목", "content": "본문. 문단 사이는 \\n\\n으로 구분. 목록은 '- '로 시작."}
  ],
  "sourceNote": "이 내용의 근거와 확인처 한 줄. 예: '지자체 공고 기준. 금액은 공고마다 바뀌므로 신청 전 확인 필요.'"
}

blocks는 3~6개. 각 블록 본문은 2~5문단.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = parseDocumentJson(raw, data.stop_reason);

  const blocks = (Array.isArray(parsed.blocks) ? parsed.blocks : [])
    .map((b) => ({
      heading: typeof b?.heading === 'string' ? b.heading.trim().slice(0, 120) : '',
      content: typeof b?.content === 'string' ? b.content.trim() : '',
    }))
    .filter((b) => b.heading && b.content.length >= 80);

  if (blocks.length < MIN_BLOCKS) {
    throw new Error(`본문 부족(유효 블록 ${blocks.length}개, 최소 ${MIN_BLOCKS}) — 저장하지 않는다`);
  }
  return {
    lead: typeof parsed.lead === 'string' ? parsed.lead.trim().slice(0, 500) : '',
    blocks,
    sourceNote: typeof parsed.sourceNote === 'string' ? parsed.sourceNote.trim().slice(0, 300) : null,
  };
}

/**
 * 남은 문서를 "지금 문서가 가장 적은 허브부터" 한 건씩 꺼내도록 재정렬한다.
 *
 * ★ 2026-08-06 수정. 전에는 collectTargets가 만든 순서(허브 목록 순서 × 포맷 순서)를 그대로
 *   slice(0, limit)로 잘랐다. 그 결과 앞쪽 허브가 16건을 다 채울 때까지 뒤쪽 허브는 한 건도
 *   생성되지 않았다 — 실측(2026-08-06): galaxy-z-fold8 16 · audi-q9 16 · youth-monthly-rent 13 ·
 *   ev-subsidy 2 · **excel 0**. excel은 목록 맨 뒤라 32시간 동안 단 한 건도 못 받았고,
 *   그동안 홈 "추적 중인 허브"에서 링크되는 빈 착륙지로 노출되고 있었다.
 *
 * 가장 적은 허브를 고르므로 excel(0) → ev-subsidy(2) 순으로 먼저 채워지고, 수평이 맞으면
 * 자연히 번갈아 나간다. 특정 허브가 굶지 않는다.
 */
function balanceByHub(todo, startCounts) {
  const counts = new Map(startCounts);
  const byHub = new Map();
  for (const t of todo) {
    if (!byHub.has(t.hubSlug)) byHub.set(t.hubSlug, []);
    byHub.get(t.hubSlug).push(t);
  }
  // 슬러그 정렬로 동점 시 순서를 고정한다(같은 입력이면 같은 출력 — 테스트 가능해야 한다).
  const hubs = [...byHub.keys()].sort();
  const out = [];
  while (hubs.length) {
    let pick = 0;
    for (let i = 1; i < hubs.length; i++) {
      if ((counts.get(hubs[i]) || 0) < (counts.get(hubs[pick]) || 0)) pick = i;
    }
    const slug = hubs[pick];
    const list = byHub.get(slug);
    out.push(list.shift());
    counts.set(slug, (counts.get(slug) || 0) + 1);
    if (!list.length) hubs.splice(pick, 1);
  }
  return out;
}

/** 채워야 할 문서 목록을 만든다. TS 허브는 빌드 산출물에서, 자동 허브는 config에서 읽는다. */
async function collectTargets() {
  const targets = [];

  // 1) TS 레지스트리 허브(파일럿 5개) — 빌드시 생성한 목록 파일에서 읽는다.
  try {
    const res = await fetch(`${BASE_URL}/hub-targets.json`);
    if (res.ok) {
      const list = await res.json();
      for (const h of list) {
        for (const format of FORMATS) {
          for (const title of h.items?.[format] || []) {
            targets.push({ hubSlug: h.slug, hubTitle: h.title, format, title });
          }
        }
      }
    } else {
      console.warn(`hub-targets.json 조회 실패(${res.status}) — TS 허브 문서 생성을 건너뛴다`);
    }
  } catch (e) {
    console.warn('hub-targets.json 조회 예외 — TS 허브 건너뜀:', e.message);
  }

  // 2) 자동 생성 허브 — config.evergreen에서 읽는다.
  const dbHubs = await sb('GET', 'hubs?config=not.is.null&select=slug,title,config');
  for (const h of dbHubs || []) {
    for (const format of FORMATS) {
      for (const item of h.config?.evergreen?.[format]?.items || []) {
        if (item?.title) targets.push({ hubSlug: h.slug, hubTitle: h.title, format, title: item.title });
      }
    }
  }
  return targets;
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
  const limit = Math.min(Number(event.queryStringParameters?.limit) || MAX_DOCS_PER_RUN, 20);
  const onlyHub = event.queryStringParameters?.hub || null;

  try {
    let targets = await collectTargets();
    if (onlyHub) targets = targets.filter((t) => t.hubSlug === onlyHub);

    // limit=1000이 PostgREST 기본 상한이다 — 문서가 늘면 "이미 있음" 판정이 조용히 틀려
    // 같은 문서를 다시 만들게 되므로 명시적으로 올려 둔다.
    const existing = await sb('GET', 'hub_documents?select=hub_slug,slug&limit=5000');
    const have = new Set((existing || []).map((d) => `${d.hub_slug}|${d.slug}`));
    const countByHub = new Map();
    for (const d of existing || []) countByHub.set(d.hub_slug, (countByHub.get(d.hub_slug) || 0) + 1);

    const todo = balanceByHub(
      targets
        .map((t) => ({ ...t, slug: docSlug(t.title, t.format) }))
        .filter((t) => !have.has(`${t.hubSlug}|${t.slug}`)),
      countByHub
    );

    const batch = todo.slice(0, limit);
    const stats = { targets: targets.length, existing: have.size, remaining: todo.length, attempted: batch.length, created: 0, failed: 0 };
    const failReasons = {};
    const results = [];

    for (const t of batch) {
      try {
        const doc = await generateDocument(t);
        if (!isDry) {
          await sb('POST', 'hub_documents', [{
            hub_slug: t.hubSlug, format: t.format, slug: t.slug, title: t.title,
            lead: doc.lead, blocks: doc.blocks, source_note: doc.sourceNote,
            status: 'published', generated_by: 'ai',
          }], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
        }
        stats.created++;
        results.push({ hub: t.hubSlug, title: t.title, blocks: doc.blocks.length });
      } catch (e) {
        stats.failed++;
        // 실패 사유를 종류별로 센다 — "8건 시도 4건 생성"만 남던 로그로는 원인을 못 좁혔다.
        const kind = /파싱 실패/.test(e.message) ? '파싱실패'
          : /본문 부족/.test(e.message) ? '본문부족'
          : /Claude API/.test(e.message) ? 'API에러' : '기타';
        failReasons[kind] = (failReasons[kind] || 0) + 1;
        console.error(`HUB_DOC_FAILED: ${t.hubSlug} / ${t.title}:`, e.message);
        results.push({ hub: t.hubSlug, title: t.title, error: e.message.slice(0, 120) });
      }
    }

    const perHub = {};
    for (const r of results) if (!r.error) perHub[r.hub] = (perHub[r.hub] || 0) + 1;
    console.log(
      `HUB_DOC_DONE${isDry ? '[dry]' : ''}: 목표 ${stats.targets} · 기존 ${stats.existing}` +
      ` · 남은 ${stats.remaining} → 시도 ${stats.attempted} → 생성 ${stats.created}, 실패 ${stats.failed}` +
      ` | 허브별 생성 ${JSON.stringify(perHub)} | 실패사유 ${JSON.stringify(failReasons)}`
    );
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: isDry, ...stats, perHub, failReasons, results }) };
  } catch (e) {
    console.error('HUB_DOC_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports._testUtils = { docSlug, FORMATS, FORMAT_INTENT, MIN_BLOCKS, MAX_TOKENS, balanceByHub, parseDocumentJson };
