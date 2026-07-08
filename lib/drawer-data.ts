'use server'

import { createClient } from '@supabase/supabase-js'
import { getTopicBySlug, getTopicStories, getTopicEntities } from '@/lib/topics'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

const TYPE_LABEL: Record<string, string> = {
  company: '기업', person: '인물', organization: '기관', country: '국가',
  product: '제품', technology: '기술', market: '시장', policy: '정책',
}

// topic/[slug]/page.tsx의 관련 Topic 조회와 동일한 topic_relations 기반 로직
async function getRelatedTopics(topicId: string) {
  const supabase = client()
  const { data } = await supabase
    .from('topic_relations')
    .select('explanation, strength_score, source_topic_id, target_topic_id, source:topics!topic_relations_source_topic_id_fkey(id,slug,name,category), target:topics!topic_relations_target_topic_id_fkey(id,slug,name,category)')
    .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`)
    .order('strength_score', { ascending: false })
    .limit(6)
  return (data || [])
    .map((row: any) => {
      const other = row.source_topic_id === topicId ? row.target : row.source
      return other ? { ...other, explanation: row.explanation } : null
    })
    .filter(Boolean) as { id: string; slug: string; name: string; category: string | null; explanation: string | null }[]
}

export type TopicDrawerData = {
  slug: string
  domain: string | null
  title: string
  body: string
  tags: { category?: string; value: string }[]
  articles: { id: string; title: string }[]
  related: { slug: string; name: string; explanation: string | null }[]
}

// 홈 매거진 그리드 카드를 클릭했을 때 드로어에 채울 Topic 상세 — 클라이언트 컴포넌트에서 직접 호출
export async function getTopicDrawerData(slug: string): Promise<TopicDrawerData | null> {
  const topic = await getTopicBySlug(slug)
  if (!topic) return null

  const [stories, entities, related] = await Promise.all([
    getTopicStories(topic.id, 5),
    getTopicEntities(topic.id),
    getRelatedTopics(topic.id),
  ])

  return {
    slug: topic.slug,
    domain: topic.category,
    title: topic.name,
    body: topic.summary || topic.description || '',
    tags: entities.map((e: any) => ({ category: TYPE_LABEL[e.type], value: e.name })),
    articles: stories.map((s: any) => ({ id: s.id, title: s.title })),
    related: related.map((t) => ({ slug: t.slug, name: t.name, explanation: t.explanation })),
  }
}
