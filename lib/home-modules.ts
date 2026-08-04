import { createClient } from '@supabase/supabase-js'

// 홈 2a 6개 모듈 데이터 접근 계층.
//
// 원칙: 값이 없으면 0이나 빈 배열을 돌려주고, 화면이 그 모듈을 숨긴다.
// 숫자를 만들어 채우지 않는다 — 시안과 똑같아 보이지만 전부 거짓이 되고, 그건 이 사이트가
// 지켜온 "근거 없는 수치를 만들지 않는다"는 원칙을 깨뜨린다.

// createClient는 URL/키가 없으면 동기적으로 throw한다. 반드시 각 함수의 try 안에서 호출한다 —
// try 밖에서 부르면 catch가 무의미해지고 홈 전체가 500난다.
function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── ① 색인 카운터 ───────────────────────────────────────────────────────────
export type IndexCounts = { published: number; active: number; todayPublished: number }

/** 실제 색인 대상 수. 시안의 "오늘 색인 12,481건" 자리에 들어가는 값이다. */
export async function getIndexCounts(): Promise<IndexCounts> {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00'
  try {
    const supabase = client()
    const [pub, act, today] = await Promise.all([
      supabase.from('topics').select('id', { count: 'exact', head: true })
        .eq('status', 'active').eq('editorial_status', 'published'),
      supabase.from('topics').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('topics').select('id', { count: 'exact', head: true })
        .eq('status', 'active').eq('editorial_status', 'published').gte('created_at', todayStart),
    ])
    return {
      published: pub.count ?? 0,
      active: act.count ?? 0,
      todayPublished: today.count ?? 0,
    }
  } catch {
    return { published: 0, active: 0, todayPublished: 0 }
  }
}

// ── ② 순위 변동 ─────────────────────────────────────────────────────────────
export type RankDelta = {
  slug: string
  name: string
  category: string | null
  score: number
  /** 무게 변화량(g). null이면 비교할 이전 값이 없다(신규). */
  delta: number | null
  /** 'up' | 'down' | 'flat' | 'new' */
  direction: 'up' | 'down' | 'flat' | 'new'
}

// weight_history에서 변화량을 읽는다. 이 배열은 update-topic-weight-background가
// 무게를 재계산할 때마다 {grams, computed_at, delta_from_prev}를 append한다.
//
// delta_from_prev를 그대로 쓰지 않고 마지막 두 항목의 grams 차이로 다시 계산하는 이유:
// delta_from_prev는 append 시점의 값이라 항목이 잘려나가면(이력 상한) 첫 항목의 delta가
// null로 남는다. grams 차이는 남아있는 이력만으로 항상 계산할 수 있다.
function deltaFromHistory(history: any[], currentScore: number): { delta: number | null; direction: RankDelta['direction'] } {
  const points = (history || [])
    .filter((h) => typeof h?.grams === 'number' && h?.computed_at)
    .sort((a, b) => String(a.computed_at).localeCompare(String(b.computed_at)))
  if (points.length < 2) return { delta: null, direction: 'new' }
  const prev = points[points.length - 2].grams
  const delta = currentScore - prev
  if (delta > 0) return { delta, direction: 'up' }
  if (delta < 0) return { delta, direction: 'down' }
  return { delta: 0, direction: 'flat' }
}

/** 시안의 급상승 스트립(▲6 ▼1 NEW)에 들어가는 실제 변화량. */
export async function getRankDeltas(limit = 10): Promise<RankDelta[]> {
  try {
    const supabase = client()
    const { data } = await supabase
      .from('topics')
      .select('slug, name, category, importance_score, history:ai_context->weight_history')
      .eq('status', 'active')
      .order('importance_score', { ascending: false })
      .limit(limit)
    return (data || []).map((t: any) => {
      const { delta, direction } = deltaFromHistory(t.history, t.importance_score ?? 0)
      return {
        slug: t.slug, name: t.name, category: t.category,
        score: t.importance_score ?? 0, delta, direction,
      }
    })
  } catch {
    return []
  }
}

// ── ③ 캘린더 ────────────────────────────────────────────────────────────────
export type UpcomingEvent = {
  id: string
  date: string
  title: string
  kind: string
  topicSlug: string | null
  topicName: string | null
  /** D-day. 오늘이면 0. */
  daysLeft: number
}

/**
 * 앞으로의 일정. upcoming_events에서 읽는다(오늘 이후만).
 * source_quote가 없는 행은 제외한다 — 근거 없는 일정은 표시하지 않는다는 규칙을
 * 저장 시점(추출 함수)과 표시 시점(여기) 양쪽에서 지킨다.
 */
export async function getUpcomingEvents(limit = 6): Promise<UpcomingEvent[]> {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const supabase = client()
    const { data } = await supabase
      .from('upcoming_events')
      .select('id, event_date, title, kind, source_quote, topics(slug, name)')
      .gte('event_date', today)
      .not('source_quote', 'is', null)
      .order('event_date', { ascending: true })
      .limit(limit)
    const todayMs = Date.parse(today + 'T00:00:00Z')
    return (data || []).map((e: any) => ({
      id: e.id,
      date: e.event_date,
      title: e.title,
      kind: e.kind,
      topicSlug: e.topics?.slug ?? null,
      topicName: e.topics?.name ?? null,
      daysLeft: Math.max(0, Math.round((Date.parse(e.event_date + 'T00:00:00Z') - todayMs) / 86400000)),
    }))
  } catch {
    return []
  }
}

// ── ⑤ 조회수 ───────────────────────────────────────────────────────────────
export type ReadRanked = { slug: string; name: string; category: string | null; views: number }

/**
 * 많이 본 이슈 24시간. topic_reads의 window_views를 쓴다.
 *
 * 배포 직후에는 0건이다 — 조회 기록이 이제부터 쌓이기 때문이다. 지어낸 숫자를 넣지 않고
 * 빈 배열을 돌려주면 화면이 그 모듈을 숨긴다. 트래픽이 들어오면 자동으로 채워진다.
 */
export async function getMostReadTopics(limit = 6): Promise<ReadRanked[]> {
  try {
    const supabase = client()
    const { data } = await supabase
      .from('topic_reads')
      .select('window_views, window_start, topics!inner(slug, name, category, status)')
      .gt('window_views', 0)
      .order('window_views', { ascending: false })
      .limit(limit * 2)
    const cutoff = Date.now() - 24 * 3600 * 1000
    return (data || [])
      // 창이 만료된 행은 아직 리셋되지 않았을 수 있다(다음 조회 때 리셋된다) — 표시에서 제외.
      .filter((r: any) => Date.parse(r.window_start) >= cutoff && r.topics?.status === 'active')
      .slice(0, limit)
      .map((r: any) => ({
        slug: r.topics.slug, name: r.topics.name,
        category: r.topics.category, views: Number(r.window_views) || 0,
      }))
  } catch {
    return []
  }
}
