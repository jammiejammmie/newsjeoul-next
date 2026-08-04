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
// 2026-08-04: 25 → 80 상향. 이 함수는 AI를 호출하지 않고 DB 조회·계산·PATCH만 하므로 건당
// 비용이 매우 낮다(1회 실행 = 조회 3회 + PATCH N회). 상향 근거는 커버리지 산술이다:
// active Topic이 642건인데 GitHub Actions 스케줄 throttling으로 실제 실행이 하루 약 10회다
// (설정 1시간, 실측 147분). 25건씩이면 하루 250건 = 전체를 한 바퀴 도는 데 2.6일이 걸려,
// 홈 Hero로 쓰이는 점수가 며칠씩 낡은 값으로 남는다. 80건이면 하루 800건으로 전체를
// 매일 한 바퀴 이상 갱신할 수 있다.
const BATCH_SIZE = 80;
// Hero 후보 신선도 유지용(아래 대상 선정 주석 참고). 홈 헤드는 lib/topics.ts의 pickHeroTopic이
// "24시간 안에 재계산된 점수"만 신뢰하므로, 상위 점수권은 그보다 짧은 주기로 갱신해줘야 한다.
const HERO_SCOPE_SIZE = 60; // 상위 몇 건을 Hero 관련 범위로 볼지(홈 후보 풀 41건보다 여유 있게)
const HERO_STALE_AFTER_HOURS = 6; // 상위권은 6시간 지나면 재계산 대상(24시간 요건에 충분한 여유)
const HERO_REFRESH_SLICE = 25; // 한 실행에서 Hero 우선분에 배정할 최대 건수(나머지는 커버리지)
const HISTORY_CAP = 20;

// ── 신선도 감쇠 파라미터 ─────────────────────────────────────────────────────
// 보도가 끊긴 사안이 누적 점수만으로 상단에 남는 것을 막는다(2026-08-05 신설).
// 값의 근거: 감쇠 없음 상태에서 상위 30건 중 24건이 48시간 넘게 기사가 없었고,
// 신규 토픽(최고 516g)이 8위를 넘지 못했다.
const DECAY_FREE_HOURS = 30;   // 하루 조금 넘게는 깎지 않는다(수집 공백·주말 방어)
const DECAY_PER_DAY = 0.12;    // 이후 하루당 12%
const MAX_DECAY_RATIO = 0.6;   // 최대 60% — 완전히 0으로 만들지 않는다(과거 사안도 검색 유입이 있다)

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

  // ── 신선도 감쇠 ────────────────────────────────────────────────────────────
  // 왜 필요한가(실측 2026-08-05): 위 7개 항목은 전부 "누적"이다. 기사·엔티티가 쌓일수록
  // 오르고, 시간이 지나도 내려가지 않는다. recency_bonus만 시간을 보는데 그건 40g(전체의 7%)에
  // 불과하고 감점이 아니라 가점이다.
  //
  // 그래서 홈 상위 30건 중 24건이 recency_bonus=0(48시간 넘게 기사 없음)인데도 상단을
  // 점유했다. 15일 된 토픽이 507g으로 12위에 있었다. 신규 토픽 최고점 516g은 8위가 한계였다.
  // 결과가 "홈 내용이 안 바뀐다"였다 — 랭킹이 바뀔 수 없는 산식이었기 때문이다.
  //
  // 감쇠 기준은 "토픽 나이"가 아니라 "마지막 기사 이후 경과 시간"이다. 계속 보도되는 사안은
  // 오래돼도 무거운 게 맞다(구마모토 강진처럼). 보도가 끊긴 사안만 내려가야 한다.
  const rawBeforeDecay = Object.values(components).reduce((a, b) => a + b, 0);

  // 기사에 날짜가 하나도 없으면 staleness를 측정할 수 없다 → 토픽 생성 시점으로 폴백한다.
  // 폴백이 없으면 날짜 없는 토픽만 감쇠를 피해가며 상단에 남는다.
  const createdHours = topic.created_at ? (now - new Date(topic.created_at).getTime()) / 3600000 : 0;
  const staleHours = hoursSince !== null ? hoursSince : createdHours;

  // staleHours가 음수일 수 있다 — 수집원 시계가 앞서면 published_at이 미래로 들어온다(실측 가능).
  // Math.max(0, ...)으로 막지 않으면 미래 날짜가 감쇠를 양수로 만들어 무게를 부풀린다.
  const decayDays = Math.max(0, (Math.max(0, staleHours) - DECAY_FREE_HOURS) / 24);
  const decayRatio = Math.min(MAX_DECAY_RATIO, decayDays * DECAY_PER_DAY);
  // -Math.round(x * 0)은 -0이다. jsonb에 -0을 저장하지 않도록 0으로 정규화한다.
  components.staleness_decay = decayRatio > 0 ? -Math.round(rawBeforeDecay * decayRatio) : 0;
  if (components.staleness_decay < 0) {
    reasons.push(
      `마지막 보도 후 ${Math.round(staleHours)}시간 경과 — 신선도 감쇠 ${Math.round(decayRatio * 100)}% (${components.staleness_decay}g)`
    );
  }

  const raw = rawBeforeDecay + components.staleness_decay;
  const grams = Math.max(1, Math.min(999, Math.round(raw)));

  return { grams, reasons, components };
}

// Hero(대표 기사) 변경 이력 기록(best-effort) — PM 지시(2026-07-22): "이력이 있어야 Weight Engine이
// 정상 동작하는지 판단할 수 있다." 이 함수가 매 3시간 무게를 갱신한 직후가 Hero 순위가 바뀔 수
// 있는 시점이므로 여기서 확인한다(app/page.tsx는 매 요청마다 렌더링만 할 뿐 쓰기를 하지 않는다 —
// anon key는 어차피 hero_history에 쓸 권한이 없다, global_rls_policy.sql의 "service write" 정책).
// hero_history 테이블이 아직 마이그레이션 전이면 조용히 실패하고 넘어간다.
async function trackHeroHistory() {
  try {
    const top = await supabaseGet('topics', '?status=eq.active&select=id,name,importance_score&order=importance_score.desc&limit=1');
    if (!top.length) return;
    const current = top[0];

    const lastHistory = await supabaseGet('hero_history', '?select=to_topic_id,to_topic_name,to_importance_score&order=changed_at.desc&limit=1');
    const last = lastHistory[0] || null;

    if (last && last.to_topic_id === current.id) return; // Hero 변화 없음

    const res = await fetch(`${SUPABASE_URL}/rest/v1/hero_history`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        from_topic_id: last?.to_topic_id ?? null,
        from_topic_name: last?.to_topic_name ?? null,
        from_importance_score: last?.to_importance_score ?? null,
        to_topic_id: current.id,
        to_topic_name: current.name,
        to_importance_score: current.importance_score,
      }),
    });
    if (!res.ok) console.error('HERO_HISTORY_LOG_FAILED(참고용 로그만 누락):', await res.text());
    else console.log(`HERO_CHANGED: ${last?.to_topic_name || '(없음)'} → ${current.name} (${current.importance_score}g)`);
  } catch (e) {
    console.error('HERO_HISTORY_LOG_FAILED(참고용 로그만 누락):', e.message);
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
    // 아직 계산된 적 없거나(computed_at null) 가장 오래전에 계산된 Topic부터 처리 —
    // 이렇게 해야 반복 실행 시 전체 Topic이 골고루 갱신된다(특정 Topic만 계속 재계산되는 편중 방지).
    //
    // 2026-08-04 수정(Hero 고정 사고): 이전 구현은 `limit=300`으로 정렬 없이 먼저 가져온 뒤
    // 그 300건 안에서만 client-side로 오래된 순 정렬을 했다. active Topic이 642건으로 늘어난
    // 지금, PostgREST가 정렬 없이 돌려주는 300건은 물리적 순서에 가까운 임의 집합이라
    // 나머지 342건은 아예 재계산 대상에 들어오지 못한다 — 실제로 홈 Hero였던
    // "트럼프 하마스 무장해제 합의"가 그 300건 밖에 있어서 80시간 동안 점수가 갱신되지 않았고,
    // 그래서 홈 헤드가 며칠째 고정돼 있었다. 정렬을 DB로 내려 전체 테이블에서 오래된 순으로
    // 뽑는다(이러면 "가장 오래된 것부터"가 전체 기준으로 보장된다).
    // 다만 "가장 오래된 것부터"만으로는 홈 Hero 문제가 안 풀린다. 오래된 순으로만 돌면 한 번도
    // 계산되지 않은 하위권 Topic부터 처리하게 되고, 정작 Hero 후보인 상위 점수권은 순서가 돌아올
    // 때까지 낡은 값으로 남는다(실측: 상위 41건 중 신선도 요건을 통과한 것이 2건뿐이었다).
    // 그래서 대상을 두 갈래로 나눈다:
    //   (1) Hero 관련성 — 상위 점수권에서 6시간 이상 갱신되지 않은 Topic을 우선 재계산
    //   (2) 커버리지 — 전체에서 가장 오래된(또는 미계산) Topic
    // 이렇게 하면 홈 헤드에 쓰이는 점수는 항상 신선하게 유지되면서 전체 순회도 계속 진행된다.
    const SELECT = 'select=id,name,category,importance_score,ai_context';
    const [topScored, stalest] = await Promise.all([
      supabaseGet('topics', `?status=eq.active&${SELECT}&order=importance_score.desc&limit=${HERO_SCOPE_SIZE}`),
      supabaseGet('topics', `?status=eq.active&${SELECT}&order=ai_context->weight->>computed_at.asc.nullsfirst&limit=${BATCH_SIZE}`),
    ]);

    const heroCutoff = Date.now() - HERO_STALE_AFTER_HOURS * 3600000;
    const heroTargets = topScored
      .filter((t) => {
        const computedAt = t.ai_context?.weight?.computed_at;
        return !computedAt || Date.parse(computedAt) < heroCutoff;
      })
      .slice(0, HERO_REFRESH_SLICE);

    // Hero 우선분을 앞에 두고 합친 뒤 중복 제거 — 배치 예산을 넘지 않게 자른다.
    const seenIds = new Set();
    const targets = [];
    for (const t of [...heroTargets, ...stalest]) {
      if (seenIds.has(t.id)) continue;
      seenIds.add(t.id);
      targets.push(t);
      if (targets.length >= BATCH_SIZE) break;
    }
    if (!targets.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };
    }
    console.log(
      `WEIGHT_TARGETS: 총 ${targets.length}건(Hero 우선 ${heroTargets.length}건 + 오래된순 ${targets.length - heroTargets.length}건)`
    );
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

    await trackHeroHistory();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, targetedThisRun: targets.length, updated, failed, results }),
    };
  } catch (e) {
    console.error('update-topic-weight 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

// 산식만 따로 테스트할 수 있게 내보낸다(감쇠 도입 시 신설).
exports._testUtils = { computeWeight, DECAY_FREE_HOURS, DECAY_PER_DAY, MAX_DECAY_RATIO, EVENT_TYPE_BASE };
