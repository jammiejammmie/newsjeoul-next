// generate-editorial-plan-background.js — Editorial Engine Layer 1 (Classification & Planning)
// 근거: docs/newsjeoul-editorial-engine-architecture.md §2~4, DEC-002~005
//
// Rule 예비필터(코드, 무료) → 후보 압축 → LLM 구조화 호출 1회로 event_type/축조정/관점/대립관점여부를
// 동시 산출한다. FIXED 값(event_type_rules)과 병합해 Editorial Plan을 만들어 topics.ai_context에 저장.
// 유형9(분쟁)·10(재난)은 안전 오버라이드로 구조 규칙을 하드락(§4).
//
// Background Function(2026-07-11): Netlify 동기 함수 26초 하드캡 회피 + 365일 무인 운영 목표에 맞춰
// Cron 자동 호출 전제로 전환(운영은 자동, 관리자 버튼은 개발·검증용). 호출자는 202 즉시 수신.

const { sortByBuzz } = require('./buzz-engine');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 20; // 10→20 추가 상향(2026-07-19 생산량 증대 지시, KPI=색인 페이지 수)

// Editorial OS v1 "판별 신호" 기반 Rule 예비필터 — LLM 호출 전 후보를 좁힌다(§4).
// 정확한 분류가 목적이 아니라 "명백히 아닌 유형"을 먼저 걸러 LLM이 10지선다 대신
// 좁혀진 후보 중에서만 고르게 하는 것이 목적.
const DETECTION_PATTERNS = [
  { type: '신제품·모델출시', re: /(공개|출시|발표).*(신제품|신형|모델|스펙|가격)|신제품|신형 출시/ },
  { type: 'M&A·투자', re: /인수|합병|지분\s?투자|M&A|펀딩|IPO/ },
  { type: '규제·정책', re: /시행령|법안|규제|가이드라인|정책 발표/ },
  { type: '오픈소스·기술공개', re: /오픈소스|공개.*(코드|모델|저장소)|깃허브|GitHub/ },
  { type: '선언·전망·논쟁', re: /전망|논쟁|주장|밝혔다|우려|경고/ },
  { type: '보안사고·장애', re: /유출|해킹|장애|중단|보안 사고/ },
  { type: '실적·시장변화', re: /실적|분기|매출|영업이익|전년\s?대비|주가/ },
  { type: '인물교체·조직변화', re: /선임|사임|교체|경질|조직개편|신임/ },
  { type: '분쟁·외교·전쟁', re: /공격|협상|제재|정상회담|분쟁|전쟁|외교/ },
  { type: '재난·긴급상황', re: /지진|화재|침수|폭발|붕괴|대피|긴급|사고 발생/ },
];

function ruleCandidates(text) {
  const hits = DETECTION_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.type);
  return [...new Set(hits)];
}

// 유형9·10 안전 오버라이드용 — Rule이 강신호를 감지하면 LLM 분류와 무관하게 구조 규칙을 하드락(§4)
const SAFETY_LOCK_PATTERNS = {
  '분쟁·외교·전쟁': /공격|전쟁|분쟁|제재|정상회담/,
  '재난·긴급상황': /지진|화재|침수|폭발|붕괴|대피|긴급 상황/,
};

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

// Persona Registry(§7, DEC-003; 100명 확장은 PM 지시 2026-07-17) — perspective_tag별로
// 도메인 매칭 → 사건유형(preferred_event_types) 매칭 → 로테이션(가장 오래전에 배정된 에디터 우선)
// 순으로 좁혀가며 실제 인격을 배정한다. recentlyAssigned는 같은 배치 실행 안에서 방금 배정한 것도
// 반영해, 한 배치 안에서 같은 에디터가 몰리지 않게 한다.
//
// 미배정률 0% 요구사항(PM 지시) — perspective_tag가 풀에 아예 없거나(등록 오류·데이터 지연 등)
// 도메인/사건유형이 하나도 안 맞아도 절대 null을 반환하지 않는다. 정확한 매칭이 없으면 단계적으로
// 조건을 완화해 최종적으로는 "전체 풀에서 가장 오래 안 쓰인 에디터"까지 내려가 반드시 누군가를 배정한다.
function pickEditor(pool, perspectiveTag, domain, eventType, recentlyAssigned, excludeIds) {
  const excluded = excludeIds && excludeIds.size ? pool.filter((e) => !excludeIds.has(e.id)) : pool;
  const available = excluded.length ? excluded : pool; // 풀이 exclude로 전부 소진되면 중복 배정을 감수하고서라도 미배정은 피한다
  if (!available.length) return null;
  const tagMatched = available.filter((e) => e.perspective_tag === perspectiveTag);
  const base = tagMatched.length ? tagMatched : available; // tag 자체가 안 맞아도 전체 풀로 폴백 — 미배정 방지
  const domainMatched = domain ? base.filter((e) => (e.domains || []).includes(domain)) : [];
  const scoped = domainMatched.length ? domainMatched : base;
  const eventMatched = eventType ? scoped.filter((e) => (e.preferred_event_types || []).includes(eventType)) : [];
  const final = eventMatched.length ? eventMatched : scoped;
  const sorted = [...final].sort((a, b) => {
    const aTime = recentlyAssigned.get(a.id) || a.last_assigned_at || '';
    const bTime = recentlyAssigned.get(b.id) || b.last_assigned_at || '';
    return aTime < bTime ? -1 : aTime > bTime ? 1 : 0; // 오래 안 쓰인 에디터 우선
  });
  return sorted[0];
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

async function claudePlan(topic, candidateTypes, allTypeNames, rules, zeitgeistTags) {
  const typePool = candidateTypes.length ? candidateTypes : allTypeNames;
  const ruleSummaries = typePool.map((t) => {
    const r = rules.find((x) => x.event_type === t);
    if (!r) return `- ${t}`;
    return `- ${t}: 관점 후보[${(r.perspective_candidates || []).join(',')}], 대립관점${r.requires_dual_perspective_fixed === null ? '(AI 판단)' : r.requires_dual_perspective_fixed ? '(항상 필수)' : '(원칙적으로 없음)'}`;
  }).join('\n');

  const prompt = `아래 이슈(Topic)를 Editorial OS 사건 유형 체계에 따라 분류하고 편집 계획을 세워라.
설명 없이 JSON 객체만 반환해라.

이슈 이름: ${topic.name}
요약: ${topic.summary || '(요약 없음)'}
카테고리: ${topic.category || '(미분류)'}
오늘의 화두: ${zeitgeistTags.length ? zeitgeistTags.join(', ') : '(없음)'}

후보 유형과 각 유형의 관점 후보:
${ruleSummaries}

반환 형식:
{
  "event_type": "위 후보 중 하나(정확히 같은 문자열)",
  "type_confidence": 0.0~1.0,
  "axis_overrides_reason": "오늘의 화두를 반영해 축 비중을 조정했다면 그 이유, 없으면 빈 문자열",
  "perspectives": ["해당 유형의 관점 후보 중 1~3개 선택"],
  "requires_dual_perspective": true 또는 false
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // 2026-08-17(비용 분석): 하루 160회(3시간마다 20건). 출력이 에디터 배정·사건 유형·축
      // 가중치처럼 값 범위가 정해진 구조화 JSON이고, 아래 2026-08-06 메모대로 thinking도 이미
      // 꺼둔 상태라 sonnet-5의 이점이 남아 있지 않다. haiku-4.5로 내려 출력 단가를 1/3로 한다.
      // 다만 이 단계는 본문 품질의 설계도에 해당하므로, 전환 후 실제 발행물의 축 커버리지와
      // 에디터 배정이 이전과 같은지 먼저 확인할 대상이다(이번 전환 중 유일하게 판단이 섞인 곳).
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
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
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const rules = await supabaseGet('event_type_rules', '?select=*');
    if (!rules.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0, note: 'event_type_rules 비어있음 — Phase 1 마이그레이션 먼저 실행 필요' }) };
    }
    const allTypeNames = rules.map((r) => r.event_type);

    const today = new Date().toISOString().slice(0, 10);
    const [zeitgeistRow] = await supabaseGet('daily_zeitgeist', `?date=eq.${today}&select=tags`);
    const zeitgeistTags = zeitgeistRow?.tags || [];

    // ── buzz 우선순위 (2026-08-17) ──────────────────────────────────────────
    // 여기는 아직 발행이 아니라 "기획" 단계라 카테고리 쿼터는 걸지 않는다(쿼터를 앞단에 걸면
    // 뒤 단계가 고를 후보 자체가 편향된다). 대신 화제성 높은 Topic이 먼저 기획을 받도록 정렬만 한다.
    const POOL_SIZE = Math.max(BATCH_SIZE * 5, 50);
    const pool = await supabaseGet(
      'topics',
      `?status=eq.active&editorial_status=eq.pending&select=id,name,summary,category,ai_context,editorial_retry_count,updated_at&order=updated_at.desc&limit=${POOL_SIZE}`
    );
    if (!pool.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };
    }
    const pending = sortByBuzz(pool).slice(0, BATCH_SIZE);
    console.log(`기획 대상: 후보 ${pool.length}건 → buzz 상위 ${pending.length}건`);

    const editorsPool = await supabaseGet('editors', '?active=eq.true&select=id,name,perspective_tag,domains,last_assigned_at,preferred_event_types,content_missions,assignment_count');
    const recentlyAssigned = new Map(); // 이 배치 안에서 방금 배정한 것도 반영(같은 에디터 몰림 방지)
    const assignCountDelta = new Map(); // 같은 배치 안에서 여러 번 배정된 에디터의 assignment_count를 누적

    const results = [];
    let planned = 0, lowConfidence = 0, failed = 0;

    for (const topic of pending) {
      try {
        const text = `${topic.name} ${topic.summary || ''}`;
        const candidates = ruleCandidates(text);
        const plan = await claudePlan(topic, candidates, allTypeNames, rules, zeitgeistTags);

        if (!plan || !allTypeNames.includes(plan.event_type)) {
          failed++;
          results.push({ topic_id: topic.id, name: topic.name, error: 'LLM 응답 파싱 실패 또는 미지정 유형' });
          continue;
        }

        // 안전 오버라이드(§4): 강신호 감지 시 LLM 분류와 무관하게 유형9·10 구조 규칙 하드락
        let finalType = plan.event_type;
        for (const [lockType, re] of Object.entries(SAFETY_LOCK_PATTERNS)) {
          if (re.test(text) && finalType !== lockType) {
            finalType = lockType; // 안전 우선 — 재난/분쟁 신호가 강하면 그 유형의 규칙으로 강제
          }
        }

        const rule = rules.find((r) => r.event_type === finalType);
        const requiresDual = rule.requires_dual_perspective_fixed !== null
          ? rule.requires_dual_perspective_fixed
          : !!plan.requires_dual_perspective;

        const perspectives = Array.isArray(plan.perspectives) && plan.perspectives.length ? plan.perspectives : rule.perspective_candidates.slice(0, 2);

        // Persona Registry resolve(§7, DEC-003; 100명 확장은 PM 지시 2026-07-17) — 관점마다 실제 에디터를 배정.
        // 대립관점(dual-perspective) Topic에서 서로 다른 관점에 같은 사람이 배정되는 것을 막기 위해
        // 순차 처리 + 같은 Topic 내 이미 배정된 에디터는 다음 관점에서 제외한다.
        const assignedInThisTopic = new Set();
        const assignedEditors = [];
        for (const p of perspectives) {
          const picked = pickEditor(editorsPool, p, topic.category, finalType, recentlyAssigned, assignedInThisTopic);
          if (!picked) continue;
          assignedEditors.push(picked);
          assignedInThisTopic.add(picked.id);
          recentlyAssigned.set(picked.id, new Date().toISOString());
          assignCountDelta.set(picked.id, (assignCountDelta.get(picked.id) || 0) + 1);
        }

        const editorialPlan = {
          event_type: finalType,
          type_confidence: typeof plan.type_confidence === 'number' ? plan.type_confidence : 0.5,
          domain: topic.category || null,
          zeitgeist_ref: today,
          axis_weights: rule.axis_weights,
          axis_overrides_reason: plan.axis_overrides_reason || '',
          perspectives,
          editors_assigned: assignedEditors.map((e) => ({ id: e.id, name: e.name, perspective: e.perspective_tag, exact_match: perspectives.includes(e.perspective_tag) })),
          requires_dual_perspective: requiresDual,
          evidence_required: rule.evidence_required,
          target_length_range: [rule.target_length_min, rule.target_length_max],
          qa_flags: ['evidence_completeness', 'length_range', 'dual_perspective_check'],
          generated_at: new Date().toISOString(),
        };

        if (editorialPlan.type_confidence < 0.7) lowConfidence++;

        if (!isDry) {
          const newStatus = editorialPlan.type_confidence < 0.7 ? 'pending' : 'planned'; // §4 재분류 루프: 낮은 신뢰도는 다음 배치에서 재시도
          // 재분류(재시도) 시 이전 draft/evidence/qa를 실수로 지우지 않도록 기존 ai_context를 보존하며 병합한다
          // (2026-07-11 확인된 버그 — 통째로 덮어쓰면 이미 발행된 장문이 사라질 수 있었음).
          await supabasePatch('topics', `?id=eq.${topic.id}`, {
            ai_context: { ...(topic.ai_context || {}), plan: editorialPlan },
            editorial_status: newStatus,
            editorial_retry_count: editorialPlan.type_confidence < 0.7 ? (topic.editorial_retry_count || 0) + 1 : 0,
          });
          if (newStatus === 'planned') planned++;

          for (const e of assignedEditors) {
            const delta = assignCountDelta.get(e.id) || 0;
            await supabasePatch('editors', `?id=eq.${e.id}`, {
              last_assigned_at: new Date().toISOString(),
              assignment_count: (e.assignment_count || 0) + delta,
            }).catch(() => {});
          }
        }

        results.push({ topic_id: topic.id, name: topic.name, plan: editorialPlan });
      } catch (e) {
        failed++;
        console.error('generate-editorial-plan topic 처리 오류:', topic.id, e.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true, dry: isDry, targetedThisRun: pending.length,
        planned, lowConfidence, failed,
        results: isDry ? results : undefined,
      }),
    };
  } catch (e) {
    console.error('generate-editorial-plan 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
