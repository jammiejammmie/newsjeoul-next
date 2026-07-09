import { createClient } from '@supabase/supabase-js'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type GenericContentItem = {
  id: string
  slug: string
  title: string
  summary: string | null
  body: string | null
  category: string | null
}

// guide/review/comparison/shopping_pick 공용 조회. 각 테이블이 실제로 만들어지기 전까지는
// Supabase가 에러 없이 빈 결과를 돌려주므로 항상 null → notFound()로 자연스럽게 이어진다.
export async function getGenericContentBySlug(table: string, slug: string): Promise<GenericContentItem | null> {
  const supabase = client()
  const { data } = await supabase
    .from(table)
    .select('id, slug, title, summary, body, category')
    .eq('slug', slug)
    .maybeSingle()
  return data
}
