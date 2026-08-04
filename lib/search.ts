import { createClient } from '@supabase/supabase-js'
import { isBriefTopic } from '@/lib/topics'

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
  /** 단문(Brief) Topic 여부 — entity 결과는 항상 false. 판별은 lib/topics.ts isBriefTopic() 한 곳만 쓴다. */
  brief: boolean
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
        // ai_context는 단문(Brief) 배지 판별(isBriefTopic)에만 쓴다 — 검색 결과에서도
        // 장문/단문 구분이 목록과 동일하게 보이도록(PM 지시 2026-08-03).
        .select('slug, name, summary, ai_context')
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
      type: 'topic', slug: t.slug, name: t.name, summary: t.summary, brief: isBriefTopic(t),
    }))
    const entityResults: SearchResult[] = (entities || []).map((e: any) => ({
      type: 'entity', slug: e.slug, name: e.name, summary: e.description, brief: false,
    }))
    return [...topicResults, ...entityResults].slice(0, limit)
  } catch {
    return []
  }
}
