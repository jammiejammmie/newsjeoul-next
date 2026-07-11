// generate-editorial-draft-background.js — Editorial Engine Layer 2a(생성+Self-Review) + Layer 2b(근거 수집) + 3a(결정론적 QA)
// 근거: docs/newsjeoul-editorial-engine-architecture.md §2, §8, §9, §10, DEC-005
//
// editorial_status='planned'(Editorial Plan이 있는) 토픽을 대상으로 장문 Editorial Draft를 생성한다.
// 근거(이미지/타임라인/출처)는 전부 기존에 이미 채워진 데이터를 조회만 한다 — 새 조달 로직 없음
// (이미지: enrich-article-images.js, 타임라인: topic_timeline_events, 출처: story_articles).
// 사람 검토 큐 없음(DEC-005) — 3a 통과 실패가 재시도 상한에 도달하면 자동 강등(draft 없이 종료,
// 화면은 기존 summary만으로 폴백 — Topic 화면이 draft 유무를 분기해서 처리).
//
// Background Function(2026-07-11 전환): 동기 함수는 Netlify 플랫폼상 26초 하드캡이 있어(netlify.toml의
// timeout 설정은 스케줄/백그라운드에만 적용됨) 장문 생성(실측 1건 약 40초) 자체가 구조적으로 불가능했다.
// -background 접미사로 최대 15분까지 실행 가능해져 배치 크기를 다시 늘렸다. 호출자는 202를 즉시 받고
// 결과를 못 받으므로(운영은 Cron 자동 호출, 관리자 화면은 상태만 별도 조회) 반환값은 로그 확인용일 뿐이다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 5; // Background라 15분 예산 안에서 여유있게 — 1건당 근거수집+생성+QA 약 40~60초
const MAX_RETRY = 2;

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

// Layer 2b — 이미 존재하는 데이터만 조회(신규 조달 없음, §9)
async function gatherEvidence(topicId) {
  const [storyLinks, timeline] = await Promise.all([
    supabaseGet('topic_stories', `?topic_id=eq.${topicId}&select=story_id&order=relevance_score.desc&limit=8`),
    supabaseGet('topic_timeline_events', `?topic_id=eq.${topicId}&select=title,event_date&order=event_date.asc&limit=10`),
  ]);
  const storyIds = storyLinks.map((l) => l.story_id);
  let sources = [];
  let imageUrl = null;
  if (storyIds.length) {
    const articleLinks = await supabaseGet(
      'story_articles',
      `?story_id=in.(${storyIds.join(',')})&select=articles(title,url,og_image_url,published_at)`
    );
    const articles = articleLinks.map((r) => r.articles).filter(Boolean);
    sources = articles.slice(0, 5).map((a) => ({ title: a.title, url: a.url }));
    const withImage = articles.filter((a) => a.og_image_url)
      .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0));
    imageUrl = withImage[0]?.og_image_url || null;
  }
  return { sources, timeline, imageUrl };
}

function buildPrompt(topic, plan, evidence) {
  const [minLen, maxLen] = plan.target_length_range;
  const axisList = Object.entries(plan.axis_weights)
    .filter(([, w]) => w > 0)
    .map(([axis, w]) => `${axis}(약 ${Math.round(w * (minLen + maxLen) / 2)}자)`).join(', ');

  return `너는 뉴스저울의 에디토리얼 엔진이다. 아래 이슈에 대해 장문 에디토리얼을 작성해라.
독자가 "이 사이트는 뉴스를 나열하지 않고 세상을 이해시켜준다"고 느끼게 쓰는 게 목표다.
보도자료 요약체나 사실 나열이 아니라, 관점이 있는 해설체로 써라. 확인 안 된 사실을 단정하지 마라.

이슈: ${topic.name}
요약: ${topic.summary || ''}
사건 유형: ${plan.event_type}
축별 분량 배분(꼭 이 축들을 각각 다뤄라): ${axisList}
관점: ${plan.perspectives.join(', ')}
대립 관점 병치 필요: ${plan.requires_dual_perspective ? '예 — 반드시 찬성/신중(또는 양측) 시각을 각각 명시적으로 병치해라' : '아니오 — 단일 관점으로 일관되게'}
오늘의 화두 반영 사유: ${plan.axis_overrides_reason || '(해당 없음)'}
전체 분량: ${minLen}~${maxLen}자

참고 가능한 원문 출처(${evidence.sources.length}건): ${evidence.sources.map((s) => s.title).join(' / ') || '(없음)'}
타임라인(${evidence.timeline.length}건): ${evidence.timeline.map((t) => t.title).join(' / ') || '(없음)'}

작성 전에 스스로 점검해라(Self-Review): 위에 나열된 축을 전부 다뤘는가? 대립 관점이 필요한데 빠뜨리지 않았는가?
분량 범위를 지켰는가? 확인이 안 된 내용을 단정적으로 쓰지 않았는가? 문제가 있으면 출력하기 전에 스스로 고쳐라.

설명 없이 아래 JSON 형식만 반환해라(코드블록 없이):
{
  "lead": "콜드오픈/리드 문단(2~3문장)",
  "blocks": [{"axis": "축 이름", "content": "본문 문단"}],
  "perspective_markers": [{"perspective": "관점 이름", "claim": "그 관점의 핵심 주장 1~2문장"}],
  "closing_door": {"wider": "더 넓게 갈 다음 질문 1문장", "deeper": "더 깊게 갈 다음 질문 1문장"}
}`;
}

async function claudeGenerate(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120000), // Background라 여유 있음 — 진짜 행(hang)만 끊어서 명확한 에러를 남긴다
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// 3a — 결정론적 QA(코드, 무료, §10)
function deterministicQA(draft, plan) {
  const reasons = [];
  if (!draft || !draft.lead || !Array.isArray(draft.blocks)) {
    return { pass: false, reasons: ['출력 파싱 실패 또는 필수 필드 누락'] };
  }

  const requiredAxes = Object.entries(plan.axis_weights).filter(([, w]) => w > 0).map(([a]) => a);
  const coveredAxes = new Set(draft.blocks.map((b) => b.axis));
  const missingAxes = requiredAxes.filter((a) => !coveredAxes.has(a));
  if (missingAxes.length) reasons.push(`축 커버리지 부족: ${missingAxes.join(',')}`);

  const totalLength = (draft.lead || '').length + draft.blocks.reduce((s, b) => s + (b.content || '').length, 0);
  const [minLen, maxLen] = plan.target_length_range;
  if (totalLength < minLen * 0.7) reasons.push(`분량 부족: ${totalLength}자 (목표 ${minLen}~${maxLen}자)`);
  if (totalLength > maxLen * 1.5) reasons.push(`분량 초과: ${totalLength}자 (목표 ${minLen}~${maxLen}자)`);

  if (plan.requires_dual_perspective) {
    const markerCount = Array.isArray(draft.perspective_markers) ? draft.perspective_markers.length : 0;
    if (markerCount < 2) reasons.push(`대립 관점 필요한데 perspective_markers ${markerCount}개뿐`);
  }

  return { pass: reasons.length === 0, reasons, totalLength };
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod) {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const pending = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.planned&select=id,name,summary,ai_context,editorial_retry_count&order=updated_at.desc&limit=${BATCH_SIZE}`
    );
    if (!pending.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, targetedThisRun: 0 }) };
    }

    const stats = { published: 0, retried: 0, degraded: 0, failed: 0 };

    for (const topic of pending) {
      const plan = topic.ai_context?.plan;
      if (!plan) { stats.failed++; continue; }

      try {
        const evidence = await gatherEvidence(topic.id);
        const draft = await claudeGenerate(buildPrompt(topic, plan, evidence));
        const qa = deterministicQA(draft, plan);

        if (qa.pass) {
          const counterMarker = (draft.perspective_markers || []).find((m, i) => i > 0);
          const { lastQaFail, ...cleanContext } = topic.ai_context || {}; // 이전 실패기록은 성공 시 정리
          await supabasePatch('topics', `?id=eq.${topic.id}`, {
            ai_context: { ...cleanContext, draft, evidence, qa },
            ai_outlook: draft.lead,
            ai_counter_view: counterMarker ? counterMarker.claim : null,
            editorial_status: 'published',
            editorial_retry_count: 0,
            updated_at: new Date().toISOString(),
          });
          stats.published++;
        } else {
          const retryCount = (topic.editorial_retry_count || 0) + 1;
          if (retryCount > MAX_RETRY) {
            // §10 자동 강등 — 사람 검토 큐 없음(DEC-005). 짧은 기존 형식(summary)만으로 계속 서빙,
            // Hook으로만 조회 가능하게 상태만 남긴다.
            await supabasePatch('topics', `?id=eq.${topic.id}`, {
              editorial_status: 'degraded',
              editorial_retry_count: retryCount,
              ai_context: { ...topic.ai_context, lastQaFail: qa.reasons },
            });
            stats.degraded++;
          } else {
            await supabasePatch('topics', `?id=eq.${topic.id}`, {
              editorial_retry_count: retryCount,
              ai_context: { ...topic.ai_context, lastQaFail: qa.reasons },
            });
            stats.retried++;
          }
        }
      } catch (e) {
        stats.failed++;
        console.error('generate-editorial-draft topic 처리 오류:', topic.id, e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, targetedThisRun: pending.length, ...stats }),
    };
  } catch (e) {
    console.error('generate-editorial-draft 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
