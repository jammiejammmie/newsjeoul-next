import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getEntityBySlug(slug: string) {
  const supabase = client()
  const { data } = await supabase
    .from('entities')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'active')
    .single()
  return data
}

export async function getEntitiesForStory(storyId: string) {
  const supabase = client()
  const { data } = await supabase
    .from('entity_stories')
    .select('relevance_score, entities(id, slug, name, type, status)')
    .eq('story_id', storyId)
    .order('relevance_score', { ascending: false })
  return (data || [])
    .map((row: any) => ({ ...row.entities, relevance_score: row.relevance_score }))
    .filter((e: any) => e.id && e.status === 'active')
}

export async function getEntityStories(entityId: string, limit = 20) {
  const supabase = client()
  const { data } = await supabase
    .from('entity_stories')
    .select('relevance_score, stories(id, title, silence_score, controversy_score, created_at)')
    .eq('entity_id', entityId)
    .order('relevance_score', { ascending: false })
    .limit(limit)
  return (data || [])
    .map((row: any) => ({ ...row.stories, relevance_score: row.relevance_score }))
    .filter((s: any) => s.id)
}

export async function getEntityTopics(entityId: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_entities')
    .select('relation_type, explanation, strength_score, topics(id, slug, name, summary, lifecycle_stage, status)')
    .eq('entity_id', entityId)
    .order('strength_score', { ascending: false })
  return (data || [])
    .map((row: any) => ({
      ...row.topics,
      relation_type: row.relation_type,
      explanation: row.explanation,
      strength_score: row.strength_score,
    }))
    .filter((t: any) => t.id && t.status === 'active')
}

// Entity 페이지 "관련 Timeline" — 이 Entity가 연결된 Topic들의 Timeline 이벤트를 모아서
export async function getEntityTimeline(entityId: string, limit = 15) {
  const supabase = client()
  const { data: topicLinks } = await supabase
    .from('topic_entities')
    .select('topic_id')
    .eq('entity_id', entityId)
  const topicIds = (topicLinks || []).map((r: any) => r.topic_id)
  if (!topicIds.length) return []

  const { data } = await supabase
    .from('topic_timeline_events')
    .select('id, event_date, title, summary, topic_id, topics(slug, name)')
    .in('topic_id', topicIds)
    .order('event_date', { ascending: false })
    .limit(limit)
  return (data || []).filter((e: any) => e.topics)
}
