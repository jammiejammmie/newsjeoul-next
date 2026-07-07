import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getTodayInsights(limit = 5) {
  const supabase = client()
  const { data } = await supabase
    .from('daily_insights')
    .select('id, insight_text, topic_ids, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}

// Topic 페이지 "오늘의 발견" 교차 링크 — 이 Topic을 언급한 인사이트만
export async function getInsightsForTopic(topicId: string, limit = 2) {
  const supabase = client()
  const { data } = await supabase
    .from('daily_insights')
    .select('id, insight_text, created_at')
    .contains('topic_ids', [topicId])
    .order('created_at', { ascending: false })
    .limit(limit)
  return data || []
}
