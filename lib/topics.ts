import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getActiveTopics(limit = 10) {
  const supabase = client()
  // 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19) — Home 카드에 "관련 보도 수"를 실제 숫자로
  // 보여주기 위해 topic_stories를 count 집계로 함께 가져온다(PostgREST 임베디드 count, N+1 방지).
  const { data } = await supabase
    .from('topics')
    .select('id, slug, name, summary, status, lifecycle_stage, importance_score, popularity_score, updated_at, category, ai_context, topic_stories(count)')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .limit(limit)
  return data || []
}

// 단문(Brief) Topic 판별 — 목록에서 장문과 구분해 배지를 붙이는 단일 기준(PM 지시 2026-08-03).
//
// 판별을 gate_status가 아니라 ai_context.draft.promoted_from으로 하는 이유:
//   1) getActiveTopics가 이미 ai_context를 select하므로 모든 목록에서 추가 쿼리 없이 쓸 수 있다
//      (gate_status는 select 목록에 없어서 전 화면 쿼리를 다 고쳐야 한다).
//   2) promoted_from은 publish-routed-content-background가 "승격으로 발행했다"는 사실을 직접
//      기록한 값이다. gate_status는 발행 이후에도 재분류로 바뀔 수 있지만 이 값은 발행 경로를
//      가리키므로, 화면에 보이는 글의 실제 형태(단문)와 어긋나지 않는다.
//   3) 장문(DEEP_DIVE) 경로는 이 필드를 쓰지 않으므로 오탐이 구조적으로 불가능하다.
export function isBriefTopic(topic: any): boolean {
  return Boolean(topic?.ai_context?.draft?.promoted_from)
}

// Hero(메인 헤드라인) 선정 — Weight Engine(update-topic-weight-background.js, 2026-07-17
// 도입)이 실제 importance_score를 3시간마다 갱신하므로, getActiveTopics()가 이미 정렬해
// 넘겨준 1등을 그대로 쓴다. 예전엔 스코어링이 없어 고정 키워드 화이트리스트로 우회했었지만
// (커밋 이력 참고), 지금 그 화이트리스트를 남겨두면 오히려 실제로 더 무겁고 더 최신인 Topic이
// 있어도 키워드 매칭된 옛 Topic이 계속 우선돼 "새 중요 Topic이 나와도 상단이 안 바뀌는" 정반대
// 문제를 만든다(PM 지시 2026-07-22 — 상단 대표 기사는 새 중요 Topic이 나오면 자동 교체돼야 함).
// ── Hero(홈 헤드) 선정 ───────────────────────────────────────────────────────
// 2026-08-04 전면 재작성. 이전 구현은 `topics[0]`(importance_score 최고값) 하나였고, 그래서
// 홈 헤드가 며칠씩 같은 토픽에 고정됐다. 실측한 원인이 두 겹이었다:
//
//  1) 점수가 갱신되지 않았다 — update-topic-weight-background가 정렬 없이 `limit=300`으로
//     후보를 가져온 뒤 그 안에서만 "오래된 순" 정렬을 했다. active 642건 중 임의의 300건만
//     대상이 되므로, 당시 Hero였던 토픽은 그 밖에 있어서 80시간 동안 재계산되지 않았다.
//     (그 함수 쪽에서 DB 정렬로 고쳤다.)
//  2) 선정에 유효기간이 없었다 — 무게 산식의 recency_bonus는 "+40g 가산점"일 뿐 만료가 아니다.
//     80시간 전에 받은 +40이 그대로 남아 최고점을 유지하면 Hero가 영구히 고정된다.
//
// 그래서 선정 단계에 세 가지를 넣었다(PM 지시 2026-08-04):
//  · 신선도 게이트: 점수가 24시간 안에 재계산됐고 최근 기사 활동이 있는 토픽만 Hero 자격
//  · 회전: 4시간 단위로 후보 안에서 순환 — 같은 토픽이 4시간 넘게 헤드에 머물지 않는다
//  · 카테고리 다양성: 후보를 카테고리당 1개로 제한. IT/소비재처럼 사건유형 기본 무게가 낮아
//    (신제품·모델출시 150 vs 분쟁·외교·전쟁 300) 총점 1위가 되기 어려운 도메인도 헤드에 오른다.
//
// 왜 importance_score 산식을 건드리지 않았나: 그 점수는 Threads 배급 우선순위·목록 정렬·
// Hero에 모두 쓰인다. 헤드 다양성을 위해 점수를 부풀리면 배급 판단까지 함께 왜곡된다.
// 헤드 다양성은 표현(presentation) 문제이므로 선정 단계에서 푸는 것이 맞다.
// (화제성 신호로 popularity_score를 쓰려 했으나 642건 전부 50 고정값인 죽은 필드였다 —
//  실제 신호가 생기면 이 함수에 후보 가중치로 추가하면 된다.)

const HERO_ROTATION_HOURS = 4 // PM 지시 "3~6시간" 범위 중간값. 하루 6바퀴 = 후보 6개를 한 번씩.
const HERO_POOL_SIZE = 6 // 회전 후보 수. HERO_ROTATION_HOURS와 곱해 24시간이 되도록 맞췄다.
const HERO_MAX_WEIGHT_AGE_HOURS = 24 // 이보다 오래된 점수는 "지금의 무게"로 신뢰하지 않는다.
// 회전 후보의 점수 하한(1위 대비 비율). 다양성을 위해 후보를 넓히더라도 1위와 격차가 너무 큰
// 토픽이 헤드에 오르면 안 된다. 0.5는 "1위의 절반 이상 무게"라는 뜻 — 현재 사건유형 기본 무게
// 격차(150~320)를 감안하면 IT/소비재 상위 토픽이 들어올 수 있는 최소선이다.
const HERO_MIN_SCORE_RATIO = 0.5

// Hero 자격 — 점수가 최근에 재계산됐고(신선한 값) 최근 기사 활동이 있는가.
// recency_bonus는 무게 엔진이 "48시간 내 기사 존재"일 때만 0보다 크게 넣는 값이라 그대로 쓴다.
//
// weight를 두 위치에서 찾는 이유: 목록 조회(getActiveTopics)는 ai_context 전체를 담아
// ai_context.weight에 있고, 경량 조회(getHeroCandidates)는 최상위 weight로 별칭해 가져온다.
// 두 형태 모두 같은 함수로 판정할 수 있어야 화면과 운영 점검 결과가 갈리지 않는다.
function isHeroEligible(topic: any, now: number): boolean {
  const weight = topic?.ai_context?.weight ?? topic?.weight
  const computedAt = weight?.computed_at ? Date.parse(weight.computed_at) : NaN
  if (!Number.isFinite(computedAt)) return false
  if ((now - computedAt) / 3600000 > HERO_MAX_WEIGHT_AGE_HOURS) return false
  return (weight?.components?.recency_bonus ?? 0) > 0
}

// topics는 importance_score 내림차순으로 들어온다는 전제(getActiveTopics가 그렇게 정렬한다).
// now를 인자로 받는 이유는 테스트에서 회전 경계를 결정론적으로 검증하기 위해서다.
export function pickHeroTopic<T>(topics: T[], now: number = Date.now()): T | null {
  if (!topics.length) return null

  // 신선한 후보가 하나도 없으면(무게 엔진이 밀린 경우 등) 홈이 비지 않도록 전체로 폴백한다.
  const fresh = topics.filter((t) => isHeroEligible(t, now))
  const base = fresh.length ? fresh : topics

  const topScore = (base[0] as any)?.importance_score || 0
  const floor = topScore * HERO_MIN_SCORE_RATIO

  // 카테고리당 1개씩만 담아 도메인이 겹치지 않는 회전 후보를 만든다.
  const seenCategories = new Set<string>()
  const pool: T[] = []
  for (const t of base) {
    if (((t as any).importance_score || 0) < floor) break // 내림차순이므로 하한을 만나면 종료
    const category = (t as any).category || '(없음)'
    if (seenCategories.has(category)) continue
    seenCategories.add(category)
    pool.push(t)
    if (pool.length >= HERO_POOL_SIZE) break
  }
  if (!pool.length) return base[0] ?? null

  const bucket = Math.floor(now / (HERO_ROTATION_HOURS * 3600000))
  return pool[bucket % pool.length]
}

// 테스트/운영 점검용 — 지금 회전 후보가 무엇인지 그대로 확인할 수 있게 노출한다.
export function heroRotationPool<T>(topics: T[], now: number = Date.now()): T[] {
  const fresh = topics.filter((t) => isHeroEligible(t, now))
  const base = fresh.length ? fresh : topics
  const topScore = (base[0] as any)?.importance_score || 0
  const floor = topScore * HERO_MIN_SCORE_RATIO
  const seen = new Set<string>()
  const pool: T[] = []
  for (const t of base) {
    if (((t as any).importance_score || 0) < floor) break
    const c = (t as any).category || '(없음)'
    if (seen.has(c)) continue
    seen.add(c)
    pool.push(t)
    if (pool.length >= HERO_POOL_SIZE) break
  }
  return pool
}

export const HERO_TUNING = {
  HERO_ROTATION_HOURS, HERO_POOL_SIZE, HERO_MAX_WEIGHT_AGE_HOURS, HERO_MIN_SCORE_RATIO,
}

// Hero 후보 조회(경량) — 자격 판정에 필요한 필드만 가져온다.
//
// 왜 별도 쿼리인가: 신선도 요건을 통과하는 Topic이 상위권에 드물다(실측 2026-08-04 — 자격자
// 61건 중 상위 41건 안에 든 것이 1건뿐이었다. 점수는 기사·엔티티 누적으로 오르는데, 오래
// 다뤄진 이슈가 높은 점수를 유지하고 정작 최근 기사가 붙은 Topic은 점수가 낮기 때문이다).
// 그래서 Hero 후보는 목록 표시용(41건)보다 훨씬 넓게 봐야 한다.
//
// 그런데 ai_context를 통째로 담아 300건을 가져오면 응답이 약 2MB가 된다(41건만도 366KB).
// jsonb 하위 경로만 뽑으면 300건이 151KB로 줄어들므로(실측), 판정에 필요한 weight만 가져와
// 우승자를 고르고 본문 렌더링용 전체 데이터는 그 1건만 따로 조회한다.
export async function getHeroCandidates(limit = 300) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('slug, name, category, importance_score, weight:ai_context->weight')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .limit(limit)
  return data || []
}

// Hero로 선정된 Topic 1건을 화면 렌더링에 필요한 전체 형태로 가져온다.
// getActiveTopics와 같은 select를 쓰는 이유: 홈이 topic_stories(count)로 "보도 N건"을 표시하므로
// 형태가 다르면 그 숫자가 0으로 보인다.
export async function getTopicForHero(slug: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('id, slug, name, summary, status, lifecycle_stage, importance_score, popularity_score, updated_at, category, ai_context, topic_stories(count)')
    .eq('slug', slug)
    .limit(1)
  return data?.[0] ?? null
}


// Topic의 대표 실사 이미지 — 연결된 Story 중 relevance 상위 5개의 기사들에서
// og_image_url이 있는 가장 최근 것을 고른다(2026-07-10, CTR 우선 결정 §1).
// articles.og_image_url 컬럼이 아직 없거나(마이그레이션 전) 비어있으면 null → 카드가 기존 색상 스타일로 폴백.
export async function getTopicImage(topicId: string): Promise<string | null> {
  const supabase = client()
  try {
    const { data: links, error: linksErr } = await supabase
      .from('topic_stories')
      .select('story_id')
      .eq('topic_id', topicId)
      .order('relevance_score', { ascending: false })
      .limit(5)
    if (linksErr) throw linksErr
    const storyIds = (links || []).map((l: any) => l.story_id)
    if (storyIds.length === 0) return null

    const { data: articleLinks, error: artErr } = await supabase
      .from('story_articles')
      .select('articles(og_image_url, published_at)')
      .in('story_id', storyIds)
    if (artErr) throw artErr

    const images = (articleLinks || [])
      .map((r: any) => r.articles)
      .filter((a: any) => a?.og_image_url)
      .sort((a: any, b: any) => new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime())

    return images[0]?.og_image_url || null
  } catch {
    return null
  }
}

export async function getTopicBySlug(slug: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()
  return data
}

export async function getTopicsForStory(storyId: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_stories')
    .select('relevance_score, topics(id, slug, name, summary, lifecycle_stage, status)')
    .eq('story_id', storyId)
    .order('relevance_score', { ascending: false })
  return (data || [])
    .map((row: any) => ({ ...row.topics, relevance_score: row.relevance_score }))
    .filter((t: any) => t.id && t.status === 'active')
}

export async function getTopicStories(topicId: string, limit = 20) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_stories')
    .select('relevance_score, stories(id, title, silence_score, controversy_score, created_at, published_at)')
    .eq('topic_id', topicId)
    .order('relevance_score', { ascending: false })
    .limit(limit)
  return (data || [])
    .map((row: any) => ({ ...row.stories, relevance_score: row.relevance_score }))
    .filter((s: any) => s.id)
}

export async function getTopicEntities(topicId: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_entities')
    .select('relation_type, explanation, strength_score, entities(id, slug, name, type, status)')
    .eq('topic_id', topicId)
    .order('strength_score', { ascending: false })
  return (data || [])
    .map((row: any) => ({
      ...row.entities,
      relation_type: row.relation_type,
      explanation: row.explanation,
      strength_score: row.strength_score,
    }))
    .filter((e: any) => e.id && e.status === 'active')
}

export async function getTopicTimeline(topicId: string, limit = 30) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_timeline_events')
    .select('id, event_date, title, summary, importance_score, source_story_id')
    .eq('topic_id', topicId)
    .order('event_date', { ascending: true })
    .limit(limit)
  return data || []
}

export async function getTopicUpdates(topicId: string, limit = 10) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_updates')
    .select('id, update_type, title, summary, created_at, source_story_id')
    .eq('topic_id', topicId)
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

export async function getRecentTopicUpdates(limit = 10) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_updates')
    .select('id, update_type, title, summary, created_at, topic_id, topics(slug, name)')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// 홈 "오늘 움직이는 이슈" 카드용 — 이슈명/요약/근거 기사 수/관련 Entity를 한 번에
export async function getHomeTopicCards(limit = 9) {
  const supabase = client()
  const { data: topics } = await supabase
    .from('topics')
    .select('id, slug, name, summary, description, lifecycle_stage, category')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .limit(limit)

  if (!topics || !topics.length) return []

  return Promise.all(topics.map(async (t: any) => {
    const [{ count: storyCount }, { data: entityRows }] = await Promise.all([
      supabase.from('topic_stories').select('story_id', { count: 'exact', head: true }).eq('topic_id', t.id),
      supabase.from('topic_entities').select('strength_score, entities(name)').eq('topic_id', t.id).order('strength_score', { ascending: false }).limit(3),
    ])
    return {
      ...t,
      storyCount: storyCount || 0,
      entityNames: (entityRows || []).map((r: any) => r.entities?.name).filter(Boolean),
    }
  }))
}

// 홈 "뉴스저울이 보는 연결" — 현재 보유한 topic_entities 데이터로 만들 수 있는 만큼의 연결 체인
export async function getTopicChains(limit = 3) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('name, slug, topic_entities(strength_score, entities(name, slug))')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .limit(20)

  return (data || [])
    .map((t: any) => ({
      name: t.name,
      slug: t.slug,
      entities: (t.topic_entities || [])
        .sort((a: any, b: any) => (b.strength_score || 0) - (a.strength_score || 0))
        .map((te: any) => te.entities)
        .filter((e: any) => e?.name && e?.slug)
        .slice(0, 3),
    }))
    .filter((t: any) => t.entities.length >= 2)
    .slice(0, limit)
}

// 홈 "새롭게 떠오르는 Topic"
export async function getEmergingTopics(limit = 5) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('id, slug, name, summary, description, created_at')
    .eq('status', 'active')
    .eq('lifecycle_stage', 'emerging')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// 홈 "실시간 Timeline" — 모든 활성 Topic을 가로질러 최근 이벤트를 시간순으로
export async function getRecentTimelineEvents(limit = 10) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_timeline_events')
    .select('id, event_date, title, summary, topic_id, topics(slug, name, category)')
    .order('event_date', { ascending: false })
    .limit(limit)
  return (data || []).filter((e: any) => e.topics)
}

// "오늘 세상을 한 장으로" — 대표 체인 1개 + 오늘의 핵심 이슈 5개를 한 데이터로 묶는다 (재사용 가능한 콘텐츠 패키지)
export async function getTodayOneCard() {
  const [chains, topics] = await Promise.all([
    getEntityConnectionChains(1),
    getActiveTopics(5),
  ])
  return {
    chain: chains[0] || null,
    topics: topics.map((t: any) => ({ name: t.name, slug: t.slug })),
  }
}

// 홈 "오늘 가장 많이 연결되는 기업/인물/국가" TOP10 — entity_stories 집계, LLM 비용 없음
// "왜 많이 연결됐는지"는 이미 생성된 ai_analysis(있으면)나 가장 강하게 연결된 Topic 이름으로 대신한다 (추가 LLM 호출 없음)
export async function getTopEntitiesByType(type: string, limit = 10, sinceDays?: number) {
  const supabase = client()
  let query = supabase
    .from('entity_stories')
    .select('entity_id, created_at, entities(id, slug, name, type, status, ai_analysis)')
  if (sinceDays) {
    query = query.gte('created_at', new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString())
  }
  const { data } = await query
  const counts = new Map<string, { id: string; name: string; slug: string; ai_analysis: string | null; count: number }>()
  for (const row of (data || []) as any[]) {
    const e = row.entities
    if (!e || e.type !== type || e.status !== 'active') continue
    if (!counts.has(e.slug)) counts.set(e.slug, { id: e.id, name: e.name, slug: e.slug, ai_analysis: e.ai_analysis, count: 0 })
    counts.get(e.slug)!.count++
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit)

  return Promise.all(top.map(async (t) => {
    if (t.ai_analysis) return { ...t, reason: t.ai_analysis }
    const { data: topTopic } = await supabase
      .from('topic_entities')
      .select('topics(name)')
      .eq('entity_id', t.id)
      .order('strength_score', { ascending: false })
      .limit(1)
      .maybeSingle()
    const topicName = (topTopic as any)?.topics?.name
    return { ...t, reason: topicName ? `"${topicName}" 이슈와 가장 강하게 연결` : null }
  }))
}

// entity_relations 원시 엣지 — 체인 빌더가 재사용하는 공용 데이터
export async function getEntityRelationEdges(limit = 30) {
  const supabase = client()
  const { data } = await supabase
    .from('entity_relations')
    .select('strength_score, explanation, source:entities!entity_relations_source_entity_id_fkey(id,slug,name,type), target:entities!entity_relations_target_entity_id_fkey(id,slug,name,type)')
    .order('strength_score', { ascending: false })
    .limit(limit)
  return (data || []).filter((r: any) => r.source && r.target) as any[]
}

// 순수 함수 — 특정 entity에서 시작해 엣지 풀을 따라 최대 maxHops만큼 체인을 뻗는다 (DB 호출 없음)
export function buildChainFromEntity(startId: string, edges: any[], maxHops = 3) {
  const startEdgeIdx = edges.findIndex(e => e.source.id === startId || e.target.id === startId)
  if (startEdgeIdx === -1) return null
  const first = edges[startEdgeIdx]
  const nodes = first.source.id === startId ? [first.source, first.target] : [first.target, first.source]
  const used = new Set([startEdgeIdx])

  for (let hop = 0; hop < maxHops - 1; hop++) {
    const lastId = nodes[nodes.length - 1].id
    const nextIdx = edges.findIndex((other, j) =>
      !used.has(j) && (other.source.id === lastId || other.target.id === lastId)
    )
    if (nextIdx === -1) break
    const other = edges[nextIdx]
    const nextNode = other.source.id === lastId ? other.target : other.source
    if (nodes.some(n => n.id === nextNode.id)) break // 순환 방지
    nodes.push(nextNode)
    used.add(nextIdx)
  }
  return nodes.length >= 2 ? nodes : null
}

// 홈 "오늘 세상은 이렇게 움직였습니다" — entity_relations 기반 대표 체인 3~4개
export async function getEntityConnectionChains(limit = 3) {
  const edges = await getEntityRelationEdges(20)
  const chains: any[] = []
  const usedStarts = new Set<string>()

  for (const e of edges) {
    if (chains.length >= limit) break
    if (usedStarts.has(e.source.id)) continue
    const nodes = buildChainFromEntity(e.source.id, edges, 4)
    if (!nodes) continue
    usedStarts.add(e.source.id)
    chains.push({ nodes, explanation: e.explanation })
  }
  return chains
}

// "분야별 세상 보기" — topics.category 단일 레벨 집계 + 분야별 핵심 3개 미리보기 (LLM 비용 없음)
export async function getCategoryCounts(limit = 10) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('category, name, slug, importance_score')
    .eq('status', 'active')
    .not('category', 'is', null)
    .order('importance_score', { ascending: false })

  const groups = new Map<string, { name: string; slug: string }[]>()
  for (const row of (data || []) as any[]) {
    const c = (row.category || '').trim()
    if (!c) continue
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push({ name: row.name, slug: row.slug })
  }

  return [...groups.entries()]
    .map(([category, topics]) => ({ category, count: topics.length, preview: topics.slice(0, 3) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getTopicsByCategory(category: string, limit = 20) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    // ai_context는 카테고리 목록에서 단문(Brief) 배지 판별(isBriefTopic)에 필요하다 —
    // 다른 목록 쿼리(getActiveTopics)는 이미 포함하고 있어서 여기만 빠져 있었다.
    .select('id, slug, name, summary, description, lifecycle_stage, ai_context')
    .eq('status', 'active')
    .eq('category', category)
    .order('importance_score', { ascending: false })
    .limit(limit)
  return data || []
}

// "오늘 가장 의외의 연결" — 서로 다른 타입의 Entity를 잇는 가장 강한 관계 (실데이터만, 추측 없음)
export async function getMostUnusualConnection() {
  const edges = await getEntityRelationEdges(30)
  const cross = edges.find((e: any) => e.source.type !== e.target.type)
  return cross || null
}

// "오늘 가장 많은 분야에 영향을 준 이슈" — 연결된 Entity 타입 종류가 가장 많은 Topic (실데이터만)
export async function getMostCrossCategoryTopic() {
  const supabase = client()
  const { data: topics } = await supabase
    .from('topics')
    .select('id, slug, name')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .limit(15)
  if (!topics || !topics.length) return null

  const withSpread = await Promise.all(topics.map(async (t: any) => {
    const { data: rows } = await supabase
      .from('topic_entities')
      .select('entities(type)')
      .eq('topic_id', t.id)
    const types = [...new Set((rows || []).map((r: any) => r.entities?.type).filter(Boolean))]
    return { ...t, types }
  }))

  const best = withSpread.sort((a, b) => b.types.length - a.types.length)[0]
  return best && best.types.length >= 3 ? best : null
}

// "오늘의 발견: 겉보기엔 다르지만 실제로 연결된 두 사건" — 서로 다른 category의 Topic을 잇는 가장 강한 관계 (실데이터만)
//
// 2026-07-31: topic_relations는 refresh-relationships.js가 한 번 생성한 뒤 다시 건드리지 않는다
// (strength_score/created_at 고정). strength_score만으로 정렬하면 예전에 만점(100)을 찍은 관계가
// 영원히 1위를 유지해 "며칠째 같은 카드 고정" 문제가 생긴다(실사고: 트럼프 이란 장례식 발언 토픽).
// 최근 N일 내 생성된 관계를 우선하고, 그 기간에 교차 카테고리 관계가 없을 때만 전체 기간으로 폴백한다.
export async function getMostUnexpectedTopicPair() {
  const supabase = client()
  const selectCols = 'strength_score, explanation, created_at, source:topics!topic_relations_source_topic_id_fkey(id,slug,name,category), target:topics!topic_relations_target_topic_id_fkey(id,slug,name,category)'

  const findCross = (rows: any[]) => rows.find((r) =>
    r.source && r.target && r.source.category && r.target.category && r.source.category !== r.target.category
  )

  const since = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentData } = await supabase
    .from('topic_relations')
    .select(selectCols)
    .gte('created_at', since)
    .order('strength_score', { ascending: false })
    .limit(30)
  const recentCross = findCross((recentData || []) as any[])
  if (recentCross) return recentCross

  const { data } = await supabase
    .from('topic_relations')
    .select(selectCols)
    .order('strength_score', { ascending: false })
    .limit(30)
  return findCross((data || []) as any[]) || null
}

// 오른쪽 레일 "Trending / Interests" — 소비자 관심사 태그. 실데이터 매칭되면 링크, 아니면 조용한 placeholder.
const INTEREST_TAGS = [
  { label: 'AI Tools', icon: '🤖', keywords: ['AI', '인공지능', 'GPT'] },
  { label: 'Cars', icon: '🚗', keywords: ['자동차', '전기차', 'EV'] },
  { label: 'Smartphones', icon: '📱', keywords: ['스마트폰', '갤럭시', '아이폰'] },
  { label: 'Luxury', icon: '💎', keywords: ['명품', '럭셔리'] },
  { label: 'Health', icon: '🏥', keywords: ['건강', '질병', '백신'] },
  { label: 'Crypto', icon: '🪙', keywords: ['비트코인', '암호화폐', 'Crypto', '이더리움'] },
  { label: 'Games', icon: '🎮', keywords: ['게임'] },
  { label: 'Sports', icon: '⚽', keywords: ['스포츠', '올림픽', '월드컵'] },
  { label: 'Entertainment', icon: '🎬', keywords: ['영화', 'OTT', '드라마', '음악'] },
  { label: 'Brands', icon: '🏷️', keywords: ['브랜드'] },
]

// 홈 Cover Rotation "오늘의 발견" — 목업의 5개 카드 중 실데이터로 채울 수 있는 4개만 사용.
// "🔥 가장 많이 눌린 질문"(클릭수 집계 데이터 없음), "💬 스몰톡" 카드는 실데이터가 없어 뺐다 —
// 없는 지표를 지어내지 않는다는 원칙(콘텐츠 바이블)에 따라 그리드를 4카드로 재구성했다(§4카드가
// 정확히 2열×2행 그리드를 채워 5카드였을 때와 시각적으로 빈틈없이 맞음).
export async function getDiscoveryCards() {
  const [pair, [latestUpdate], recentPersons, recentCountries] = await Promise.all([
    getMostUnexpectedTopicPair(),
    getRecentTopicUpdates(1),
    getTopEntitiesByType('person', 1, 4),
    getTopEntitiesByType('country', 1, 4),
  ])
  // 최근 4일 내 언급 없으면(비인기 카테고리라 사실적으로 있을 수 있음) 전체 기간으로 폴백
  const [topPerson] = recentPersons.length ? recentPersons : await getTopEntitiesByType('person', 1)
  const [topCountry] = recentCountries.length ? recentCountries : await getTopEntitiesByType('country', 1)

  const cards: {
    kicker: string; title: string; href: string
    colSpan: number; rowSpan: number; accent: string
  }[] = []

  if (pair) {
    cards.push({
      kicker: '🧩 의외의 연결',
      title: `${pair.source.name}와 ${pair.target.name}, 무슨 상관이지?`,
      href: `/topic/${pair.source.slug}`,
      colSpan: 2, rowSpan: 2, accent: '#D9A441',
    })
  }
  if (latestUpdate) {
    const t = (latestUpdate as any).topics
    cards.push({
      kicker: '🕐 방금 업데이트',
      title: latestUpdate.title,
      href: t?.slug ? `/topic/${t.slug}` : '/',
      colSpan: 2, rowSpan: 1, accent: '#7CC2B8',
    })
  }
  if (topPerson) {
    cards.push({
      kicker: '👤 사람', title: topPerson.name, href: `/entity/${topPerson.slug}`,
      colSpan: 1, rowSpan: 1, accent: '#B98CFF',
    })
  }
  if (topCountry) {
    cards.push({
      kicker: '🌍 국가', title: topCountry.name, href: `/entity/${topCountry.slug}`,
      colSpan: 1, rowSpan: 1, accent: '#7C8CFF',
    })
  }
  return cards
}

export async function getInterestTags() {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('slug, name, category')
    .eq('status', 'active')
  const topics = (data || []) as any[]

  return INTEREST_TAGS.map(tag => {
    const match = topics.find(t =>
      tag.keywords.some(kw => t.name?.includes(kw) || t.category?.includes(kw))
    )
    return { ...tag, topic: match ? { slug: match.slug, name: match.name } : null }
  })
}
