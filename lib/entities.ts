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
