import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type NewsItem = {
  id: string
  title: string
  category: string
  conservative_outlet: string
  conservative_headline: string
  conservative_summary: string
  conservative_url: string | null
  liberal_outlet: string
  liberal_headline: string
  liberal_summary: string
  liberal_url: string | null
  bias_score: number
  created_at: string
}

export type PollItem = {
  id: string
  region: string
  election_type: string
  candidate_a: string
  candidate_a_party: string
  candidate_a_pct: number
  candidate_b: string
  candidate_b_party: string
  candidate_b_pct: number
  candidate_c: string | null
  candidate_c_party: string | null
  candidate_c_pct: number | null
  poll_company: string
  media_outlet: string
  survey_date: string
  created_at: string
}

export type YoutubeChannel = {
  id: string
  channel_id: string
  channel_name: string
  lean: 'conservative' | 'liberal'
  thumbnail_url: string | null
  subscriber_count: number | null
  latest_video_title: string | null
  latest_video_id: string | null
  latest_video_date: string | null
  latest_video_thumbnail: string | null
}
