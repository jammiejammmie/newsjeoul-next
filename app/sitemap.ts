import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://newsjeoul.co.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,         changeFrequency: 'daily',  priority: 1.0 },
    { url: `${BASE_URL}/top10`,    changeFrequency: 'daily',  priority: 0.9 },
    { url: `${BASE_URL}/election`, changeFrequency: 'daily',  priority: 0.7 },
    { url: `${BASE_URL}/youtube`,  changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/media101`, changeFrequency: 'weekly', priority: 0.6 },
  ]

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { data } = await supabase
      .from('stories')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(500)

    const storyRoutes: MetadataRoute.Sitemap = (data || []).map((s: any) => ({
      url: `${BASE_URL}/story/${s.id}`,
      lastModified: s.created_at ? new Date(s.created_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    return [...staticRoutes, ...storyRoutes]
  } catch {
    return staticRoutes
  }
}
