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
// 2026-07-12: 출처에 언론사명을 포함(인용 신뢰도용), 이미지는 1개가 아니라 최대 3개까지 후보로
// 남겨 블록에 결정론적으로 분배할 수 있게 한다(attachImages 참고).
async function gatherEvidence(topicId) {
  const [storyLinks, timeline] = await Promise.all([
    supabaseGet('topic_stories', `?topic_id=eq.${topicId}&select=story_id&order=relevance_score.desc&limit=8`),
    supabaseGet('topic_timeline_events', `?topic_id=eq.${topicId}&select=title,event_date&order=event_date.asc&limit=10`),
  ]);
  const storyIds = storyLinks.map((l) => l.story_id);
  let sources = [];
  let images = [];
  if (storyIds.length) {
    const articleLinks = await supabaseGet(
      'story_articles',
      `?story_id=in.(${storyIds.join(',')})&select=articles(title,url,og_image_url,published_at,outlets(name))`
    );
    const articles = articleLinks.map((r) => r.articles).filter(Boolean);
    sources = articles.slice(0, 6).map((a) => ({ title: a.title, url: a.url, outlet: a.outlets?.name || null }));
    images = articles.filter((a) => a.og_image_url)
      .sort((a, b) => new Date(b.published_at || 0) - new Date(a.published_at || 0))
      .slice(0, 3)
      .map((a) => ({ url: a.og_image_url, caption: a.title }));
  }
  return { sources, timeline, images };
}

// Persona 스니펫(§7) — Editorial Plan의 editors_assigned를 실제 문체 지시문으로 변환.
// §6의 "사건유형 클램프": 대립관점이 항상 고정인 유형(9·10)은 Persona 개성보다 구조 규칙이 우선이므로
// 페르소나 문체는 유지하되 "안전 규칙을 절대 어기지 말라"는 문구를 덧붙인다.
function buildPersonaSnippet(editorsDetail, requiresDual, isSafetyLocked) {
  if (!editorsDetail.length) return '(배정된 에디터 없음 — 중립적인 뉴스저울 기본 문체로 작성)';
  const lines = editorsDetail.map((e) => {
    const specialty = e.specialty ? ` / 전문분야: ${e.specialty}` : '';
    const banned = (e.banned_expressions || []).length ? ` / 절대 쓰지 않는 표현: ${e.banned_expressions.join(', ')}` : '';
    return `- ${e.name}(${e.perspective_tag}): ${e.style_signature || ''} / 리듬: ${e.rhythm_profile || ''} / 강조: ${e.emphasis_pattern || ''}${specialty}${banned}`;
  }).join('\n');
  const clamp = isSafetyLocked
    ? '\n(주의: 이 사건 유형은 구조 규칙이 우선이다 — 에디터 개성보다 대립관점 병치·톤 절제가 항상 우선한다.)'
    : '';
  return `이 글은 아래 에디터(들)의 목소리로 쓴다. 나열된 문체·리듬·강조점·금지 표현을 실제로 반영해 에디터마다 결과물이 확연히 달라지게 써라:\n${lines}${clamp}`;
}

function buildPrompt(topic, plan, evidence, personaSnippet) {
  const [minLen, maxLen] = plan.target_length_range;
  const axisList = Object.entries(plan.axis_weights)
    .filter(([, w]) => w > 0)
    .map(([axis, w]) => `${axis}(약 ${Math.round(w * (minLen + maxLen) / 2)}자)`).join(', ');

  return `너는 뉴스저울의 에디토리얼 엔진이다. 아래 이슈에 대해 장문 에디토리얼을 작성해라.
독자가 "이 사이트는 뉴스를 나열하지 않고 세상을 이해시켜준다"고 느끼게 쓰는 게 목표다.
보도자료 요약체나 사실 나열이 아니라, 관점이 있는 해설체로 써라. 확인 안 된 사실을 단정하지 마라.

${personaSnippet}

이슈: ${topic.name}
요약: ${topic.summary || ''}
사건 유형: ${plan.event_type}
축별 분량 배분(꼭 이 축들을 각각 다뤄라): ${axisList}
관점: ${plan.perspectives.join(', ')}
대립 관점 병치 필요: ${plan.requires_dual_perspective ? '예 — 반드시 찬성/신중(또는 양측) 시각을 각각 명시적으로 병치해라' : '아니오 — 단일 관점으로 일관되게'}
오늘의 화두 반영 사유: ${plan.axis_overrides_reason || '(해당 없음)'}
전체 분량: ${minLen}~${maxLen}자

참고 가능한 원문 출처(${evidence.sources.length}건, [언론사] 제목): ${evidence.sources.map((s) => (s.outlet ? `[${s.outlet}] ${s.title}` : s.title)).join(' / ') || '(없음)'}
타임라인(${evidence.timeline.length}건): ${evidence.timeline.map((t) => t.title).join(' / ') || '(없음)'}

리드 문단 작성 규칙(읽는 재미): "최근", "요즘", "논란이 되고 있다", "화제를 모으고 있다" 같은 상투적 도입구로 시작하지
마라. 구체적 장면·수치·긴장 관계 중 하나로 바로 들어가라 — 독자가 첫 문장에서 멈춰서 읽게 만드는 게 목표다.

대립 관점 작성 규칙(관점의 설득력): perspective_markers의 각 항목은 claim(주장)뿐 아니라 basis(그 관점이 왜
그렇게 주장하는지 근거나 이유 1문장)를 반드시 함께 써라 — 근거 없이 주장만 나열하지 마라.

문단 길이 규칙(가독성, Editorial OS 문체 철학은 유지하되 편집 규칙만 추가): 한 문단은 2~4문장으로 써라.
블록 하나의 분량이 길어 5문장 넘게 이어지면 하나의 통 문단으로 몰아쓰지 말고 문단을 나눠라 — 문단과 문단
사이는 빈 줄로 구분해라(JSON 문자열 안에서 줄바꿈 두 번으로 표현). 의미 없이 짧은 단문을 남발하지 말고,
각 문단이 하나의 완결된 생각 단위가 되게 해라.

핵심 키워드 작성 규칙(PM 지시 2026-07-17): display_keywords는 독자가 제목을 다 읽기 전에 "무슨 내용인지,
왜 볼 만한지"를 3초 안에 파악하게 하는 2~4개의 짧은 구(句)다. 우선순위 — (1)핵심 인물·기업·제품·정책명,
(2)금액·기한·출시일·대상 같은 구체 정보, (3)갈등·변화·결과를 나타내는 표현, (4)관련 Topic/Entity 이름.
"정치", "사회", "논란", "관심" 같은 추상어는 절대 쓰지 마라. 각 항목은 5~14자 내외의 짧은 구로 써라.
예: "소상공인 지원금" / "최대 300만원" / "7월 31일 마감" (o) — "정치 논란" / "화제의 이슈" (x, 추상어라 금지).

작성 전에 스스로 점검해라(Self-Review): 위에 나열된 축을 전부 다뤘는가? 대립 관점이 필요한데 빠뜨리지 않았는가?
분량 범위를 지켰는가? 확인이 안 된 내용을 단정적으로 쓰지 않았는가? 배정된 에디터의 문체·리듬·강조 방식이 실제로 드러나는가?
리드가 상투적 도입구로 시작하지 않는가? 대립 관점 각각에 basis가 있는가? 긴 문단을 2~4문장 단위로 나눴는가?
display_keywords에 추상어가 섞여있지 않은가? 문제가 있으면 출력하기 전에 스스로 고쳐라.

설명 없이 아래 JSON 형식만 반환해라(코드블록 없이):
{
  "lead": "콜드오픈/리드 문단(2~3문장)",
  "blocks": [{"axis": "축 이름", "content": "본문(문단이 여러 개면 빈 줄로 구분, 각 문단 2~4문장)"}],
  "perspective_markers": [{"perspective": "관점 이름", "claim": "그 관점의 핵심 주장 1~2문장", "basis": "그렇게 주장하는 근거나 이유 1문장"}],
  "closing_door": {"wider": "더 넓게 갈 다음 질문 1문장", "deeper": "더 깊게 갈 다음 질문 1문장"},
  "display_keywords": ["짧은 구 2~4개"]
}`;
}

// 반환값: { draft, diagnostic } — 실패해도 원인을 즉시 알 수 있도록 진단 정보를 항상 함께 준다
// (2026-07-11: Background Function은 응답 본문을 아무도 못 보므로, 실패 원인을 topics.ai_context에
// 바로 남기지 않으면 "출력 파싱 실패"라는 말만 남고 진짜 이유를 알 방법이 없었다).
async function claudeGenerate(prompt) {
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 8000, // 2026-07-11: 3000으로는 1400~2300자 구조화 출력이 잘려서(stop_reason=max_tokens)
                           // 매번 파싱 실패하던 것으로 확인 — 여유있게 상향
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });
  } catch (e) {
    return { draft: null, diagnostic: { stage: 'fetch', detail: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'timeout' : e.message } };
  }

  if (!res.ok) {
    const body = await res.text();
    return { draft: null, diagnostic: { stage: 'http_error', status: res.status, detail: body.slice(0, 300) } };
  }

  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const diagnosticBase = { stopReason: data.stop_reason, textLength: text.length, usage: data.usage };

  if (data.stop_reason === 'max_tokens') {
    return { draft: null, diagnostic: { stage: 'truncated', ...diagnosticBase, tail: text.slice(-200) } };
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { draft: null, diagnostic: { stage: 'no_json_found', ...diagnosticBase, tail: text.slice(-200) } };
  }
  try {
    return { draft: JSON.parse(match[0]), diagnostic: { stage: 'ok', ...diagnosticBase } };
  } catch (e) {
    return { draft: null, diagnostic: { stage: 'json_parse_error', ...diagnosticBase, parseError: e.message, tail: text.slice(-200) } };
  }
}

// 이미지 부착(2026-07-12) — 모델에게 이미지를 고르게 하지 않고 코드가 결정론적으로 붙인다
// (할루시네이션 리스크 없음). evidence.images는 이미 enrich-article-images.js가 채워둔 실사
// 이미지만 후보로 들어온다(최대 3개). 블록 순서대로 인덱스 매칭 1:1로만 붙여 같은 이미지가
// 여러 블록에 중복되지 않게 하고, 이미지가 블록 수보다 적으면 남는 블록은 이미지 없이 둔다.
function attachImages(draft, images) {
  if (!draft || !Array.isArray(draft.blocks) || !Array.isArray(images) || !images.length) return draft;
  draft.blocks = draft.blocks.map((b, i) => (images[i] ? { ...b, image: images[i].url, imageCaption: images[i].caption } : b));
  return draft;
}

// 3a — 결정론적 QA(코드, 무료, §10)
function deterministicQA(draft, plan, diagnostic) {
  const reasons = [];
  if (!draft || !draft.lead || !Array.isArray(draft.blocks)) {
    const stageLabel = {
      fetch: 'LLM 호출 실패(네트워크/타임아웃)',
      http_error: `LLM API 오류(HTTP ${diagnostic?.status})`,
      truncated: `응답 잘림(max_tokens 도달, ${diagnostic?.textLength}자)`,
      no_json_found: 'JSON 형식을 찾을 수 없음',
      json_parse_error: `JSON 파싱 오류: ${diagnostic?.parseError}`,
    }[diagnostic?.stage] || '출력 파싱 실패 또는 필수 필드 누락';
    return { pass: false, reasons: [stageLabel], diagnostic };
  }

  const requiredAxes = Object.entries(plan.axis_weights).filter(([, w]) => w > 0).map(([a]) => a);
  const coveredAxes = new Set(draft.blocks.map((b) => b.axis));
  const missingAxes = requiredAxes.filter((a) => !coveredAxes.has(a));
  if (missingAxes.length) reasons.push(`축 커버리지 부족: ${missingAxes.join(',')}`);

  const totalLength = (draft.lead || '').length + draft.blocks.reduce((s, b) => s + (b.content || '').length, 0);
  const [minLen, maxLen] = plan.target_length_range;
  if (totalLength < minLen * 0.7) reasons.push(`분량 부족: ${totalLength}자 (목표 ${minLen}~${maxLen}자)`);
  if (totalLength > maxLen * 1.5) reasons.push(`분량 초과: ${totalLength}자 (목표 ${minLen}~${maxLen}자)`);

  const bannedLeadOpeners = ['최근', '요즘', '한편', '화제를 모으고 있다', '논란이 되고 있다', '이슈가 되고 있다'];
  if (bannedLeadOpeners.some((w) => (draft.lead || '').trimStart().startsWith(w))) {
    reasons.push('리드 문단이 상투적 도입구로 시작함');
  }

  if (plan.requires_dual_perspective) {
    const markers = Array.isArray(draft.perspective_markers) ? draft.perspective_markers : [];
    if (markers.length < 2) reasons.push(`대립 관점 필요한데 perspective_markers ${markers.length}개뿐`);
    else if (markers.some((m) => !m.basis || !String(m.basis).trim())) reasons.push('대립 관점 중 근거(basis)가 빠진 항목이 있음');
  }

  return { pass: reasons.length === 0, reasons, totalLength };
}

// 3b — LLM 정성 QA(§10, Phase 4). 3a 통과분만 실행(비용 절감). Editorial OS의 유형별
// "흔한 저품질 패턴"(common_pitfalls)을 체크리스트로 그대로 이식해 pass/fail+사유+신뢰도를 받는다.
async function claudeQualitativeQA(draft, commonPitfalls) {
  const bodyText = [draft.lead, ...draft.blocks.map((b) => b.content)].join('\n');
  const pitfallList = (commonPitfalls || []).map((p) => `- ${p}`).join('\n') || '(체크리스트 없음)';

  const prompt = `아래 장문 에디토리얼이 이 사건 유형의 "흔한 저품질 패턴"에 해당하는지 점검해라.
설명 없이 JSON만 반환해라.

저품질 패턴 체크리스트:
${pitfallList}

본문:
${bodyText}

반환 형식:
{"pass": true 또는 false, "reason": "해당하면 어떤 패턴인지, 통과면 빈 문자열", "qa_confidence": 0.0~1.0}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { pass: true, reason: '3b 호출 실패 — 3a만으로 통과 처리', qa_confidence: 0 }; // 3b 자체 장애로 발행이 막히지 않게
    const data = await res.json();
    const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { pass: true, reason: '3b 파싱 실패 — 3a만으로 통과 처리', qa_confidence: 0 };
    const parsed = JSON.parse(match[0]);
    return { pass: !!parsed.pass, reason: parsed.reason || '', qa_confidence: typeof parsed.qa_confidence === 'number' ? parsed.qa_confidence : 0.5 };
  } catch {
    return { pass: true, reason: '3b 예외 — 3a만으로 통과 처리', qa_confidence: 0 };
  }
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const pending = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.planned&gate_status=eq.DEEP_DIVE&select=id,name,summary,ai_context,editorial_retry_count&order=updated_at.desc&limit=${BATCH_SIZE}`
    );
    if (!pending.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, targetedThisRun: 0 }) };
    }

    const eventTypeRules = await supabaseGet('event_type_rules', '?select=event_type,common_pitfalls');

    const stats = { published: 0, retried: 0, degraded: 0, failed: 0, qualitativeRejected: 0 };

    for (const topic of pending) {
      const plan = topic.ai_context?.plan;
      if (!plan) { stats.failed++; continue; }

      try {
        // Persona Registry(§7) — 배정된 에디터 상세를 가져와 문체 스니펫으로 조립
        const editorIds = (plan.editors_assigned || []).map((e) => e.id).filter(Boolean);
        const editorsDetail = editorIds.length
          ? await supabaseGet('editors', `?id=in.(${editorIds.join(',')})&select=name,perspective_tag,style_signature,rhythm_profile,emphasis_pattern,specialty,banned_expressions`)
          : [];
        const isSafetyLocked = plan.event_type === '분쟁·외교·전쟁' || plan.event_type === '재난·긴급상황';
        const personaSnippet = buildPersonaSnippet(editorsDetail, plan.requires_dual_perspective, isSafetyLocked);

        const evidence = await gatherEvidence(topic.id);
        let { draft, diagnostic } = await claudeGenerate(buildPrompt(topic, plan, evidence, personaSnippet));
        draft = attachImages(draft, evidence.images);
        const qa = deterministicQA(draft, plan, diagnostic);

        // 3b — 3a 통과분만 실행(비용 절감, §10)
        let qualitative = null;
        if (qa.pass) {
          const pitfalls = eventTypeRules.find((r) => r.event_type === plan.event_type)?.common_pitfalls;
          qualitative = await claudeQualitativeQA(draft, pitfalls);
        }

        if (qa.pass && qualitative.pass) {
          const counterMarker = (draft.perspective_markers || []).find((m, i) => i > 0);
          const { lastQaFail, ...cleanContext } = topic.ai_context || {}; // 이전 실패기록은 성공 시 정리
          await supabasePatch('topics', `?id=eq.${topic.id}`, {
            ai_context: { ...cleanContext, draft, evidence, qa, qualitative },
            ai_outlook: draft.lead,
            ai_counter_view: counterMarker ? counterMarker.claim : null,
            editorial_status: 'published',
            editorial_retry_count: 0,
            updated_at: new Date().toISOString(),
          });
          stats.published++;
        } else {
          if (qa.pass && !qualitative.pass) {
            stats.qualitativeRejected++;
            qa.reasons = [`[3b 정성QA] ${qualitative.reason}`];
          }
          const retryCount = (topic.editorial_retry_count || 0) + 1;
          if (retryCount > MAX_RETRY) {
            // §10 자동 강등 — 사람 검토 큐 없음(DEC-005). 짧은 기존 형식(summary)만으로 계속 서빙,
            // Hook으로만 조회 가능하게 상태만 남긴다.
            await supabasePatch('topics', `?id=eq.${topic.id}`, {
              editorial_status: 'degraded',
              editorial_retry_count: retryCount,
              ai_context: { ...topic.ai_context, lastQaFail: qa.reasons, lastDiagnostic: diagnostic },
            });
            stats.degraded++;
          } else {
            await supabasePatch('topics', `?id=eq.${topic.id}`, {
              editorial_retry_count: retryCount,
              ai_context: { ...topic.ai_context, lastQaFail: qa.reasons, lastDiagnostic: diagnostic },
            });
            stats.retried++;
          }
        }
      } catch (e) {
        stats.failed++;
        console.error('generate-editorial-draft topic 처리 오류:', topic.id, e.message);
        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          ai_context: { ...topic.ai_context, lastQaFail: [`예외 발생: ${e.message}`] },
        }).catch(() => {});
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
