import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { ROUTABLE_CONTENT_TYPES } from '@/lib/content-types'

export const revalidate = 1800  // 30분마다 재생성 (pipeline이 3시간 주기이므로 충분)

const BASE_URL = 'https://newsjeoul.co.kr'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // /top10, /youtube, /media101, /story/* — 구브랜드(침묵지수·보수/진보 비교) 라우트.
  // 홈으로 redirect 처리됐으므로 sitemap에서 제외한다 (브랜드 Audit P1/P3).
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`,         changeFrequency: 'daily',  priority: 1.0 },
    { url: `${BASE_URL}/topic`,    changeFrequency: 'daily',  priority: 0.9 },
    { url: `${BASE_URL}/election`, changeFrequency: 'daily',  priority: 0.7 },
  ]

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const [{ data: topics }, { data: entities }] = await Promise.all([
      supabase.from('topics').select('slug, category, updated_at, ai_context').eq('status', 'active').order('updated_at', { ascending: false }).limit(1000),
      supabase.from('entities').select('slug, updated_at').eq('status', 'active').order('updated_at', { ascending: false }).limit(1000),
    ])

    const categoryRoutes: MetadataRoute.Sitemap = [...new Set((topics || []).map((t: any) => t.category).filter(Boolean))]
      .map((c: any) => ({
        url: `${BASE_URL}/category/${encodeURIComponent(c)}`,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }))

    const topicRoutes: MetadataRoute.Sitemap = (topics || []).map((t: any) => ({
      url: `${BASE_URL}/topic/${t.slug}`,
      lastModified: t.updated_at ? new Date(t.updated_at) : new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    }))

    // Expansion Engine(PM 지시 2026-07-19) — 하나의 Topic이 여러 개의 실제 색인 대상 페이지가 되도록,
    // ai_context.expansion_drafts에 쌓인 각 앵글도 /topic/{slug}/{angle}로 별도 등록한다.
    const expansionRoutes: MetadataRoute.Sitemap = (topics || []).flatMap((t: any) =>
      ((t.ai_context?.expansion_drafts || []) as any[]).map((d) => ({
        url: `${BASE_URL}/topic/${t.slug}/${d.angle}`,
        lastModified: d.generated_at ? new Date(d.generated_at) : (t.updated_at ? new Date(t.updated_at) : new Date()),
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      }))
    )

    const entityRoutes: MetadataRoute.Sitemap = (entities || []).map((e: any) => ({
      url: `${BASE_URL}/entity/${e.slug}`,
      lastModified: e.updated_at ? new Date(e.updated_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

    // 신규 콘텐츠 장르(가이드/리뷰/비교/쇼핑) — 각 테이블이 아직 없으면 조용히 빈 배열만 반환된다.
    // 새 장르가 늘어도 lib/content-types.ts에 한 줄만 추가하면 여기는 안 건드려도 됨.
    const genericContentRoutes: MetadataRoute.Sitemap = (
      await Promise.all(
        ROUTABLE_CONTENT_TYPES.map(async ({ route, table }) => {
          const { data } = await supabase.from(table).select('slug, updated_at').limit(1000)
          return (data || []).map((item: any) => ({
            url: `${BASE_URL}/${route}/${item.slug}`,
            lastModified: item.updated_at ? new Date(item.updated_at) : new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.7,
          }))
        })
      )
    ).flat()

    return [...staticRoutes, ...topicRoutes, ...expansionRoutes, ...categoryRoutes, ...entityRoutes, ...genericContentRoutes]
  } catch {
    return staticRoutes
  }
}
