// publish-routed-content-background.js — Content Routing Gate의 "발행" 단계
// 근거: PM 지시(2026-08-03, "발행 파이프라인 처리량 올려줘 — 하루 13건밖에 안 됨").
//
// ── 왜 이 함수가 필요한가(실측으로 찾은 병목) ────────────────────────────────
// Content Routing Gate는 수집된 Topic을 8가지 유형으로 분류한다. 그런데 실제로 발행까지
// 도달하는 경로는 DEEP_DIVE 하나뿐이었다 — generate-editorial-draft-background.js가
// `gate_status=eq.DEEP_DIVE`만 집고, 이 저장소에서 `editorial_status: 'published'`를
// 쓰는 곳은 그 파일 단 한 곳이다. 나머지 6개 유형은 분류만 되고 영구히 planned에 머물렀다.
// (generate-publish-gate-background.js 헤더에 "나머지 6개는 분류·저장까지만, 전용 생성
//  파이프라인은 후속 작업으로 남긴다"고 적혀 있다 — 그 후속 작업이 이 파일이다.)
//
// 실측(2026-08-03):
//   · planned 321건 = SHORT_BRIEF 236 / UPDATE 32 / SEARCH_GUIDE 16 / BACKGROUND 15 /
//     PRODUCT_BRIEF 8 / COMPARE 5 / 기타
//   · published 227건은 전부 DEEP_DIVE(204) + 레거시 — 일 발행량 약 13건
//   · 신규 Topic 유입은 일 32~59건 → 2/3가 발행되지 못하고 적체
//
// ── 왜 AI를 호출하지 않는가(이게 이 함수의 핵심) ─────────────────────────────
// 본문을 새로 생성할 필요가 없다. generate-expansion-drafts-background가 이미 각 유형별
// 완성된 글(title/lead/body/editor/display_keywords)을 ai_context.expansion_drafts에
// 써두었고, 그 글은 이미 /topic/{slug}/{angle}로 공개 렌더링되며 sitemap에도 올라가 있다
// (2026-08-03 라이브 확인: HTTP 200, 본문 정상 렌더). 즉 콘텐츠는 이미 발행돼 있는데
// 부모 Topic만 planned로 남아서 (1) /topic/{slug}가 "장문 분석 준비 중"으로 보이고
// (2) 목록/홈에서 빠지고 (3) Threads 배급 후보에서 제외되고 있었다.
//
// 그래서 이 함수는 "생성"이 아니라 "승격"만 한다 — AI 비용 0, 실행당 수십 건 처리 가능.
// 새로 노출되는 콘텐츠가 없으므로(이미 공개 상태) 품질 리스크도 낮다.
//
// Background Function(15분 예산) — Editorial Engine 다른 함수들과 동일 패턴.

const { prioritizeForPublish, fetchRecentPublished } = require('./buzz-engine');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

// AI 호출이 없어 건당 비용이 DB 왕복 3회(story 링크·기사·PATCH)뿐이므로 배치를 크게 잡을 수 있다.
// 40건 x 약 3회 왕복이면 15분 예산에 여유가 크다. 적체 248건은 3시간 주기 기준 하루 안에 소진된다.
const BATCH_SIZE = 40;

// gate_status → expansion_drafts에 저장된 angle slug.
// generate-expansion-drafts-background.js의 ANGLE_CONFIG와 반드시 일치해야 한다(값이 어긋나면
// 해당 유형이 조용히 승격되지 않고 계속 적체된다 — 아래 스크립트/테스트로 일치를 고정한다).
// DEEP_DIVE는 전용 파이프라인(generate-editorial-draft-background)이 있으므로 여기서 절대 다루지 않는다.
// REJECT/pending_gate도 대상이 아니다.
const ROUTE_ANGLE = {
  SHORT_BRIEF: 'brief-short',
  UPDATE: 'update',
  SEARCH_GUIDE: 'guide',
  BACKGROUND: 'background',
  PRODUCT_BRIEF: 'brief',
  COMPARE: 'compare',
};
const ROUTABLE_GATES = Object.keys(ROUTE_ANGLE);

// 승격 최소 조건 — 이보다 짧은 글은 발행하지 않는다(Threads 품질 게이트의 MIN_BODY_LENGTH와 동일 기준).
const MIN_BODY_LENGTH = 300;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} 실패: ` + await res.text());
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
  if (!res.ok) throw new Error(`Supabase PATCH ${table} 실패: ` + await res.text());
}

// 출처 수집 — generate-editorial-draft-background.js의 gatherEvidence와 같은 경로
// (topic_stories → story_articles → articles). 신규 조달 없이 이미 있는 데이터만 읽는다.
//
// 출처가 필요한 이유: Threads 배급의 품질 게이트가 evidence.sources에 url이 하나라도 있어야
// 통과시킨다(post-threads-background.js passesMinimumQuality). 출처 없이 승격하면 웹 페이지는
// 생기지만 배급 후보에는 영구히 오르지 못한다 — 처리량을 올리는 목적이 절반만 달성된다.
// 실측(2026-08-03): 승격 대상 199건 전부 topic_stories 연결이 있고, 표본 8건 전부 url 있는
// 기사까지 도달했다.
async function gatherSources(topicId) {
  const storyLinks = await supabaseGet(
    'topic_stories',
    `?topic_id=eq.${topicId}&select=story_id&order=relevance_score.desc&limit=8`
  );
  const storyIds = storyLinks.map((l) => l.story_id).filter(Boolean);
  if (!storyIds.length) return [];
  const articleLinks = await supabaseGet(
    'story_articles',
    `?story_id=in.(${storyIds.join(',')})&select=articles(title,url,outlets(name))`
  );
  const seen = new Set();
  return articleLinks
    .map((r) => r.articles)
    .filter((a) => a && a.url && !seen.has(a.url) && seen.add(a.url)) // 같은 기사가 여러 story에 걸리면 중복 제거
    .slice(0, 6)
    .map((a) => ({ title: a.title, url: a.url, outlet: a.outlets?.name || null }));
}

// expansion draft → ai_context.draft 변환.
//
// blocks를 문단마다 쪼개지 않고 통째로 1개만 만드는 이유: 토픽 페이지의 PerspectiveExplorer는
// blocks를 "축 탭"으로 렌더링한다(블록 하나 = 탭 하나). 짧은 글을 문단 단위로 쪼개면 '요약'
// 탭이 3~7개 생겨서 읽기 흐름이 망가진다. 대신 PerspectiveExplorer가 블록 본문을 빈 줄 기준으로
// 문단 분리해 <p>로 렌더링하므로(renderParagraphs), 한 블록에 원문을 그대로 넣는 편이 맞다.
// (Threads Editorial Score는 blocks>=2에 +5를 주지만, 5점보다 읽기 품질이 우선이다 —
//  단일 블록이어도 실측 기준 총점이 60 하한을 넘는다.)
function buildDraftFromExpansion(expansion) {
  const body = (expansion.body || '').trim();
  return {
    lead: (expansion.lead || '').trim(),
    blocks: [{ axis: expansion.label || '요약', content: body }],
    display_keywords: expansion.display_keywords || [],
    generated_at: expansion.generated_at || new Date().toISOString(),
    // 승격으로 만들어진 draft임을 남긴다 — 나중에 "장문 발행"과 "라우팅 발행"을 구분해
    // 통계를 내거나 되돌릴 때 필요하다.
    promoted_from: { angle: expansion.angle, title: expansion.title || null, editor: expansion.editor || null },
  };
}

// 승격 가능 여부 판정 — 이유를 문자열로 돌려주면 로그에서 왜 건너뛰었는지 바로 보인다.
function evaluateTopic(topic) {
  if (!ROUTABLE_GATES.includes(topic.gate_status)) return { ok: false, reason: 'gate_not_routable' };
  // 이미 장문 draft가 있으면 절대 건드리지 않는다(DEEP_DIVE 결과물 덮어쓰기 방지).
  if (topic.ai_context?.draft) return { ok: false, reason: 'draft_already_exists' };
  const angle = ROUTE_ANGLE[topic.gate_status];
  const expansion = (topic.ai_context?.expansion_drafts || []).find((d) => d.angle === angle);
  if (!expansion) return { ok: false, reason: 'expansion_missing' };
  const body = (expansion.body || '').trim();
  if (!body) return { ok: false, reason: 'expansion_body_empty' };
  if (body.length < MIN_BODY_LENGTH) return { ok: false, reason: 'body_too_short' };
  if (!(expansion.lead || '').trim()) return { ok: false, reason: 'expansion_lead_empty' };
  return { ok: true, expansion };
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled Function은 x-admin-key 없이 호출되므로 x-nf-event로 식별한다
  // (2026-07-17 확인 — 이 조건이 없으면 자동 호출이 전부 401로 조용히 거부된다).
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    // ── buzz 우선순위 + 카테고리 쿼터 (2026-08-17, PM 지시) ─────────────────
    // 종전 정렬 기준은 importance_score(무게 엔진 산출값)였다. 무게는 "사회적 중요도" 축이고
    // buzz는 "지금 얼마나 뜨거운가" 축이라 서로 다른 것을 잰다. 발행 순서는 buzz가 정하고,
    // 무게는 동점 처리와 화면 표시에 계속 쓴다(둘 중 하나를 버리지 않는다).
    const POOL_SIZE = Math.max(BATCH_SIZE * 6, 60);
    const pool = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.planned&gate_status=in.(${ROUTABLE_GATES.join(',')})` +
      `&select=id,name,slug,category,gate_status,importance_score,ai_context,updated_at` +
      `&order=importance_score.desc&limit=${POOL_SIZE}`
    );

    const recentPublished = await fetchRecentPublished(supabaseGet);
    const priority = prioritizeForPublish(pool, BATCH_SIZE, recentPublished);
    const topics = priority.selected;
    const quotaDeferred = priority.deferred.filter((d) => String(d.defer_reason).startsWith('quota_full')).length;
    console.log(
      `발행 우선순위: 후보 ${pool.length}건 → 선정 ${topics.length}건 (쿼터 보류 ${quotaDeferred}건), ` +
      `최근 24h 발행 ${recentPublished.length}건, 상한 ${JSON.stringify(priority.report.capOf)}`
    );

    const stats = { considered: topics.length, poolSize: pool.length, quotaDeferred, published: 0, skipped: 0, failed: 0 };
    const skipReasons = {};
    const byGate = {};
    const samples = [];

    for (const topic of topics) {
      const verdict = evaluateTopic(topic);
      if (!verdict.ok) {
        stats.skipped++;
        skipReasons[verdict.reason] = (skipReasons[verdict.reason] || 0) + 1;
        continue;
      }

      try {
        const draft = buildDraftFromExpansion(verdict.expansion);
        const sources = await gatherSources(topic.id);

        if (isDry) {
          stats.published++;
          byGate[topic.gate_status] = (byGate[topic.gate_status] || 0) + 1;
          if (samples.length < 3) {
            samples.push({
              name: topic.name, slug: topic.slug, gate: topic.gate_status,
              leadLen: draft.lead.length, bodyLen: draft.blocks[0].content.length,
              keywords: draft.display_keywords.length, sources: sources.length,
            });
          }
          continue;
        }

        // ai_context는 반드시 병합 저장 — 통째로 덮어쓰면 plan(에디터 배정)/gate/weight/
        // expansion_drafts/threads가 사라진다(2026-08-03 generate-node-insights에서 실제로
        // 28건이 이 방식으로 손상됐다. 같은 실수를 반복하지 않는다).
        // evidence는 기존 값이 있으면 유지하고, 없을 때만 새로 넣는다.
        const existingEvidence = topic.ai_context?.evidence;
        const evidence = existingEvidence?.sources?.length
          ? existingEvidence
          : { ...(existingEvidence || {}), sources };

        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          editorial_status: 'published',
          ai_context: { ...(topic.ai_context || {}), draft, evidence },
          // ai_outlook은 의도적으로 건드리지 않는다. DEEP_DIVE 경로는 ai_outlook에 lead를
          // 넣지만(사실상 오용), ai_outlook의 의미는 "향후 전망"이고 generate-node-insights가
          // `ai_outlook=is.null`로 미처리 Topic을 찾는 기준이기도 하다. 비워두면 이 Topic들이
          // 나중에 insights(산업영향·유사사례 등) 보강을 정상적으로 받는다.
        });

        stats.published++;
        byGate[topic.gate_status] = (byGate[topic.gate_status] || 0) + 1;
        if (samples.length < 3) samples.push({ name: topic.name, slug: topic.slug, gate: topic.gate_status, sources: sources.length });
      } catch (e) {
        stats.failed++;
        console.error(`ROUTED_PUBLISH_FAILED: ${topic.id} (${topic.name}):`, e.message);
      }
    }

    console.log(
      `ROUTED_PUBLISH_DONE${isDry ? '[dry]' : ''}: 대상 ${stats.considered} → 발행 ${stats.published}` +
      `, 건너뜀 ${stats.skipped}, 실패 ${stats.failed} | 유형별 ${JSON.stringify(byGate)}` +
      ` | 건너뛴 이유 ${JSON.stringify(skipReasons)}`
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, dry: isDry, ...stats, byGate, skipReasons, samples }),
    };
  } catch (e) {
    console.error('ROUTED_PUBLISH_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

// 테스트 전용 — 순수 함수만 노출(DB/네트워크 없이 판정·변환 로직을 검증한다).
exports._testUtils = { evaluateTopic, buildDraftFromExpansion, ROUTE_ANGLE, ROUTABLE_GATES, BATCH_SIZE, MIN_BODY_LENGTH };
