import { createClient } from '@supabase/supabase-js'

export async function getRelatedSections(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const recentCutoff = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString()

  const [silenceRes, controversyRes] = await Promise.all([
    // silence TOP10 (first 5 used for "놓쳤을 수 있는 뉴스", all 10 for ranked list)
    supabase
      .from('stories')
      .select(
        'id, title, silence_score, created_at, story_articles(article_id)'
      )
      .neq('id', id)
      .gte('created_at', recentCutoff)
      .order('silence_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),

    // controversy TOP5 for "같은 사건, 다른 헤드라인"
    supabase
      .from('stories')
      .select(
        'id, title, controversy_score, created_at, story_articles(article_id)'
      )
      .neq('id', id)
      .gte('created_at', recentCutoff)
      .order('controversy_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const silence = silenceRes.data || []

  return {
    silenceTop5: silence.slice(0, 5),
    controversyTop5: controversyRes.data || [],
    silenceTop10: silence,
  }
}
