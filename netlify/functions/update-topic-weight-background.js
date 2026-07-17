// update-topic-weight-background.js — "몇 g" 실제 산정 엔진
// 근거: PM 지시(2026-07-17, "무게(g)를 발행 여부와 혼동하지 말고 실제 산정 근거를 기록").
//
// 문제: lib/topics.ts:23 주석에서 이미 확인된 대로, topics.importance_score/popularity_score가
// 현재 파이프라인 전체에서 50 고정값으로 남아있어 app/topic/[slug]/page.tsx의 "무게 {g}" 표시가
// 사실상 근거 없는 임의 숫자였다. 이 함수는 실제 DB에 존재하는 신호(출처 수, 연결 엔티티, 논쟁도,
// 최신성, 대립관점 여부, 사건유형)만으로 무게를 계산하고, 어떤 값이 왜 나왔는지(weight_reasons)를
// 반드시 함께 저장한다. 발행 여부(Content Routing Gate)와는 완전히 별개 축 — 여기서는 gate_status를
// 전혀 참조하지 않는다.
//
// 새 컬럼/테이블 없이 기존 topics.importance_score(정렬용) + ai_context.weight/weight_history(jsonb,
// 근거·이력)만 사용 — DB 마이그레이션 불필요.
//
// Background Function(15분 예산).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH_SIZE = 25;
const HISTORY_CAP = 20;

// 사건유형별 기본 무게(0~1000 스케일의 절반 이하를 기본값으로 잡고, 나머지는 실제 신호로 채운다).
// 근거: 즉각적 위해·안전 관련일수록 높게, 정보성·트렌드성일수록 낮게 — event_type_rules의
// evidence_required/target_length로 이미 나타난 "긴급성·심각도" 서열을 그대로 반영.
const EVENT_TYPE_BASE = {
  '재난·긴급상황': 320,
  '분쟁·외교·전쟁': 300,
  '보안사고·장애': 260,
  '선언·전망·논쟁': 210,
  '규제·정책': 220,
  'M&A·투자': 190,
  '인물교체·조직변화': 180,
  '실적·시장변화': 170,
  '신제품·모델출시': 150,
  '오픈소스·기술공개': 140,
};
const DEFAULT_BASE = 160;

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

// 실제 신호만으로 구성된 결정론적 산식 — 각 항목이 얼마나 기여했는지 components에 그대로 남기고,
// 사람이 읽을 수 있는 reasons 문장으로도 변환한다(임의 숫자 금지 — PM 지시).
function computeWeight(topic, stories, entities, plan) {
  const components = {};
  const reasons = [];

  const eventType = plan?.event_type || null;
  components.base_by_event_type = EVENT_TYPE_BASE[eventType] ?? DEFAULT_BASE;
  if (eventType) reasons.push(`사건유형 "${eventType}" 기본 무게 ${components.base_by_event_type}g`);

  const storyCount = stories.length;
  components.source_count_score = Math.min(storyCount, 12) * 12;
  if (storyCount > 0) reasons.push(`연결된 기사/스토리 ${storyCount}건 (+${components.source_count_score}g)`);

  const entityCount = entities.length;
  components.entity_count_score = Math.min(entityCount, 8) * 8;
  if (entityCount > 0) reasons.push(`연결된 엔티티 ${entityCount}개 (+${components.entity_count_score}g)`);

  // topic_entities.strength_score도 0~100 스케일(실측 확인, 0~1이 아님 — controversy_score와 동일 패턴)
  const maxEntityStrength = entities.reduce((m, e) => Math.max(m, e.strength_score || 0), 0);
  components.prominent_entity_bonus = maxEntityStrength >= 80 ? 60 : maxEntityStrength >= 50 ? 30 : 0;
  if (components.prominent_entity_bonus > 0) reasons.push(`핵심 엔티티 연관도 높음(최대 ${maxEntityStrength.toFixed(0)}/100) (+${components.prominent_entity_bonus}g)`);

  // stories.controversy_score는 0~100 스케일(실측 확인, 0~1이 아님 — 2026-07-17 실운영 검증 중 발견해 수정)
  const controversyScores = stories.map((s) => s.controversy_score).filter((v) => typeof v === 'number');
  const avgControversy = controversyScores.length ? controversyScores.reduce((a, b) => a + b, 0) / controversyScores.length : 0;
  components.controversy_score_bonus = Math.round(avgControversy);
  if (components.controversy_score_bonus > 10) reasons.push(`평균 논쟁도 ${avgControversy.toFixed(0)}/100 (+${components.controversy_score_bonus}g)`);

  components.dual_perspective_bonus = plan?.requires_dual_perspective ? 80 : 0;
  if (components.dual_perspective_bonus > 0) reasons.push(`대립관점 필수 사안 (+${components.dual_perspective_bonus}g)`);

  const now = Date.now();
  const recentPublished = stories.map((s) => s.published_at).filter(Boolean).map((d) => new Date(d).getTime());
  const mostRecent = recentPublished.length ? Math.max(...recentPublished) : null;
  const hoursSince = mostRecent !== null ? (now - mostRecent) / 3600000 : null;
  components.recency_bonus = hoursSince === null ? 0 : hoursSince <= 24 ? 40 : hoursSince <= 48 ? 20 : 0;
  if (components.recency_bonus > 0) reasons.push(`최근 ${Math.round(hoursSince)}시간 내 기사 존재 (+${components.recency_bonus}g)`);

  const raw = Object.values(components).reduce((a, b) => a + b, 0);
  const grams = Math.max(1, Math.min(999, Math.round(raw)));

  return { grams, reasons, components };
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
    const pool = await supabaseGet('topics', '?status=eq.active&select=id,name,category,importance_score,ai_context&limit=300');
    if (!pool.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };
    }

    // 아직 계산된 적 없거나(weight.computed_at 없음) 가장 오래전에 계산된 Topic부터 처리 —
    // 이렇게 해야 반복 실행 시 전체 Topic이 골고루 갱신된다(특정 Topic만 계속 재계산되는 편중 방지).
    const sorted = [...pool].sort((a, b) => {
      const aT = a.ai_context?.weight?.computed_at || '';
      const bT = b.ai_context?.weight?.computed_at || '';
      return aT < bT ? -1 : aT > bT ? 1 : 0;
    });
    const targets = sorted.slice(0, BATCH_SIZE);
    const ids = targets.map((t) => t.id);

    const [storyLinks, entityLinks] = await Promise.all([
      supabaseGet('topic_stories', `?topic_id=in.(${ids.join(',')})&select=topic_id,stories(controversy_score,published_at)`),
      supabaseGet('topic_entities', `?topic_id=in.(${ids.join(',')})&select=topic_id,strength_score`),
    ]);

    const storiesByTopic = new Map();
    storyLinks.forEach((row) => {
      if (!row.stories) return;
      const arr = storiesByTopic.get(row.topic_id) || [];
      arr.push(row.stories);
      storiesByTopic.set(row.topic_id, arr);
    });
    const entitiesByTopic = new Map();
    entityLinks.forEach((row) => {
      const arr = entitiesByTopic.get(row.topic_id) || [];
      arr.push({ strength_score: row.strength_score });
      entitiesByTopic.set(row.topic_id, arr);
    });

    let updated = 0, failed = 0;
    const results = [];

    for (const topic of targets) {
      try {
        const stories = storiesByTopic.get(topic.id) || [];
        const entities = entitiesByTopic.get(topic.id) || [];
        const plan = topic.ai_context?.plan || null;

        const { grams, reasons, components } = computeWeight(topic, stories, entities, plan);
        const prevWeight = topic.ai_context?.weight || null;
        const now = new Date().toISOString();

        const history = Array.isArray(topic.ai_context?.weight_history) ? [...topic.ai_context.weight_history] : [];
        if (!prevWeight || prevWeight.grams !== grams) {
          history.push({ grams, computed_at: now, delta_from_prev: prevWeight ? grams - prevWeight.grams : null });
          while (history.length > HISTORY_CAP) history.shift();
        }

        await supabasePatch('topics', `?id=eq.${topic.id}`, {
          importance_score: grams,
          ai_context: {
            ...(topic.ai_context || {}),
            weight: { grams, reasons, components, computed_at: now },
            weight_history: history,
          },
        });
        updated++;
        results.push({ topic_id: topic.id, name: topic.name, grams, reasons });
      } catch (e) {
        failed++;
        console.error('update-topic-weight topic 처리 오류:', topic.id, e.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, poolSize: pool.length, targetedThisRun: targets.length, updated, failed, results }),
    };
  } catch (e) {
    console.error('update-topic-weight 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
