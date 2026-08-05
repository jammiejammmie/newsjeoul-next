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
// 두 위치를 보는 이유: 전체 조회(getActiveTopics)는 ai_context 통째로 담아 ai_context.draft에
// 있고, 경량 조회(getHomeCandidates)는 promoted_from만 별칭으로 뽑아온다. 두 형태에서 판정이
// 갈리면 같은 토픽이 목록에선 Brief로, 인덱스에선 아닌 것으로 보인다.
export function isBriefTopic(topic: any): boolean {
  return Boolean(topic?.ai_context?.draft?.promoted_from ?? topic?.promoted)
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

// ── 홈 다양성(주제 클러스터 · 카테고리 · 회전) ────────────────────────────────
// PM 지시 2026-08-04: (1) 사이드 카드 2·3번째가 고정돼 있다 (2) 오늘의 무게 인덱스에
// 이란/트럼프 관련이 9개나 겹친다 (3) 오늘의 발견도 트럼프가 계속 나온다.
//
// 실측(상위 41건): [이란] 10건 / [브라질] 5건 / [폭염] 3건 / [정상회담] 2건 / [검찰] 2건.
// importance_score만으로 나열하면 같은 사안의 파편이 상단을 도배한다 — 점수는 기사·엔티티
// 누적으로 오르니 큰 사안일수록 여러 Topic으로 쪼개져 전부 높은 점수를 갖기 때문이다.
//
// ── 클러스터 판별 방식과 그 선택 이유 ──
// 처음엔 "토큰이 하나라도 겹치면 같은 클러스터"로 병합하는 그리디 방식을 썼는데, 실데이터에서
// 41건 중 26건이 한 덩어리가 됐다(협력→브라질→이란→사망→폭염으로 전이 연쇄). 누적 토큰에
// 계속 합치면 클러스터가 커질수록 무엇이든 흡수한다.
//
// 그래서 병합하지 않고, 각 Topic에 **키 하나**를 부여한다: 후보 집합 안에서 문서빈도(DF)가
// 가장 높은 자기 토큰. "트럼프 이란 공격 취소"는 이란(DF 10) > 트럼프(DF 5)이므로 키가 '이란'이다.
// 전이가 원리적으로 불가능하고, 결과가 결정론적이며, 왜 묶였는지 키만 보면 설명된다.
const CLUSTER_MIN_TOKEN_LEN = 2
// 역할어·사건어처럼 주제를 구분하지 못하는 일반 명사. 이걸 빼지 않으면 "인도네시아 대통령
// 한국 방문"과 "이재명 대통령 브라질 방문"이 '대통령/방문'으로 묶여 서로 다른 사안이 합쳐진다.
const CLUSTER_STOPWORDS = new Set(
  ('대통령 정부 장관 의원 총리 대사 국민 여당 야당 방문 순방 논의 발언 사건 사고 피해 상황 정세 ' +
   '우려 계획 협상 문제 관련 추진 확대 감소 증가 논란 위험 개편 개정 폐지 지속 기록 경신 대응 ' +
   '조사 회의 발표 공개 결정 검토 요구 촉구 비판 반발 전망 예고 가능성 여부 위한 대한 이후 최초 ' +
   '최대 사상 전국 올해 내년 오늘 어제 관측 분석 보도 소식 현황 이슈 협력 사망 공격 공습 전쟁 ' +
   // 아래는 실측으로 추가(2026-08-04): 연결어·범용어가 클러스터 키를 가로채는 것을 확인했다.
   // "폭염으로 인한 사망 사고 증가"가 '인한'을 키로 잡아 폭염 클러스터에서 빠졌고, "바둑 AI 대결"이
   // '대결'을 잡아 AI 클러스터에서 빠졌다. 그 결과 상한(2)을 넘겨 3건씩 노출됐다.
   '갈등 긴장 인한 따른 관한 대비 대결 이번 이날 당시 각각 모두 일부 등장 시작 종료 완료 예정 ' +
   '방안 대책 조치 방침 입장 의혹 혐의 관계 영향 효과 규모 수준 비용 가격 시장 산업 기업 정책').split(/\s+/)
)

function rawTokens(name: string): string[] {
  return [...new Set(
    (name || '')
      .split(/[^가-힣A-Za-z0-9]+/)
      .filter((w) => w.length >= CLUSTER_MIN_TOKEN_LEN && !CLUSTER_STOPWORDS.has(w))
  )]
}


// 목록을 주제 클러스터로 묶는다(진단·검증용). diversifyForIndex와 같은 판정(sharesTopic)을
// 쓰므로, 이 함수로 센 결과와 실제 노출 결과가 어긋나지 않는다 — 예전엔 검증이 다른 기준
// (문서빈도 기반 키)을 써서 "상한을 지켰는지"를 잘못 판정했다.
export function groupByTopicCluster<T extends { name?: string }>(list: T[]): { label: string; items: T[] }[] {
  const groups: { tokens: string[]; label: string; items: T[] }[] = []
  for (const item of list) {
    const tokens = rawTokens(item.name || '')
    const hit = groups.find((g) => sharesTopic(g.tokens, tokens))
    if (hit) hit.items.push(item)
    else groups.push({ tokens, label: tokens[0] || '(무토큰)', items: [item] })
  }
  return groups.map(({ label, items }) => ({ label, items }))
}

const INDEX_MAX_PER_CLUSTER = 2 // PM 지시 "같은 주제 클러스터는 1~2개로"
const INDEX_MAX_PER_CATEGORY = 5 // 한 분야가 목록을 도배하지 않게(Society가 전체의 절반이라 필요)
const INDEX_SIZE = 24 // 화면에 보여줄 행 수

// 두 토픽이 같은 주제인지 — 이름 토큰이 하나라도 겹치면 같다고 본다.
// 조사 때문에 "폭염"과 "폭염으로"가 갈리므로 접두사 관계도 같은 것으로 취급한다.
function sharesTopic(aTokens: string[], bTokens: string[]): boolean {
  return aTokens.some((a) => bTokens.some((b) => a === b || (a.length >= 2 && b.startsWith(a)) || (b.length >= 2 && a.startsWith(b))))
}

// 점수 순서를 유지하면서 클러스터·카테고리 상한을 적용해 골라낸다.
//
// 판정 기준을 "이미 고른 것들"로 한 이유(2026-08-04 재설계):
// 처음엔 후보 집합 전체의 문서빈도(DF)로 각 토픽에 클러스터 키를 부여했다. 그런데 실측에서
// '인한'·'대결'처럼 흔한 연결어가 '폭염'·'AI'보다 DF가 높아 키를 가로챘고, 그 결과 같은 주제가
// 다른 키를 받아 상한을 우회해 3건씩 노출됐다("폭염으로 인한 사망 사고 증가", "바둑 AI 대결").
// DF는 후보 집합(300건) 기준인데 사용자가 보는 건 24행이라, 애초에 기준이 어긋나 있었다.
//
// 그래서 이미 고른 항목과 직접 비교한다. 화면에 실제로 보이는 것들끼리만 비교하므로 기준이
// 사용자 시야와 일치하고, 누적 토큰으로 병합하지 않으니 예전의 전이 연쇄(41건 중 26건이 한
// 덩어리가 됐던 문제)도 생기지 않는다.
//
// 상한을 못 채워도 걸러낸 항목을 다시 채워 넣지 않는다.
// 처음엔 "목록이 짧아지는 것도 손실"이라고 보고 걸러진 것들을 뒤에 이어 붙였는데, 그러면
// 방금 상한으로 제외한 같은 주제가 그대로 되돌아와 상한이 무력화된다(테스트에서 이란 파편이
// 2건 제한인데 3건 노출되는 것을 확인했다). PM 지시가 "클러스터당 1~2개 제한"으로 명시적이므로
// 상한을 우선한다 — 후보 300건 기준으로는 24행이 상한을 지키면서 다 채워지는 것을 실측했다.
export function diversifyForIndex<T extends { name?: string; slug?: string; category?: string | null }>(
  list: T[],
  {
    maxPerCluster = INDEX_MAX_PER_CLUSTER,
    maxPerCategory = INDEX_MAX_PER_CATEGORY,
    size = INDEX_SIZE,
    // 이미 화면에 확정된 항목(Hero 등). 이걸 넘기지 않으면 Hero와 같은 주제·같은 분야가
    // 상한에 계산되지 않아, Hero 포함 3건이 같은 클러스터로 보일 수 있다.
    seed = [] as T[],
  } = {}
): T[] {
  const categoryCount = new Map<string, number>()
  const picked: { item: T; tokens: string[] }[] = []
  const clusters: { tokens: string[]; count: number }[] = []

  for (const s of seed) {
    const tokens = rawTokens(s.name || '')
    clusters.push({ tokens, count: 1 })
    const cat = s.category || '(없음)'
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1)
  }

  for (const item of list) {
    const tokens = rawTokens(item.name || '')
    const cat = item.category || '(없음)'

    const cluster = clusters.find((c) => sharesTopic(c.tokens, tokens))
    if ((cluster && cluster.count >= maxPerCluster) || (categoryCount.get(cat) || 0) >= maxPerCategory) {
      continue
    }
    if (cluster) {
      cluster.count++
      // 클러스터 토큰은 늘리지 않는다 — 늘리면 클러스터가 커질수록 무엇이든 흡수해 전이 연쇄가 된다.
    } else {
      clusters.push({ tokens, count: 1 })
    }
    categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1)
    picked.push({ item, tokens })
    if (picked.length >= size) break
  }

  return picked.map((p) => p.item)
}

const SIDE_CARD_COUNT = 2

// 사이드 카드(홈 2·3번째) 선정 — Hero와 같은 4시간 회전을 적용하고, Hero와 같은 클러스터·
// 같은 카테고리는 피한다. 예전엔 rest.slice(0, 2)로 점수 2·3등을 그대로 써서, Hero가 바뀌어도
// 이 두 칸은 계속 같은 토픽이었다(PM 지시 (1)의 원인).
export function pickSideTopics<T extends { name?: string; slug?: string; category?: string | null }>(
  candidates: T[],
  hero: T | null,
  now: number = Date.now()
): T[] {
  const heroTokens = hero ? rawTokens(hero.name || '') : []
  const heroCat = hero?.category
  const heroSlug = (hero as any)?.slug

  // Hero와 다른 주제·다른 분야만 후보로 남기고, 후보들끼리도 주제·분야가 겹치지 않게 한다.
  const takenTokens: string[][] = []
  const seenCategory = new Set<string>()
  const pool: T[] = []
  for (const item of candidates) {
    if ((item as any).slug === heroSlug) continue
    const tokens = rawTokens(item.name || '')
    if (heroTokens.length && sharesTopic(heroTokens, tokens)) continue
    const cat = item.category || '(없음)'
    if (cat === heroCat || seenCategory.has(cat)) continue
    if (takenTokens.some((t) => sharesTopic(t, tokens))) continue
    takenTokens.push(tokens)
    seenCategory.add(cat)
    pool.push(item)
  }
  // 조건이 너무 엄격해 후보가 부족하면(분야 수가 적은 시기) 카테고리 제약만 풀어 채운다.
  if (pool.length < SIDE_CARD_COUNT) {
    for (const item of candidates) {
      if (pool.length >= SIDE_CARD_COUNT * 3) break
      if ((item as any).slug === heroSlug) continue
      const tokens = rawTokens(item.name || '')
      if (heroTokens.length && sharesTopic(heroTokens, tokens)) continue
      if (pool.some((p) => (p as any).slug === (item as any).slug)) continue
      pool.push(item)
    }
  }
  if (!pool.length) return []

  // Hero와 같은 4시간 버킷을 쓰되 오프셋을 줘서, Hero가 교체될 때 사이드도 함께 바뀐다.
  const bucket = Math.floor(now / (HERO_ROTATION_HOURS * 3600000))
  const out: T[] = []
  for (let i = 0; i < Math.min(SIDE_CARD_COUNT, pool.length); i++) {
    out.push(pool[(bucket + i) % pool.length])
  }
  return out
}

export const HOME_DIVERSITY_TUNING = {
  INDEX_MAX_PER_CLUSTER, INDEX_MAX_PER_CATEGORY, INDEX_SIZE, SIDE_CARD_COUNT,
}

// 홈 후보 조회(경량) — Hero 선정 · 사이드 카드 선정 · 오늘의 무게 인덱스가 모두 이걸 쓴다.
//
// 왜 넓게(300건) 그리고 왜 경량인가:
//  · Hero 신선도 요건을 통과하는 Topic이 상위권에 드물다(실측 2026-08-04 — 자격자 61건 중
//    상위 41건 안에 1건뿐). 점수는 기사·엔티티 누적으로 오르니 오래 다뤄진 이슈가 높은 점수를
//    유지하고, 정작 최근 기사가 붙은 Topic은 점수가 낮다.
//  · 인덱스 다양성(클러스터당 2건·카테고리당 5건)을 적용하면 후보가 크게 줄어든다. 41건에
//    적용하니 11건만 남았다 — 목록이 눈에 띄게 짧아진다. 넓은 풀에서 골라야 한다.
//  · 그런데 ai_context를 통째로 담아 300건을 가져오면 응답이 약 2MB다(41건만도 366KB).
//    jsonb 하위 경로만 뽑으면 300건이 약 190KB다(실측). 그래서 판정·표시에 필요한 최소 필드만
//    가져오고, 본문 렌더링이 필요한 Hero·사이드 카드만 따로 전체 조회한다.
//
// promoted: 인덱스 행의 Brief 배지 판별용(isBriefTopic). weight: Hero 신선도 판정과 "N g" 표시용.
// 활성 Topic 실제 개수 — 홈 상단 "오늘 N개의 세계가 열려 있습니다"에 쓴다.
// 예전엔 getActiveTopics(41).length를 그대로 썼는데, 그건 조회 상한이라 active가 642건인
// 지금도 화면엔 41로 고정돼 있었다(실제 수치가 아니라 limit을 보여주던 셈). count로 바꾼다.
export async function getActiveTopicCount() {
  const supabase = client()
  const { count } = await supabase
    .from('topics')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  return count ?? 0
}

export async function getHomeCandidates(limit = 300) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('slug, name, category, importance_score, weight:ai_context->weight, promoted:ai_context->draft->promoted_from')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .limit(limit)
  return data || []
}

// Hero·사이드 카드로 선정된 Topic들을 화면 렌더링에 필요한 전체 형태로 가져온다(한 번의 쿼리).
// getActiveTopics와 같은 select를 쓰는 이유: 홈이 topic_stories(count)로 "보도 N건"을 표시하므로
// 형태가 다르면 그 숫자가 0으로 보인다. 반환 순서는 넘긴 slug 순서를 그대로 유지한다
// (Hero/사이드 순서가 뒤바뀌면 화면 배치가 어긋난다).
export async function getTopicsBySlugs(slugs: string[]) {
  if (!slugs.length) return []
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('id, slug, name, summary, status, lifecycle_stage, importance_score, popularity_score, updated_at, category, ai_context, topic_stories(count)')
    .in('slug', slugs)
  const bySlug = new Map((data || []).map((t: any) => [t.slug, t]))
  return slugs.map((s) => bySlug.get(s)).filter(Boolean) as any[]
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
// 서로 다른 분야를 잇는 관계쌍을 여러 개 돌려준다(예전엔 1개만 반환해서, 오늘의 발견의
// "의외의 연결" 카드가 항상 같은 쌍이었다 — 회전할 재료 자체가 없었다).
// 같은 소스 토픽이 여러 쌍에 걸치면 첫 것만 남긴다: 같은 토픽이 회전 후보를 다 차지하면
// 회전을 넣어도 화면은 그대로이기 때문이다(트럼프 반복의 직접 원인 중 하나).
export async function getUnexpectedTopicPairs(limit = 4) {
  const supabase = client()
  const selectCols = 'strength_score, explanation, created_at, source:topics!topic_relations_source_topic_id_fkey(id,slug,name,category), target:topics!topic_relations_target_topic_id_fkey(id,slug,name,category)'

  const crossPairs = (rows: any[]) => {
    const seenSource = new Set<string>()
    const out: any[] = []
    for (const r of rows) {
      if (!r.source?.category || !r.target?.category) continue
      if (r.source.category === r.target.category) continue
      if (seenSource.has(r.source.slug)) continue
      seenSource.add(r.source.slug)
      out.push(r)
      if (out.length >= limit) break
    }
    return out
  }

  const since = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentData } = await supabase
    .from('topic_relations')
    .select(selectCols)
    .gte('created_at', since)
    .order('strength_score', { ascending: false })
    .limit(60)
  const recent = crossPairs((recentData || []) as any[])
  if (recent.length) return recent

  const { data } = await supabase
    .from('topic_relations')
    .select(selectCols)
    .order('strength_score', { ascending: false })
    .limit(60)
  return crossPairs((data || []) as any[])
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
// PM 지시 2026-08-04(3): "오늘의 발견에 트럼프가 계속 나온다. 최근 4일 우선 + 다양성 로직이
// 제대로 동작하는지 확인하고 고쳐라."
//
// 확인 결과 — 최근 4일 필터는 원래도 동작하고 있었다. 문제는 다양성 쪽이었고 원인이 두 개였다:
//  1) 상위 N건을 가져온 뒤 **항상 [0]번만** 썼다. 4일 내 최다 언급 인물은 계속 트럼프이므로
//     필터가 정상이어도 카드는 매번 같았다.
//  2) Hero·사이드 카드에 이미 나온 토픽/인물과 겹치는지 보지 않았다. 같은 화면에서 트럼프가
//     두세 번 반복될 수 있었다.
//
// 그래서 (a) 상위 4건 안에서 Hero와 같은 4시간 버킷으로 회전시키고, (b) 화면에 이미 쓰인
// slug를 넘겨받아 제외한다. 회전은 점수를 버리는 게 아니라 "상위권 안에서 번갈아 보여주는" 것이다.
const DISCOVERY_ROTATION_POOL = 4

function rotatePick<T>(list: T[], now: number, offset = 0): T | null {
  if (!list.length) return null
  const bucket = Math.floor(now / (HERO_ROTATION_HOURS * 3600000))
  return list[(bucket + offset) % list.length]
}

export async function getDiscoveryCards(
  { excludeTopicSlugs = [], now = Date.now() }: { excludeTopicSlugs?: string[]; now?: number } = {}
) {
  const exclude = new Set(excludeTopicSlugs)
  const [pairs, updates, recentPersons, recentCountries] = await Promise.all([
    getUnexpectedTopicPairs(DISCOVERY_ROTATION_POOL),
    getRecentTopicUpdates(DISCOVERY_ROTATION_POOL * 2),
    getTopEntitiesByType('person', DISCOVERY_ROTATION_POOL, 4),
    getTopEntitiesByType('country', DISCOVERY_ROTATION_POOL, 4),
  ])
  // 최근 4일 내 언급 없으면(비인기 카테고리라 사실적으로 있을 수 있음) 전체 기간으로 폴백
  const persons = recentPersons.length ? recentPersons : await getTopEntitiesByType('person', DISCOVERY_ROTATION_POOL)
  const countries = recentCountries.length ? recentCountries : await getTopEntitiesByType('country', DISCOVERY_ROTATION_POOL)

  // 이미 화면에 있는 토픽은 뺀다. 전부 빠지면(작은 데이터셋) 원본으로 되돌려 카드가 사라지지 않게 한다.
  const keepOrFallback = <T,>(filtered: T[], original: T[]) => (filtered.length ? filtered : original)
  const pair = rotatePick(
    keepOrFallback(pairs.filter((p: any) => !exclude.has(p.source?.slug) && !exclude.has(p.target?.slug)), pairs),
    now
  )
  const latestUpdate = rotatePick(
    keepOrFallback(updates.filter((u: any) => !exclude.has(u.topics?.slug)), updates),
    now, 1
  )
  const topPerson = rotatePick(persons, now, 2)
  const topCountry = rotatePick(countries, now, 3)

  const cards: {
    kicker: string; title: string; href: string
    colSpan: number; rowSpan: number; accent: string
  }[] = []

  if (pair) {
    cards.push({
      kicker: '🧩 의외의 연결',
      title: `${pair.source.name}와 ${pair.target.name}, 무슨 상관이지?`,
      href: `/topic/${pair.source.slug}`,
      colSpan: 2, rowSpan: 2, accent: '#C8102E',
    })
  }
  if (latestUpdate) {
    const t = (latestUpdate as any).topics
    cards.push({
      kicker: '🕐 방금 업데이트',
      title: latestUpdate.title,
      href: t?.slug ? `/topic/${t.slug}` : '/',
      colSpan: 2, rowSpan: 1, accent: '#2E8B7F',
    })
  }
  if (topPerson) {
    cards.push({
      kicker: '👤 사람', title: topPerson.name, href: `/entity/${topPerson.slug}`,
      colSpan: 1, rowSpan: 1, accent: '#7A4FD6',
    })
  }
  if (topCountry) {
    cards.push({
      kicker: '🌍 국가', title: topCountry.name, href: `/entity/${topCountry.slug}`,
      colSpan: 1, rowSpan: 1, accent: '#3F5BD9',
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

// ── 읽을 거리 · 기획과 해설 ───────────────────────────────────────────────────
//
// PM 지적(2026-08-05): 노차장 시안의 이 칸은 "기획 · 3부작 / 노트북 값은 왜 오르나 —
// 메모리 슈퍼사이클 해부 / 2026년 하반기 구매 타이밍까지"처럼 **형식 라벨 + 후킹 제목 +
// 얻는 것**의 3층 구조다. 우리 것은 getDiscoveryCards가 만든 자동 조합이라
// "트럼프 이란 장례식 발언 논란와 트럼프 이란 공격 취소, 무슨 상관이지?" 같은 문장이 나왔다.
// 조사가 깨지고("논란와"), 클릭해서 무엇을 얻는지도 없다. 시안이 클릭률이 높을 게 분명하다.
//
// 그래서 자동 조합을 버리고 실제 편집 결과물을 쓴다. 발행된 Topic에는 이미 다음이 있다:
//   draft.lead              — 첫 문장이 강하다("88만 배럴.", "규모 7.1.", "국제유가 8% 뛰었다")
//   draft.blocks            — 관점 수(PerspectiveExplorer가 탭으로 렌더한다)
//   draft.display_keywords  — 이 기사에서 다루는 것들
//   plan.event_type         — 형식 라벨의 근거
// 없는 것을 만들지 않고, 있는 것을 시안의 3층 구조에 맞게 배치한다.

// 읽을 거리 선정 파라미터.
// 값의 근거(2026-08-05 실측): 발행 토픽 중 블록 5개 이상이 130건인데 importance_score
// 상위 40건 창에는 23건만 들어왔다. 창을 넓히고 깊이순으로 뽑아야 공들인 글이 노출된다.
const FEATURE_POOL_SIZE = 120     // 후보 풀(넓게 받아 깊이순으로 다시 정렬한다)
const FEATURE_MIN_BLOCKS = 4      // 이보다 얇으면 '기획·해설'로 내보내지 않는다
const FEATURE_MAX_AGE_DAYS = 14   // 2주 넘은 글은 기획이라도 홈 이 칸에 두지 않는다
const FEATURE_ROTATION_HOURS = 3  // 회전 주기. 후보가 많아 버킷마다 다른 조합이 나온다

/** event_type → 형식 라벨. 시안의 기획/해설/데이터 세 갈래를 실제 사건유형에 매핑한다. */
const FEATURE_KICKER: Record<string, string> = {
  '규제·정책': '해설',
  '실적·시장변화': '데이터',
  'M&A·투자': '데이터',
  '재난·긴급상황': '현장 해설',
  '보안사고·장애': '해설',
  '분쟁·외교·전쟁': '기획',
  '선언·전망·논쟁': '기획',
  '인물교체·조직변화': '해설',
  '신제품·모델출시': '리뷰',
  '오픈소스·기술공개': '해설',
}

export type FeatureRead = {
  slug: string
  name: string
  category: string | null
  /** 형식 라벨 + 관점 수. 예: '기획 · 4개 관점' */
  kicker: string
  /** 후킹 문장 — draft.lead의 첫 문장. */
  hook: string
  /** 클릭하면 얻는 것 — display_keywords. */
  payoff: string[]
}

/** lead에서 첫 문장만 뽑는다. 카드에 문단째로 넣으면 읽히지 않는다. */
function firstSentence(text: string, max = 92): string {
  const t = String(text || '').trim()
  if (!t) return ''
  // 종결부호 뒤에서 자른다. 숫자 뒤 마침표('7.1')에 걸리지 않게 뒤에 공백·따옴표가 오는 경우만.
  const m = t.match(/^[\s\S]{10,}?[.!?](?=\s|$|["'"'])/)
  const first = (m ? m[0] : t).trim()
  if (first.length <= max) return first
  const cut = first.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…'
}

/**
 * 읽을 거리 카드. 발행된 Topic 중 본문이 실제로 있는 것만 고른다 —
 * lead나 블록이 없으면 카드의 3층 구조를 채울 수 없으므로 아예 내보내지 않는다.
 */
export async function getFeatureReads(
  { excludeTopicSlugs = [], limit = 3, now = Date.now() }:
  { excludeTopicSlugs?: string[]; limit?: number; now?: number } = {}
): Promise<FeatureRead[]> {
  const exclude = new Set(excludeTopicSlugs)
  try {
    // ★ importance_score 상위 40건에서 고르면 안 된다(2026-08-05 실측으로 확인).
    //   신선도 감쇠 도입 후 importance_score는 "지금 뉴스로서 얼마나 무거운가"에 가까워졌다.
    //   그 순서로 40건만 보면 블록 5개짜리 기획 130건 중 23건만 후보가 되고 107건은
    //   영원히 이 칸에 못 나온다. 기획·해설은 '최신 뉴스'가 아니라 '공들인 글'을 보여주는 칸이다.
    //
    //   그래서 (1) 최근 생성된 발행 글을 넓게 받고 (2) 본문 깊이(블록 수)로 순위를 매기고
    //   (3) 시간 버킷으로 회전시킨다. 회전이 없으면 점수가 바뀔 때까지 같은 3장이 고정된다.
    //   created_at을 쓰는 이유: updated_at은 무게 재계산마다 갱신돼 편집 신선도를 나타내지 못한다.
    const since = new Date(now - FEATURE_MAX_AGE_DAYS * 86400000).toISOString()
    const { data, error } = await client()
      .from('topics')
      .select('slug, name, category, importance_score, created_at, draft:ai_context->draft, plan:ai_context->plan')
      .eq('status', 'active')
      .eq('editorial_status', 'published')
      .gte('created_at', since)
      .order('importance_score', { ascending: false })
      .limit(FEATURE_POOL_SIZE)
    if (error || !data) return []

    // 본문이 깊은 순 → 같으면 무게순. 정렬을 DB에서 못 하는 이유는 블록 수가 jsonb 배열 길이라서다.
    const ranked = (data as any[])
      .filter((t) => Array.isArray(t.draft?.blocks) && t.draft.blocks.length >= FEATURE_MIN_BLOCKS)
      .sort((a, b) =>
        (b.draft.blocks.length - a.draft.blocks.length) ||
        ((b.importance_score ?? 0) - (a.importance_score ?? 0))
      )

    // 시간 버킷 회전 — Hero와 같은 방식. 후보가 많으므로 매 버킷마다 다른 조합이 나온다.
    const bucket = Math.floor(now / (FEATURE_ROTATION_HOURS * 3600000))
    const rotated = ranked.length
      ? ranked.map((_, i) => ranked[(bucket + i) % ranked.length])
      : []

    const out: FeatureRead[] = []
    const seenCategory = new Map<string, number>()
    for (const t of rotated) {
      if (exclude.has(t.slug)) continue
      const d = t.draft || {}
      const hook = firstSentence(d.lead || '')
      const blocks = Array.isArray(d.blocks) ? d.blocks.length : 0
      // 3층 중 하나라도 못 채우면 넣지 않는다. 빈 칸이 있는 카드는 시안처럼 보이지 않는다.
      if (!hook || blocks < 2) continue
      // 한 분야가 3칸을 다 먹지 않게 한다(홈 다양성 규칙과 같은 취지).
      const cat = t.category || '기타'
      if ((seenCategory.get(cat) ?? 0) >= 1) continue
      seenCategory.set(cat, (seenCategory.get(cat) ?? 0) + 1)

      const label = FEATURE_KICKER[t.plan?.event_type] || '해설'
      out.push({
        slug: t.slug,
        name: t.name,
        category: t.category ?? null,
        kicker: `${label} · ${blocks}개 관점`,
        hook,
        payoff: (Array.isArray(d.display_keywords) ? d.display_keywords : []).slice(0, 3),
      })
      if (out.length >= limit) break
    }
    return out
  } catch {
    return []
  }
}
