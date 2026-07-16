// generate-publish-gate-background.js — Publish Gate
// 근거: docs/newsjeoul-publish-gate-design.md (전체), DEC-006
//
// editorial_status='planned'이면서 gate_status='pending_gate'인 Topic을 대상으로,
// "장문 생성까지 갈 가치가 있는가"를 판단한다. 결과는 4가지: publish_long(장문 진행) /
// publish_short(요약형 폴백으로 종결, draft 생성 스킵) / hold(판단 애매, 대기) /
// reject(뉴스저울답지 않음, draft 영구 스킵).
//
// 2단계 판단(설계서 §2):
//  1) Rule 예비필터(무료, 결정론적) — 명백한 행정 공지 패턴이면 LLM 호출 없이 즉시 reject
//  2) LLM 정성 판단(1회 호출) — 8개 기준 + CTR 4문항을 구조화 출력으로 받고,
//     코드가 최종 상태를 결정론적으로 매핑한다(LLM의 자체 추천 라벨은 참고만, 최종 결정 아님).
//
// Background Function(15분 예산) — Editorial Engine 다른 함수들과 동일 패턴.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 10;

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

// Rule 예비필터(설계서 §2-1) — Content Bible §1/CTR 바이블 §5의 "절대 제외" 예시를
// 코드 패턴으로 이식. 확실한 것만 잡고 애매하면 LLM 단계로 넘긴다.
const REJECT_PATTERNS = [
  { label: '지자체 행정 공지 패턴', re: /(\S+(시|군|구))\s*[,·]?\s*(청)?\s*(공식)?\s*(개통|개최|시행|공고|모집|접수|안내)/ },
  { label: '보도자료성 표현', re: /보도자료/ },
  { label: '단순 지원사업 개시 공지', re: /(지원(금|사업)?)\s*(을|를)?\s*(최대|최소)?\s*[0-9]*\s*(만원|원)?\s*(지원|지급)(하기로|하기로 했다|한다|키로)/ },
];

function ruleReject(name, summary) {
  const text = `${name} ${summary || ''}`;
  for (const p of REJECT_PATTERNS) {
    if (p.re.test(text)) return p.label;
  }
  return null;
}

function buildPrompt(topic, plan) {
  return `너는 뉴스저울의 Publish Gate 심사관이다. 아래 이슈가 "장문 에디토리얼로 발행할 가치가 있는가"를
판단해라. 뉴스저울은 단순 공지/행정 뉴스가 아니라 "사람들이 궁금해하고, 다른 사건·인물로 계속 탐험하고
싶어지는" 콘텐츠를 지향한다.

이슈 이름: ${topic.name}
요약: ${topic.summary || '(요약 없음)'}
카테고리: ${topic.category || '(미분류)'}
사건 유형: ${plan?.event_type || '(미분류)'}

아래 8개 기준과 CTR 4문항에 각각 답해라. 설명 없이 JSON만 반환해라(코드블록 없이).

8개 기준:
1. exploration: 이 Topic에서 다른 인물/기관/사건으로 이어질 실마리가 있는가(true/false) + reason
2. connection_potential: 기존에 존재할 법한 다른 Topic과 연결될 개연성이 있는가(true/false) + reason
3. is_announcement: 단순 발표/공지로 끝나고 후속 전개 여지가 없는가(true/false)
4. is_local_admin: 특정 지자체 행정 사무에 국한되는가(true/false)
5. why_curiosity: 독자가 배경/이유를 궁금해할 만한 사건인가(true/false) + reason
6. social_impact: 특정 소수를 넘어 더 넓은 사회적 영향이 있는가(0=없음, 1=일부, 2=넓음)
7. time_sensitivity: "breaking"(속보성) 또는 "evergreen"(며칠 늦어도 무방) 중 하나
8. background_depth_needed: 장문으로 풀어야 할 만큼 맥락이 복잡한가(0=아니오, 1=다소, 2=매우)

CTR 4문항(각 true/false, CTR 바이블 §1 그대로):
- q1_would_i_click: 내가 이걸 클릭할까?
- q2_family_curious: 가족이나 친구가 궁금해할까?
- q3_threads_stop: Threads에서 멈춰서 읽을까?
- q4_youtube_thumbnail: 유튜브 썸네일이었다면 눌렀을까?

반환 형식:
{
  "exploration": {"value": true, "reason": "..."},
  "connection_potential": {"value": true, "reason": "..."},
  "is_announcement": true,
  "is_local_admin": true,
  "why_curiosity": {"value": true, "reason": "..."},
  "social_impact": 0,
  "time_sensitivity": "evergreen",
  "background_depth_needed": 0,
  "ctr": {"q1_would_i_click": false, "q2_family_curious": false, "q3_threads_stop": false, "q4_youtube_thumbnail": false},
  "recommendation": "REJECT"
}`;
}

async function claudeJudge(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error('LLM API 오류: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 형식을 찾을 수 없음: ' + text.slice(-200));
  return JSON.parse(match[0]);
}

// 결정론적 매핑(설계서 §2-2) — LLM의 recommendation은 참고만, 최종 상태는 코드가 결정한다.
function decideGateStatus(judged) {
  const ctr = judged.ctr || {};
  const ctrPassCount = ['q1_would_i_click', 'q2_family_curious', 'q3_threads_stop', 'q4_youtube_thumbnail']
    .filter((k) => ctr[k] === true).length;

  const exploration = !!(judged.exploration && judged.exploration.value);
  const connectionPotential = !!(judged.connection_potential && judged.connection_potential.value);
  const isAnnouncement = !!judged.is_announcement;
  const isLocalAdmin = !!judged.is_local_admin;
  const backgroundDepth = typeof judged.background_depth_needed === 'number' ? judged.background_depth_needed : 0;

  const reasons = [];
  let status;

  if ((isAnnouncement || isLocalAdmin) && ctrPassCount <= 1) {
    status = 'reject';
    if (isAnnouncement) reasons.push('공지성');
    if (isLocalAdmin) reasons.push('지역 행정성');
    reasons.push('CTR 4문항 통과 ' + ctrPassCount + '개뿐');
  } else if (ctrPassCount >= 3 && (exploration || connectionPotential) && backgroundDepth >= 1) {
    status = 'publish_long';
    reasons.push('CTR 4문항 통과 ' + ctrPassCount + '개');
    if (exploration) reasons.push('탐험성 있음');
    if (connectionPotential) reasons.push('다른 Topic 연결 가능성 있음');
  } else if (ctrPassCount >= 2) {
    status = 'publish_short';
    reasons.push('CTR 4문항 통과 ' + ctrPassCount + '개(장문 요건 미충족)');
    if (!exploration && !connectionPotential) reasons.push('탐험성/연결 가능성 부족');
    if (backgroundDepth < 1) reasons.push('배경설명 필요도 낮음');
  } else {
    status = 'hold';
    reasons.push('판단 애매(CTR 통과 ' + ctrPassCount + '개, 탐험성/연결가능성/배경설명 조합이 경계선)');
  }

  return { status, reasons, ctrPassCount };
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
    const topics = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.planned&gate_status=eq.pending_gate&select=id,name,summary,category,ai_context&order=updated_at.desc&limit=${BATCH_SIZE}`
    );

    const stats = { targeted: topics.length, publish_long: 0, publish_short: 0, hold: 0, reject: 0, ruleRejected: 0, failed: 0 };

    for (const topic of topics) {
      try {
        const ruleLabel = ruleReject(topic.name, topic.summary);
        let gateResult;

        if (ruleLabel) {
          gateResult = {
            status: 'reject',
            score: null,
            reasons: [ruleLabel],
            rule_matched: ruleLabel,
            evaluated_at: new Date().toISOString(),
            overridden_by: null,
            overridden_at: null,
          };
          stats.ruleRejected++;
        } else {
          const plan = topic.ai_context && topic.ai_context.plan;
          const judged = await claudeJudge(buildPrompt(topic, plan));
          const { status, reasons, ctrPassCount } = decideGateStatus(judged);
          gateResult = {
            status,
            score: { ...judged, ctr_test_pass_count: ctrPassCount },
            reasons,
            rule_matched: null,
            evaluated_at: new Date().toISOString(),
            overridden_by: null,
            overridden_at: null,
          };
        }

        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          gate_status: gateResult.status,
          ai_context: { ...(topic.ai_context || {}), gate: gateResult },
        });

        stats[gateResult.status] = (stats[gateResult.status] || 0) + 1;
      } catch (e) {
        stats.failed++;
        console.error('generate-publish-gate topic 처리 오류:', topic.id, e.message);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ...stats }) };
  } catch (e) {
    console.error('generate-publish-gate 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
