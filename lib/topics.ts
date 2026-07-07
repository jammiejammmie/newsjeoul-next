import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getActiveTopics(limit = 10) {
  const supabase = client()
  const { data } = await supabase
    .from('topics')
    .select('id, slug, name, summary, status, lifecycle_stage, importance_score, popularity_score, updated_at')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .limit(limit)
  return data || []
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
    .select('id, slug, name, summary, description, lifecycle_stage')
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
