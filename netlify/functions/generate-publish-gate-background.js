// generate-publish-gate-background.js — Content Routing Gate
// 근거: PM 지시(2026-07-17, "Publish Gate → Content Routing Gate 방향 전환"), DEC-006의 확장
//
// 방향 전환: 저가치 Topic을 "걸러내는" 게이트가 아니라, 모든 수집 정보를 8가지 콘텐츠 유형 중
// 하나로 "분류·배분"하는 라우터다. REJECT는 광고/완전중복/의미없는 홍보성 문구로만 한정하고,
// 행정·정책 정보라는 이유만으로는 절대 REJECT하지 않는다(코드 레벨에서 강제).
//
// 8가지 결과: DEEP_DIVE(장문, 기존 Editorial Draft 파이프라인行) / SEARCH_GUIDE(신청조건·방법·
// 서류·기간 등 검색형 가이드) / PRODUCT_BRIEF(가격·사양·출시일·경쟁제품·구매대상) / COMPARE(비교) /
// BACKGROUND(역사·배경) / UPDATE(기존 Topic 갱신) / SHORT_BRIEF(장문 가치는 낮으나 검색·기록가치
// 있는 짧은 정보) / REJECT(광고·완전중복·무가치 홍보문구만).
//
// 현재 실제 콘텐츠 생성 파이프라인은 DEEP_DIVE만 존재(generate-editorial-draft-background.js).
// 나머지 6개 카테고리(SEARCH_GUIDE/PRODUCT_BRIEF/COMPARE/BACKGROUND/UPDATE/SHORT_BRIEF)는 이번
// 라운드에서 "분류·저장"까지만 하고, 각각의 전용 생성 파이프라인은 후속 작업으로 남긴다(PM 지시
// §9 순서 — Content Routing Gate 수립 다음이 100명 에디터, 그 다음이 Expansion Engine).
//
// Background Function(15분 예산) — Editorial Engine 다른 함수들과 동일 패턴.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 10;

const ROUTES = ['DEEP_DIVE', 'SEARCH_GUIDE', 'PRODUCT_BRIEF', 'COMPARE', 'BACKGROUND', 'UPDATE', 'SHORT_BRIEF', 'REJECT'];

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

// Rule 예비필터 — 이번엔 "확실한 REJECT"만 남긴다(광고/스팸 패턴). 행정·정책 패턴은 절대 넣지 않는다
// (PM 지시: "행정·정책 정보라는 이유만으로 버리지 마세요").
const REJECT_PATTERNS = [
  { label: '광고성 표현', re: /(무료체험|지금 바로 구매|한정 특가|프로모션 코드)/ },
];

function ruleReject(name, summary) {
  const text = `${name} ${summary || ''}`;
  for (const p of REJECT_PATTERNS) {
    if (p.re.test(text)) return p.label;
  }
  return null;
}

function buildPrompt(topic, plan) {
  return `너는 뉴스저울의 Content Routing Gate 분류 담당자다. 아래 이슈를 8가지 콘텐츠 유형 중
정확히 하나로 분류해라. 뉴스저울은 소수의 엄선된 글만 내는 매체가 아니라, 검색 가치가 있는 정보를
최대한 폭넓게 다루는 대형 편집국이다. **행정·정책·지원사업 정보라는 이유만으로 낮게 평가하지 마라**
— 대상·조건·신청방법이 명확하면 오히려 SEARCH_GUIDE로 적극 분류해라.

이슈 이름: ${topic.name}
요약: ${topic.summary || '(요약 없음)'}
카테고리: ${topic.category || '(미분류)'}
사건 유형: ${plan?.event_type || '(미분류)'}

8가지 유형:
- DEEP_DIVE: 여러 관점·배경이 얽힌 심층 해설이 필요한 사건(정치적 논쟁, 대형 사고, 국제 분쟁 등)
- SEARCH_GUIDE: 지원 대상/신청 조건/신청 방법/필요 서류/기간/주의사항이 있는 실용 정보(정책, 지원금, 제도 변경)
- PRODUCT_BRIEF: 신차·신제품의 가격/사양/출시일/경쟁제품/장단점/구매대상 정리
- COMPARE: 제품·정책·기업·인물·사건을 비교하는 것이 핵심 가치인 경우
- BACKGROUND: 인물·기업·제도·사건의 역사와 배경 설명이 핵심인 경우
- UPDATE: 기존에 이미 다뤘을 법한 사건의 후속·갱신 소식
- SHORT_BRIEF: 위 어디에도 깊이 안 맞지만 검색·기록 가치는 있는 짧은 정보
- REJECT: 광고, 완전 중복, 의미 없는 홍보성 문구 — 이것만 REJECT. 행정/정책이라서 REJECT 금지.

설명 없이 JSON만 반환해라(코드블록 없이):
{
  "route": "SEARCH_GUIDE",
  "reasons": ["대상·금액·신청기간이 명시된 지원사업", "검색 수요가 있는 실용 정보"],
  "is_ad_or_duplicate_or_empty": false,
  "target_length_hint": "800~1500자"
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
      max_tokens: 500,
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

// 결정론적 후처리 — LLM이 REJECT를 골랐어도 "광고/중복/무가치"가 아니면 코드가 강제로
// SHORT_BRIEF로 강등한다(행정·정책 정보를 이유 없이 버리지 않는다는 원칙을 코드로 보증).
function decideRoute(judged) {
  let route = ROUTES.includes(judged.route) ? judged.route : 'SHORT_BRIEF';
  const reasons = Array.isArray(judged.reasons) ? [...judged.reasons] : [];

  if (route === 'REJECT' && !judged.is_ad_or_duplicate_or_empty) {
    route = 'SHORT_BRIEF';
    reasons.push('(자동 보정) 행정/정책 등 이유만으로는 REJECT하지 않음 — SHORT_BRIEF로 강등');
  }

  return { route, reasons };
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
    const topics = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.planned&gate_status=eq.pending_gate&select=id,name,summary,category,ai_context&order=updated_at.desc&limit=${BATCH_SIZE}`
    );

    const stats = { targeted: topics.length, ruleRejected: 0, failed: 0 };
    ROUTES.forEach((r) => { stats[r] = 0; });

    for (const topic of topics) {
      try {
        const ruleLabel = ruleReject(topic.name, topic.summary);
        let gateResult;

        if (ruleLabel) {
          gateResult = {
            status: 'REJECT',
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
          const { route, reasons } = decideRoute(judged);
          gateResult = {
            status: route,
            score: judged,
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
