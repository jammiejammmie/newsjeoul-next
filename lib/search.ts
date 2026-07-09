import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type SearchResult = {
  type: 'topic' | 'entity'
  slug: string
  name: string
  summary: string | null
}

// PostgREST .or() 필터 문법에서 특별한 의미를 갖는 문자를 제거해 안전한 검색어만 통과시킨다
function sanitizeQuery(q: string) {
  return q.replace(/[,.()"']/g, ' ').trim().slice(0, 60)
}

// 1단계 내부 검색 — 별도 검색 인프라 없이 Postgres 내장 전문검색(to_tsvector/to_tsquery)으로 시작.
// 검색 트래픽/품질이 실제로 병목이 되면 그때 전용 엔진(Algolia/Meilisearch) 도입 검토.
export async function searchContent(rawQuery: string, limit = 20): Promise<SearchResult[]> {
  const q = sanitizeQuery(rawQuery)
  if (!q) return []

  const supabase = client()
  try {
    const [{ data: topics }, { data: entities }] = await Promise.all([
      supabase
        .from('topics')
        .select('slug, name, summary')
        .eq('status', 'active')
        .or(`name.fts(simple).${q},summary.fts(simple).${q}`)
        .limit(limit),
      supabase
        .from('entities')
        .select('slug, name, description')
        .eq('status', 'active')
        .or(`name.fts(simple).${q}`)
        .limit(limit),
    ])

    const topicResults: SearchResult[] = (topics || []).map((t: any) => ({
      type: 'topic', slug: t.slug, name: t.name, summary: t.summary,
    }))
    const entityResults: SearchResult[] = (entities || []).map((e: any) => ({
      type: 'entity', slug: e.slug, name: e.name, summary: e.description,
    }))
    return [...topicResults, ...entityResults].slice(0, limit)
  } catch {
    return []
  }
}
