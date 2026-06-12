import { createClient } from '@supabase/supabase-js'

const BASE = 'https://newsjeoul.co.kr'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: stories } = await supabase
    .from('stories')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const items = (stories || []).map((s) => {
    const pubDate = new Date(s.created_at).toUTCString()
    const link = `${BASE}/story/${s.id}`
    const title = s.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `
    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
    </item>`
  }).join('')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>뉴스저울 — 당신이 못 본 절반</title>
    <link>${BASE}</link>
    <description>오늘 언론사 90%가 침묵한 뉴스가 있습니다.</description>
    <language>ko</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=1800',
    },
  })
}
