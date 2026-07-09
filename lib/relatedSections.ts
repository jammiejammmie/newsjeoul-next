// @deprecated 구 "침묵지수/논쟁지수" 정체성 로직. app/story/[id]가 redirect 처리되며 어디서도 import되지 않음(2026-07-10 확인).
// v5 브랜드 전환 이후 폐기 대상 — 삭제는 별도 승인 후 진행.
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
