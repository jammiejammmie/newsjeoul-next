import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const revalidate = 1800  // 30분마다 재생성 (pipeline이 3시간 주기이므로 충분)

const BASE_URL = 'https://newsjeoul.co.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,         changeFrequency: 'daily',  priority: 1.0 },
    { url: `${BASE_URL}/topic`,    changeFrequency: 'daily',  priority: 0.9 },
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
    const [{ data: stories }, { data: topics }, { data: entities }] = await Promise.all([
      supabase.from('stories').select('id, created_at').order('created_at', { ascending: false }).limit(500),
      supabase.from('topics').select('slug, category, updated_at').eq('status', 'active').order('updated_at', { ascending: false }).limit(1000),
      supabase.from('entities').select('slug, updated_at').eq('status', 'active').order('updated_at', { ascending: false }).limit(1000),
    ])

    const categoryRoutes: MetadataRoute.Sitemap = [...new Set((topics || []).map((t: any) => t.category).filter(Boolean))]
      .map((c: any) => ({
        url: `${BASE_URL}/category/${encodeURIComponent(c)}`,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }))

    const storyRoutes: MetadataRoute.Sitemap = (stories || []).map((s: any) => ({
      url: `${BASE_URL}/story/${s.id}`,
      lastModified: s.created_at ? new Date(s.created_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    const topicRoutes: MetadataRoute.Sitemap = (topics || []).map((t: any) => ({
      url: `${BASE_URL}/topic/${t.slug}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    }))

    const entityRoutes: MetadataRoute.Sitemap = (entities || []).map((e: any) => ({
      url: `${BASE_URL}/entity/${e.slug}`,
      lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    return [...staticRoutes, ...topicRoutes, ...categoryRoutes, ...entityRoutes, ...storyRoutes]
  } catch {
    return staticRoutes
  }
}
