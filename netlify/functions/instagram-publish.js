// instagram-publish.js — 인스타그램 카드뉴스 자동 게시 (2026-08-17, PM 지시)
//
// ── 사전 조사 결과 (Meta 공식 문서 실측 확인) ──────────────────────────────
// Q. 페이스북 페이지 연결이 필요한가? → **필요 없다.**
//    "Instagram API with Instagram Login" 방식은 공식 문서에 다음과 같이 명시돼 있다:
//    "This API setup does not require a Facebook Page to be linked to the Instagram
//     professional account."
//    (구방식인 "Instagram API with Facebook Login"은 페이지가 필요하고, 그 경우
//     Page Publishing Authorization(PPA)까지 끝나야 게시가 된다. 우리는 구방식을 쓰지 않는다.)
//
// Q. 릴스로 올릴 수 있나? → **카드뉴스 이미지로는 안 된다.**
//    REELS는 media_type=REELS + video_url(MP4)만 받는다. 이미지 URL로는 릴스를 만들 수 없다.
//    카드뉴스의 올바른 포맷은 CAROUSEL(최대 10장) 또는 단일 IMAGE다. 이 함수는 그 둘을 쓴다.
//    릴스가 꼭 필요하면 카드 이미지를 MP4로 렌더하는 단계가 따로 있어야 한다(Netlify Function에서
//    ffmpeg는 현실적이지 않아 별도 워커가 필요 — 지금은 범위 밖).
//
// Q. 이미지를 직접 업로드하나? → 아니다. **공개 URL**로만 받는다.
//    그래서 app/card/route.tsx가 그 공개 URL 역할을 한다(https://newsjeoul.co.kr/card?...).
//
// 게시 한도: 24시간 이동창 기준 100건(캐러셀은 1건으로 계산). GET /content_publishing_limit로 확인 가능.
//
// ── 필요한 환경변수 (미설정 시 이 함수는 아무것도 하지 않고 그 사실을 반환한다) ──
//   INSTAGRAM_USER_ID      — 인스타 프로페셔널 계정(newsjeoul)의 IG User ID
//   INSTAGRAM_ACCESS_TOKEN — 장기 토큰(60일). 스코프: instagram_business_basic,
//                            instagram_business_content_publish
//
// 아직 자격증명이 없어 **실게시 경로는 검증되지 않았다**. dry=true로 호출하면 실제 API를 치지 않고
// 어떤 요청을 보낼지(슬라이드 URL·캡션·엔드포인트)만 반환하므로 그 부분은 지금도 검증 가능하다.

const { buildCta } = require('./engagement-cta');
const { buildCoverHook } = require('./cover-hook');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const IG_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;

const GRAPH = 'https://graph.instagram.com/v23.0';
const SITE = 'https://newsjeoul.co.kr';
const CHANNEL = 'instagram';
const MAX_SLIDES = 10; // 캐러셀 상한(Meta 규격)
const CAPTION_MAX = 2200;

// ── 게시량·선별 (2026-08-17 PM 지시, 스레드와 같은 기준) ────────────────────
// 스레드 실행에 물려 같이 돌기 때문에(post-threads-background 말미에서 호출), 실행 주기가
// 30분이면 하루 48회 호출될 수 있다. 호출마다 1건씩 올리면 인스타 한도(100건/24h)에는 안 걸려도
// 계정이 스팸처럼 보인다. 그래서 스레드와 같은 하루 상한을 여기서 직접 건다.
const IG_DAILY_MAX = 15;
const MIN_BUZZ_SCORE_FOR_POST = 25;
const BUZZ_FLOOR_MIN_SAMPLE = 10;
// 카드뉴스는 3~5장(표지 + 본문 2~3 + 마무리)을 목표로 한다 — PM 지시 규격.
const TARGET_SLIDE_MIN = 3;
const TARGET_SLIDE_MAX = 5;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + (await res.text()));
  return res.json();
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} 실패: ` + (await res.text()));
}

function cardUrl(params) {
  const qs = new URLSearchParams(params).toString();
  return `${SITE}/card?${qs}`;
}

// ── 카드 구성 ───────────────────────────────────────────────────────────────
// Threads와 같은 원칙을 쓴다(PM 지시 §5): 대립 사안은 찬반 양측을, 그 외는 "표면 뒤의 배경"을 보여준다.
// 이미 generate-editorial-draft가 만들어둔 draft.perspective_markers(엇갈리는 시각)를 그대로 재사용하므로
// 카드뉴스를 위해 Claude를 다시 호출하지 않는다(비용 0).
function buildSlides(topic) {
  const draft = topic.ai_context?.draft || {};
  const perspectives = draft.perspective_markers || [];
  const category = topic.category || '';
  const badge = CATEGORY_BADGE[category] || '오늘의 이슈';

  // 표지는 제목을 그대로 쓰지 않는다(2026-08-17 개편) — cover-hook이 실제 숫자·유형을 근거로
  // 스크롤을 멈출 훅을 만든다. 없는 사실은 만들지 않는다(cover-hook.js 주석 참고).
  const hook = buildCoverHook(topic);
  const slides = [
    {
      slide: 'cover',
      title: topic.name,
      category,
      badge,
      hook: hook.hook,
      sub: hook.sub,
      emoji: hook.emoji,
      stat: hook.stat,
    },
  ];

  const lead = draft.lead || topic.summary || '';
  if (lead) {
    slides.push({ slide: 'body', heading: '무슨 일인가', text: lead, category });
  }

  // 대립형 — 엇갈리는 시각이 2개 이상이면 양측을 각각 한 장씩.
  if (perspectives.length >= 2) {
    slides.push({ slide: 'body', heading: '이렇게 본다', text: perspectives[0].claim, category });
    slides.push({ slide: 'body', heading: '이렇게도 본다', text: perspectives[1].claim, category });
  } else if (perspectives.length === 1) {
    slides.push({ slide: 'body', heading: '놓치기 쉬운 점', text: perspectives[0].claim, category });
  }

  slides.push({ slide: 'end', text: '매일 이슈의 이면을 봅니다' });

  // 3~5장 규격 유지. 5장을 넘으면 마무리는 남기고 본문 카드를 앞에서부터 잘라낸다.
  if (slides.length > TARGET_SLIDE_MAX) {
    const end = slides[slides.length - 1];
    slides.length = TARGET_SLIDE_MAX - 1;
    slides.push(end);
  }

  return slides.slice(0, MAX_SLIDES).map((s, i, arr) => ({
    ...s,
    i: i + 1,
    n: arr.length,
    url: cardUrl({ ...s, i: i + 1, n: arr.length }),
  }));
}

const CATEGORY_BADGE = {
  Society: '정치·사회', Economy: '경제', Business: '기업', Technology: '테크·AI',
  Sports: '스포츠', Entertainment: '연예', Health: '건강', Science: '과학',
  Automobile: '자동차', Lifestyle: '라이프', Crypto: '크립토',
};

function buildCaption(topic) {
  const draft = topic.ai_context?.draft || {};
  const lead = draft.lead || topic.summary || '';
  const keywords = (draft.display_keywords || []).slice(0, 5);
  const tags = keywords.map((k) => '#' + String(k).replace(/[^\p{L}\p{N}]/gu, '')).filter((t) => t.length > 1);

  // 참여 유도(2026-08-17 PM 지시) — 해시태그 **앞**에 둔다.
  // 해시태그 뒤로 밀면 인스타가 캡션을 접을 때 "...더 보기" 아래로 들어가 아무도 못 본다.
  const cta = buildCta(topic);

  const body = [
    topic.name,
    '',
    lead,
    '',
    cta.question,
    cta.save,
    '',
    '전체 내용은 프로필 링크에서 확인하세요.',
    '',
    ['#뉴스저울', '#뉴스', ...tags].join(' '),
  ].join('\n');

  return body.length > CAPTION_MAX ? body.slice(0, CAPTION_MAX - 1) + '…' : body;
}

// ── Instagram Graph API ─────────────────────────────────────────────────────
async function igPost(path, params) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, access_token: IG_TOKEN }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`IG ${path} 실패 ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// 컨테이너 생성은 비동기다 — status_code가 FINISHED가 되어야 publish할 수 있다.
async function waitForContainer(containerId, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${IG_TOKEN}`);
    const json = await res.json().catch(() => ({}));
    if (json.status_code === 'FINISHED') return true;
    if (json.status_code === 'ERROR' || json.status_code === 'EXPIRED') {
      throw new Error(`컨테이너 ${containerId} 상태 ${json.status_code}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`컨테이너 ${containerId} 준비 시간 초과`);
}

async function publishCarousel(slides, caption) {
  // 1) 슬라이드별 자식 컨테이너
  const childIds = [];
  for (const s of slides) {
    const child = await igPost(IG_USER_ID + '/media', { image_url: s.url, is_carousel_item: true });
    childIds.push(child.id);
  }
  for (const id of childIds) await waitForContainer(id);

  // 2) 캐러셀 부모 컨테이너
  const parent = await igPost(IG_USER_ID + '/media', {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
  });
  await waitForContainer(parent.id);

  // 3) 게시
  const published = await igPost(IG_USER_ID + '/media_publish', { creation_id: parent.id });
  return { id: published.id, childCount: childIds.length };
}

async function publishSingle(slide, caption) {
  const container = await igPost(IG_USER_ID + '/media', { image_url: slide.url, caption });
  await waitForContainer(container.id);
  const published = await igPost(IG_USER_ID + '/media_publish', { creation_id: container.id });
  return { id: published.id, childCount: 1 };
}

// ── 후보 선정 ───────────────────────────────────────────────────────────────
// Threads와 동일하게 "채널당 평생 1회" 원칙을 쓴다(ai_context.instagram.posted_at).
// 우선순위는 buzz — PM 지시 "화제성/자극성 높은 이슈 우선"이 인스타에도 그대로 적용된다.
async function pickTopic() {
  const pool = await supabaseGet(
    'topics',
    `?status=eq.active&editorial_status=eq.published&ai_context->${CHANNEL}->>posted_at=is.null` +
    `&select=id,slug,name,summary,category,ai_context&order=updated_at.desc&limit=60`
  );
  // draft가 없으면 카드에 채울 내용이 없다(제목만 있는 카드뉴스는 올리지 않는다).
  const withDraft = pool.filter((t) => t.ai_context?.draft?.lead);
  if (!withDraft.length) return null;

  // buzz 상위 선별 — 스레드와 같은 문턱·같은 표본 조건을 쓴다(채널마다 기준이 다르면
  // "왜 스레드엔 올라갔는데 인스타엔 안 올라갔나"를 설명할 수 없다).
  const withBuzz = withDraft.filter((t) => typeof t.ai_context?.buzz?.score === 'number');
  let candidates = withDraft;
  if (withBuzz.length >= BUZZ_FLOOR_MIN_SAMPLE) {
    const passed = withBuzz.filter((t) => t.ai_context.buzz.score >= MIN_BUZZ_SCORE_FOR_POST);
    if (passed.length) candidates = passed;
  }

  const { sortByBuzz } = require('./buzz-engine');
  return sortByBuzz(candidates)[0];
}

// 오늘(UTC) 이미 인스타에 올린 건수 — 하루 상한 집행용.
async function fetchTodayPostedCount() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const rows = await supabaseGet(
    'topics',
    `?ai_context->${CHANNEL}->>posted_at=gte.${encodeURIComponent(todayStart)}&select=id&limit=200`
  );
  return rows.length;
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  // 자격증명이 없으면 조용히 실패하지 않고, 무엇이 없는지 명시해서 돌려준다.
  if (!isDry && (!IG_USER_ID || !IG_TOKEN)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        skipped: true,
        reason: 'missing_credentials',
        missing: [!IG_USER_ID && 'INSTAGRAM_USER_ID', !IG_TOKEN && 'INSTAGRAM_ACCESS_TOKEN'].filter(Boolean),
        note: 'Netlify 환경변수에 설정하면 이 함수는 그대로 동작한다. 페이스북 페이지 연결은 불필요.',
      }),
    };
  }

  try {
    if (!isDry) {
      const postedToday = await fetchTodayPostedCount();
      if (postedToday >= IG_DAILY_MAX) {
        console.log(`INSTAGRAM_DAILY_CAP: 오늘 ${postedToday}건으로 상한(${IG_DAILY_MAX}) 도달 — 게시하지 않음`);
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true, reason: 'daily_cap', postedToday }) };
      }
    }

    const topic = await pickTopic();
    if (!topic) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true, reason: 'no_candidate' }) };
    }

    const slides = buildSlides(topic);
    const caption = buildCaption(topic);

    if (isDry) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true, dry: true,
          topic: { id: topic.id, name: topic.name, category: topic.category, buzz: topic.ai_context?.buzz?.score ?? null },
          slideCount: slides.length,
          slides: slides.map((s) => ({ slide: s.slide, i: s.i, n: s.n, url: s.url })),
          caption,
          mediaType: slides.length > 1 ? 'CAROUSEL' : 'IMAGE',
          credentialsPresent: Boolean(IG_USER_ID && IG_TOKEN),
        }, null, 2),
      };
    }

    const result = slides.length > 1
      ? await publishCarousel(slides, caption)
      : await publishSingle(slides[0], caption);

    await supabasePatch('topics', `?id=eq.${topic.id}`, {
      ai_context: {
        ...(topic.ai_context || {}),
        [CHANNEL]: {
          posted_at: new Date().toISOString(),
          media_id: result.id,
          slide_count: result.childCount,
        },
      },
    });

    console.log(`INSTAGRAM_PUBLISHED: ${topic.name} (${result.childCount}장, media ${result.id})`);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, topic: topic.name, mediaId: result.id, slides: result.childCount }),
    };
  } catch (e) {
    console.error('instagram-publish 오류:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

module.exports.buildSlides = buildSlides;
module.exports.buildCaption = buildCaption;
module.exports.cardUrl = cardUrl;
