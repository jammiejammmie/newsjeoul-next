// generate-expansion-drafts-background.js — Expansion Engine
// 근거: PM 지시(2026-07-19, "뉴스저울 KPI = 검색되는 가치 있는 페이지 수". 하나의 Topic에서 여러 명의
// 에디터가 서로 다른 글을 생성, 중요한 Topic은 5~20개, 일반 Topic도 최소 1개).
//
// 기존 문제: Content Routing Gate가 8종으로 분류는 하지만 DEEP_DIVE 외 6종(SEARCH_GUIDE/PRODUCT_BRIEF/
// COMPARE/BACKGROUND/UPDATE/SHORT_BRIEF)은 "분류만 하고 저장"으로 끝나 실제 페이지가 생성되지 않았다.
// 이 함수는 그 6종에 실제 생성 파이프라인을 연결하고, DEEP_DIVE Topic 중 무게가 높은 것에는 추가
// 앵글(비교/가이드/배경/FAQ)을 덧붙인다 — 하나의 Topic이 여러 개의 실제 색인 대상 페이지가 되게 한다.
//
// 저장 위치: topics.ai_context.expansion_drafts(배열, append-only) — 기존 draft(DEEP_DIVE 본편)와
// 별도. 각 항목이 /topic/{slug}/{angle} 페이지로 렌더링된다(app/topic/[slug]/[angle]/page.tsx).
//
// Background Function(15분 예산).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 15; // Topic 단위 — 각 Topic당 앵글 1~3개씩 생성하므로 실제 생성 건수는 더 많음

// 라우팅 결과 → 앵글 매핑. DEEP_DIVE는 이미 본편이 있으므로 여기서는 "추가 앵글"만 다룬다.
const ANGLE_CONFIG = {
  SEARCH_GUIDE: { slug: 'guide', label: '신청 가이드', missions: ['SEARCH_GUIDE', '신청방법정리', '대상조건', '일정기한'], focus: '대상·조건, 신청 방법, 필요 서류, 신청 기간, 주의사항을 표 형태처럼 명확히 정리', minLen: 800, maxLen: 1400 },
  PRODUCT_BRIEF: { slug: 'brief', label: '핵심 정리', missions: ['PRODUCT_BRIEF', '구매판단', '비교분석'], focus: '가격·사양·출시일·경쟁제품·장단점·구매 대상을 실용적으로 정리', minLen: 800, maxLen: 1300 },
  COMPARE: { slug: 'compare', label: '비교 분석', missions: ['COMPARE', '비교분석'], focus: '비교 대상과의 차이·장단점을 구체적 기준으로 비교', minLen: 900, maxLen: 1500 },
  BACKGROUND: { slug: 'background', label: '배경과 역사', missions: ['BACKGROUND', '배경역사'], focus: '이 사건/제도/인물의 배경과 역사적 맥락', minLen: 900, maxLen: 1500 },
  UPDATE: { slug: 'update', label: '업데이트', missions: ['UPDATE', '업데이트브리핑'], focus: '기존 대비 무엇이 달라졌는지, 변경 이력', minLen: 600, maxLen: 1100 },
  SHORT_BRIEF: { slug: 'brief-short', label: '요약', missions: ['SHORT_BRIEF'], focus: '핵심만 짧고 명확하게', minLen: 400, maxLen: 800 },
};
// DEEP_DIVE Topic에 무게 기준으로 추가하는 보너스 앵글(본편 외 추가 페이지)
const BONUS_ANGLES = {
  guide: ANGLE_CONFIG.SEARCH_GUIDE,
  compare: ANGLE_CONFIG.COMPARE,
  background: ANGLE_CONFIG.BACKGROUND,
  faq: { slug: 'faq', label: '자주 묻는 질문', missions: ['FAQ', '데이터검증'], focus: '독자가 가장 궁금해할 질문 4~6개를 뽑아 Q&A 형식으로 답변', minLen: 700, maxLen: 1200 },
};

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table} 실패: ` + await res.text());
}

async function gatherEvidence(topicId) {
  const [storyLinks, timeline] = await Promise.all([
    supabaseGet('topic_stories', `?topic_id=eq.${topicId}&select=story_id&order=relevance_score.desc&limit=8`),
    supabaseGet('topic_timeline_events', `?topic_id=eq.${topicId}&select=title,event_date&order=event_date.asc&limit=10`),
  ]);
  const storyIds = storyLinks.map((l) => l.story_id);
  let sources = [];
  if (storyIds.length) {
    const articleLinks = await supabaseGet('story_articles', `?story_id=in.(${storyIds.join(',')})&select=articles(title,url,outlets(name))`);
    sources = articleLinks.map((r) => r.articles).filter(Boolean).slice(0, 6).map((a) => ({ title: a.title, url: a.url, outlet: a.outlets?.name || null }));
  }
  return { sources, timeline };
}

// 몇 명이/어떤 앵글을 만들지 결정 — 무게가 높을수록 보너스 앵글을 더 많이(§ PM 지시: 중요 Topic 5~20개)
function pickBonusAngles(weightGrams, existingAngles) {
  const pool = Object.keys(BONUS_ANGLES).filter((a) => !existingAngles.includes(a));
  const count = weightGrams >= 400 ? 3 : weightGrams >= 250 ? 2 : 1;
  return pool.slice(0, count);
}

// 앵글에 맞는 에디터 선정 — content_missions 일치 우선, 없으면 도메인 일치, 그래도 없으면 전체 폴백(0% 미배정 원칙 유지)
function pickEditorForAngle(pool, angleConfig, domain, excludeIds) {
  const available = pool.filter((e) => !excludeIds.has(e.id));
  const base = available.length ? available : pool;
  const missionMatched = base.filter((e) => (e.content_missions || []).some((m) => angleConfig.missions.includes(m)));
  const scoped = missionMatched.length ? missionMatched : base;
  const domainMatched = domain ? scoped.filter((e) => (e.domains || []).includes(domain)) : [];
  const final = domainMatched.length ? domainMatched : scoped;
  return final[0] || null;
}

function buildPrompt(topic, angleConfig, editor, evidence) {
  const editorLine = editor
    ? `이 글은 ${editor.name} 에디터(${editor.perspective_tag}${editor.specialty ? ', ' + editor.specialty : ''})의 목소리로 쓴다. 문체: ${editor.style_signature || ''}. ${editor.banned_expressions?.length ? '절대 쓰지 않는 표현: ' + editor.banned_expressions.join(', ') : ''}`
    : '중립적인 뉴스저울 기본 문체로 작성';

  // FAQ 앵글은 body(자연스러운 글)와 별도로 구조화된 qa 배열도 함께 받는다 — 검색엔진의
  // FAQPage 스키마에 그대로 쓸 수 있는 형태(질문 원문 그대로, 답은 2~4문장으로 자기완결적).
  // PM 지시(2026-07-22 "Schema.org 강화— FAQPage 가능한 경우 적용").
  const faqField = angleConfig.slug === 'faq'
    ? `,\n  "qa": [{"question": "실제 질문 문장", "answer": "그 질문만 봐도 이해되는 자기완결적 답변(2~4문장)"}] // 4~6개`
    : '';

  return `너는 뉴스저울의 에디토리얼 엔진이다. 아래 이슈에 대해 "${angleConfig.label}" 관점의 글을 작성해라.
${editorLine}

이슈: ${topic.name}
요약: ${topic.summary || ''}
이 글의 초점: ${angleConfig.focus}
분량: ${angleConfig.minLen}~${angleConfig.maxLen}자

참고 가능한 원문 출처: ${evidence.sources.map((s) => (s.outlet ? `[${s.outlet}] ${s.title}` : s.title)).join(' / ') || '(없음)'}

작성 규칙: 확인 안 된 사실을 단정하지 마라. 보도자료 요약체가 아니라 검색하는 사람이 바로 필요로 하는 실용적 정보로 써라.
행정·정책 정보라는 이유로 가치를 낮게 보지 마라 — 대상·조건·방법이 명확하면 그 자체가 핵심 가치다.

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "title": "이 글만의 제목(Topic 제목과 달라야 함, 예: '{Topic명} 신청방법 총정리')",
  "lead": "리드 문단(2~3문장)",
  "body": "본문(문단 사이 빈 줄로 구분)",
  "display_keywords": ["짧은 강조 키워드 2~4개"]${faqField}
}`;
}

async function claudeGenerate(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    // 2026-08-17(비용 분석): 이 함수는 3시간마다 Topic 15건 = 하루 120회로, 파이프라인에서
    // editorial-draft 다음으로 호출량이 많다. 그런데 2026-08-06 thinking 일괄 수정에서 빠져
    // adaptive thinking이 켜진 채였고, 4000토큰 예산 대부분을 사고과정이 쓰고 있었다.
    // 앵글별 확장 초안은 이미 gate/plan이 정한 틀 안에서 쓰는 구조화 생성이라 깊은 추론이
    // 필요 없다 — thinking은 유지하되 effort를 low로 낮춰 사고량만 줄인다.
    body: JSON.stringify({ model: 'claude-sonnet-5', output_config: { effort: 'low' }, max_tokens: 4000 /* 2026-08-06: sonnet-5 adaptive thinking이 max_tokens를 함께 소진한다 — 잘림 여유 확보 */, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패: ' + text.slice(0, 200));
  return JSON.parse(match[0]);
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

  try {
    const editorsPool = await supabaseGet('editors', '?active=eq.true&select=id,name,perspective_tag,specialty,domains,style_signature,banned_expressions,content_missions');

    // 대상 1: DEEP_DIVE 외 6종(분류만 되고 콘텐츠 없는 것) — gate_status가 해당 카테고리이고 아직 expansion_drafts 없는 것
    const categoryTargets = await supabaseGet(
      'topics',
      `?status=eq.active&gate_status=in.(SEARCH_GUIDE,PRODUCT_BRIEF,COMPARE,BACKGROUND,UPDATE,SHORT_BRIEF)&select=id,name,summary,category,gate_status,importance_score,ai_context&order=updated_at.desc&limit=${BATCH_SIZE}`
    );
    // 대상 2: DEEP_DIVE + published + 무게 있는 것 — 보너스 앵글 추가 대상
    const deepDiveTargets = await supabaseGet(
      'topics',
      `?status=eq.active&gate_status=eq.DEEP_DIVE&editorial_status=eq.published&select=id,name,summary,category,gate_status,importance_score,ai_context&order=importance_score.desc&limit=${BATCH_SIZE}`
    );

    let created = 0, failed = 0;
    const results = [];

    // 카테고리별 1건 생성(SEARCH_GUIDE 등 6종)
    for (const topic of categoryTargets) {
      const existing = topic.ai_context?.expansion_drafts || [];
      const angleConfig = ANGLE_CONFIG[topic.gate_status];
      if (!angleConfig || existing.some((d) => d.angle === angleConfig.slug)) continue; // 이미 생성됨
      try {
        const evidence = await gatherEvidence(topic.id);
        const editor = pickEditorForAngle(editorsPool, angleConfig, topic.category, new Set());
        const gen = await claudeGenerate(buildPrompt(topic, angleConfig, editor, evidence));
        const draft = {
          angle: angleConfig.slug, label: angleConfig.label, title: gen.title, lead: gen.lead, body: gen.body,
          display_keywords: gen.display_keywords || [], editor: editor ? { id: editor.id, name: editor.name, perspective: editor.perspective_tag } : null,
          generated_at: new Date().toISOString(),
        };
        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          ai_context: { ...(topic.ai_context || {}), expansion_drafts: [...existing, draft] },
        });
        created++;
        results.push({ topic_id: topic.id, name: topic.name, angle: angleConfig.slug });
      } catch (e) {
        failed++;
        console.error('expansion draft(카테고리) 실패:', topic.id, e.message);
      }
    }

    // DEEP_DIVE 보너스 앵글 생성(무게 기준 1~3개)
    for (const topic of deepDiveTargets) {
      const existing = topic.ai_context?.expansion_drafts || [];
      const existingAngles = existing.map((d) => d.angle);
      const bonusAngles = pickBonusAngles(topic.importance_score || 0, existingAngles);
      if (!bonusAngles.length) continue;
      const usedEditorIds = new Set((topic.ai_context?.plan?.editors_assigned || []).map((e) => e.id).filter(Boolean));
      let newDrafts = [];
      for (const angleKey of bonusAngles) {
        const angleConfig = BONUS_ANGLES[angleKey];
        try {
          const evidence = await gatherEvidence(topic.id);
          const editor = pickEditorForAngle(editorsPool, angleConfig, topic.category, usedEditorIds);
          if (editor) usedEditorIds.add(editor.id);
          const gen = await claudeGenerate(buildPrompt(topic, angleConfig, editor, evidence));
          newDrafts.push({
            angle: angleConfig.slug, label: angleConfig.label, title: gen.title, lead: gen.lead, body: gen.body,
            display_keywords: gen.display_keywords || [], editor: editor ? { id: editor.id, name: editor.name, perspective: editor.perspective_tag } : null,
            generated_at: new Date().toISOString(),
            qa: angleConfig.slug === 'faq' && Array.isArray(gen.qa) ? gen.qa : undefined,
          });
          created++;
          results.push({ topic_id: topic.id, name: topic.name, angle: angleConfig.slug });
        } catch (e) {
          failed++;
          console.error('expansion draft(보너스) 실패:', topic.id, angleKey, e.message);
        }
      }
      if (newDrafts.length) {
        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          ai_context: { ...(topic.ai_context || {}), expansion_drafts: [...existing, ...newDrafts] },
        }).catch((e) => console.error('expansion draft 저장 실패:', topic.id, e.message));
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, categoryTargets: categoryTargets.length, deepDiveTargets: deepDiveTargets.length, created, failed, results }),
    };
  } catch (e) {
    console.error('generate-expansion-drafts 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
