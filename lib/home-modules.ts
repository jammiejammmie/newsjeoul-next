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

/**
 * KST(UTC+9) 기준 오늘 날짜 'YYYY-MM-DD'.
 *
 * ★ 2026-08-06 추가. 이 파일이 쓰던 `new Date().toISOString().slice(0,10)`은 **UTC 날짜**라
 *   한국 사용자 기준으로 매일 09:00 KST에 "오늘"이 바뀌었다. 00:00~09:00 KST에 발행된 글은
 *   전날로 집계되고, 오전 9시에 카운터가 리셋되는 것처럼 보였다.
 *   서버가 어느 타임존에서 돌든 같은 값이 나와야 하므로 오프셋을 직접 더한다.
 */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 실제 색인 대상 수. 시안의 "오늘 색인 12,481건" 자리에 들어가는 값이다. */
export async function getIndexCounts(): Promise<IndexCounts> {
  // 오프셋(+09:00)을 명시한다 — 오프셋 없는 문자열은 DB 세션 타임존에 따라 해석이 갈린다.
  const todayStart = `${kstToday()}T00:00:00+09:00`
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

/** 제목 비교용 토큰. 조사·기호를 떼고 2자 이상만 남긴다. */
function titleTokens(title: string): Set<string> {
  return new Set(
    String(title || '')
      .replace(/[()[\]{}"'`~!?.,:;·/\\-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/[은는이가을를의에서와과로도만]$/, ''))
      .filter((w) => w.length >= 2)
  )
}

/**
 * 같은 사건인가? 토큰 자카드 유사도로 판정한다.
 *
 * ★ 왜 필요한가(2026-08-06 실측): 홈 캘린더 6칸 중 3칸이 같은 사건이었다 —
 *   "08.12 수도권 신규 주택 5만 호 공급안 발표" / "08.12 수도권 신규 5만 호 공급안 발표" /
 *   "08.13 수도권 신규 주택 5만 호 공급안 발표".
 *   DB의 unique 제약이 (topic_id, event_date, title)이라, 다른 Topic에서 뽑히거나 모델이
 *   제목을 한 단어 다르게 쓰거나 날짜가 하루 어긋나면 전부 별개 행으로 통과한다.
 *   완전 일치 제약으로는 막을 수 없는 종류의 중복이므로 의미 기준으로 접는다.
 */
export function isSameEvent(a: string, b: string, threshold = 0.7): boolean {
  const ta = titleTokens(a), tb = titleTokens(b)
  if (!ta.size || !tb.size) return false
  let shared = 0
  for (const w of ta) if (tb.has(w)) shared++
  return shared / (ta.size + tb.size - shared) >= threshold
}

/** 유사 제목이 ±10일 안에 겹치면 하나로 접는다. 가장 이른 날짜(=먼저 닥치는 일정)를 남긴다. */
export function dedupeEvents<T extends { date: string; title: string }>(events: T[]): T[] {
  const kept: T[] = []
  for (const e of events) {
    const dup = kept.find(
      (k) =>
        Math.abs(Date.parse(k.date + 'T00:00:00Z') - Date.parse(e.date + 'T00:00:00Z')) <= 10 * 86400000 &&
        isSameEvent(k.title, e.title)
    )
    if (!dup) kept.push(e)
  }
  return kept
}

/**
 * 앞으로의 일정. upcoming_events에서 읽는다(오늘 이후만).
 * source_quote가 없는 행은 제외한다 — 근거 없는 일정은 표시하지 않는다는 규칙을
 * 저장 시점(추출 함수)과 표시 시점(여기) 양쪽에서 지킨다.
 *
 * 중복 접기는 표시 시점에서도 한 번 더 한다 — 저장 시점만 고치면 **이미 쌓인** 중복 행은
 * 계속 화면에 남는다. 읽는 쪽에서 접어야 배포 즉시 화면이 정상이 된다.
 */
export async function getUpcomingEvents(limit = 6): Promise<UpcomingEvent[]> {
  const today = kstToday()
  try {
    const supabase = client()
    const { data } = await supabase
      .from('upcoming_events')
      .select('id, event_date, title, kind, source_quote, topics(slug, name)')
      .gte('event_date', today)
      .not('source_quote', 'is', null)
      .order('event_date', { ascending: true })
      // 중복을 접으면 건수가 줄므로 넉넉히 받아 온 뒤 자른다.
      .limit(limit * 5)
    const todayMs = Date.parse(today + 'T00:00:00Z')
    const mapped = (data || []).map((e: any) => ({
      id: e.id,
      date: e.event_date,
      title: e.title,
      kind: e.kind,
      topicSlug: e.topics?.slug ?? null,
      topicName: e.topics?.name ?? null,
      daysLeft: Math.max(0, Math.round((Date.parse(e.event_date + 'T00:00:00Z') - todayMs) / 86400000)),
    }))
    return dedupeEvents(mapped).slice(0, limit)
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
