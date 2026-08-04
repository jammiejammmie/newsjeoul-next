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
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 3500, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`문서 파싱 실패(stop=${data.stop_reason}, len=${raw.length})`);
  const parsed = JSON.parse(m[0]);

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

    const existing = await sb('GET', 'hub_documents?select=hub_slug,slug');
    const have = new Set((existing || []).map((d) => `${d.hub_slug}|${d.slug}`));

    const todo = targets
      .map((t) => ({ ...t, slug: docSlug(t.title, t.format) }))
      .filter((t) => !have.has(`${t.hubSlug}|${t.slug}`));

    const batch = todo.slice(0, limit);
    const stats = { targets: targets.length, existing: have.size, remaining: todo.length, attempted: batch.length, created: 0, failed: 0 };
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
        console.error(`HUB_DOC_FAILED: ${t.hubSlug} / ${t.title}:`, e.message);
        results.push({ hub: t.hubSlug, title: t.title, error: e.message.slice(0, 120) });
      }
    }

    console.log(
      `HUB_DOC_DONE${isDry ? '[dry]' : ''}: 목표 ${stats.targets} · 기존 ${stats.existing}` +
      ` · 남은 ${stats.remaining} → 시도 ${stats.attempted} → 생성 ${stats.created}, 실패 ${stats.failed}`
    );
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dry: isDry, ...stats, results }) };
  } catch (e) {
    console.error('HUB_DOC_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

exports._testUtils = { docSlug, FORMATS, FORMAT_INTENT, MIN_BLOCKS };
