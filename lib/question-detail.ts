import { createClient } from '@supabase/supabase-js'
import { getTopicImage } from '@/lib/topics'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type QuestionDetailData = {
  story: { id: string; title: string; createdAt: string }
  articles: { id: string; title: string; url: string; publishedAt: string | null; outlet: string | null }[]
  topic: {
    id: string; slug: string; name: string; category: string | null
    summary: string | null; description: string | null
    importanceScore: number
    aiOutlook: string | null; aiCounterView: string | null; aiContext: any | null
    updatedAt: string | null
    imageUrl: string | null
  }
  connectedTopics: { id: string; slug: string; name: string; category: string | null }[]
  nextQuestions: { storyId: string; topicName: string; topicSlug: string; explanation: string | null }[]
  graphNodes: { storyId: string; name: string; category: string | null; strength: number }[]
}

const MIN_NEXT_QUESTIONS = 8
const MAX_NEXT_QUESTIONS = 12
const MAX_GRAPH_NODES = 7
const MAX_CONNECTED_TOPICS = 3

// Story → 대표 Story 1건(topic_stories relevance_score 최댓값)을 topicId별로 골라준다.
async function resolveRepresentativeStories(supabase: ReturnType<typeof client>, topicIds: string[]) {
  const map = new Map<string, string>()
  if (topicIds.length === 0) return map
  const { data } = await supabase
    .from('topic_stories')
    .select('topic_id, story_id, relevance_score')
    .in('topic_id', topicIds)
    .order('relevance_score', { ascending: false })
  for (const row of (data || []) as any[]) {
    if (!map.has(row.topic_id)) map.set(row.topic_id, row.story_id)
  }
  return map
}

// Question Detail 데이터 조립 (설계안 확정본 기준).
// - Story는 반드시 1개 이상의 활성 Topic과 연결돼야 하며, 없으면 null → 호출부에서 notFound()
// - 대표 Topic = topic_stories.relevance_score 1순위
// - 추가로 연결된 Topic은 최대 3개까지만 노출
// - "다음 질문"은 topic_relations 기반, 부족하면 오늘 중요도 높은 Topic으로 최소 8개까지 채운다
//   (단, Question Graph는 패딩 없이 실제 topic_relations만 사용 — 그래프가 곧 "진짜 연결"의 시각화이기 때문)
export async function getQuestionDetail(storyId: string): Promise<QuestionDetailData | null> {
  const supabase = client()

  const [{ data: story }, { data: topicLinks }] = await Promise.all([
    supabase
      .from('stories')
      .select('id, title, created_at, story_articles(articles(id,title,url,published_at,outlets(name)))')
      .eq('id', storyId)
      .single(),
    supabase
      .from('topic_stories')
      .select('topic_id, relevance_score')
      .eq('story_id', storyId)
      .order('relevance_score', { ascending: false }),
  ])

  if (!story || !topicLinks || topicLinks.length === 0) return null

  const topicIds = [...new Set(topicLinks.map((t: any) => t.topic_id))]
  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, slug, name, category, summary, description, importance_score, ai_outlook, ai_counter_view, ai_context, updated_at, status')
    .in('id', topicIds)
    .eq('status', 'active')

  const topicById = new Map((topicRows || []).map((t: any) => [t.id, t]))
  const orderedTopics = topicLinks.map((l: any) => topicById.get(l.topic_id)).filter(Boolean) as any[]
  if (orderedTopics.length === 0) return null

  const repTopic = orderedTopics[0]
  const connectedTopics = orderedTopics.slice(1, 1 + MAX_CONNECTED_TOPICS).map((t: any) => ({
    id: t.id, slug: t.slug, name: t.name, category: t.category,
  }))

  const articles = (story.story_articles || [])
    .map((sa: any) => sa.articles)
    .filter(Boolean)
    .map((a: any) => ({
      id: a.id, title: a.title, url: a.url,
      publishedAt: a.published_at, outlet: a.outlets?.name || null,
    }))
    .sort((a: any, b: any) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())

  const { data: relations } = await supabase
    .from('topic_relations')
    .select('strength_score, explanation, source_topic_id, target_topic_id, source:topics!topic_relations_source_topic_id_fkey(id,slug,name,category,status), target:topics!topic_relations_target_topic_id_fkey(id,slug,name,category,status)')
    .or(`source_topic_id.eq.${repTopic.id},target_topic_id.eq.${repTopic.id}`)
    .order('strength_score', { ascending: false })
    .limit(MAX_NEXT_QUESTIONS)

  const relatedTopics = ((relations || []) as any[])
    .map((r) => {
      const other = r.source_topic_id === repTopic.id ? r.target : r.source
      return other && other.status === 'active'
        ? { id: other.id, slug: other.slug, name: other.name, category: other.category, strength: r.strength_score as number, explanation: r.explanation as string | null }
        : null
    })
    .filter(Boolean) as { id: string; slug: string; name: string; category: string | null; strength: number; explanation: string | null }[]

  const repStoryByTopic = await resolveRepresentativeStories(supabase, relatedTopics.map((t) => t.id))

  const graphNodes = relatedTopics
    .filter((t) => repStoryByTopic.has(t.id))
    .slice(0, MAX_GRAPH_NODES)
    .map((t) => ({ storyId: repStoryByTopic.get(t.id)!, name: t.name, category: t.category, strength: t.strength }))

  let nextQuestions = relatedTopics
    .filter((t) => repStoryByTopic.has(t.id))
    .map((t) => ({ storyId: repStoryByTopic.get(t.id)!, topicName: t.name, topicSlug: t.slug, explanation: t.explanation }))

  if (nextQuestions.length < MIN_NEXT_QUESTIONS) {
    const usedTopicIds = new Set([repTopic.id, ...relatedTopics.map((t) => t.id)])
    const { data: fallbackTopics } = await supabase
      .from('topics')
      .select('id, slug, name')
      .eq('status', 'active')
      .order('importance_score', { ascending: false })
      .order('popularity_score', { ascending: false })
      .limit(MIN_NEXT_QUESTIONS + usedTopicIds.size)

    const candidates = (fallbackTopics || []).filter((t: any) => !usedTopicIds.has(t.id))
    const fbStoryByTopic = await resolveRepresentativeStories(supabase, candidates.map((t: any) => t.id))
    const padding = candidates
      .filter((t: any) => fbStoryByTopic.has(t.id))
      .slice(0, MIN_NEXT_QUESTIONS - nextQuestions.length)
      .map((t: any) => ({ storyId: fbStoryByTopic.get(t.id)!, topicName: t.name, topicSlug: t.slug, explanation: null }))

    nextQuestions = [...nextQuestions, ...padding]
  }
  nextQuestions = nextQuestions.slice(0, MAX_NEXT_QUESTIONS)

  const imageUrl = await getTopicImage(repTopic.id)

  return {
    story: { id: story.id, title: story.title, createdAt: story.created_at },
    articles,
    topic: {
      id: repTopic.id, slug: repTopic.slug, name: repTopic.name, category: repTopic.category,
      summary: repTopic.summary, description: repTopic.description,
      importanceScore: Math.round(repTopic.importance_score ?? 0),
      aiOutlook: repTopic.ai_outlook, aiCounterView: repTopic.ai_counter_view, aiContext: repTopic.ai_context,
      updatedAt: repTopic.updated_at,
      imageUrl,
    },
    connectedTopics,
    nextQuestions,
    graphNodes,
  }
}
