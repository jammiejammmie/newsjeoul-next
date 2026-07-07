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
