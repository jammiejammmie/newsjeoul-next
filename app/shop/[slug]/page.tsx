import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGenericContentBySlug } from '@/lib/generic-content'
import ContentDetail from '@/components/content/ContentDetail'
import { generateArticleSchema } from '@/lib/schema/article'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TABLE = 'shopping_picks'
const LABEL = '쇼핑'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) return { title: '뉴스저울', robots: { index: false, follow: false } }
  return {
    title: `${item.title} | 뉴스저울 ${LABEL}`,
    description: item.summary || undefined,
    alternates: { canonical: `${BASE}/shop/${item.slug}` },
  }
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) notFound()

  // review 페이지와 같은 이유로 Article이다(2026-08-07) — 평점도 재고·배송 조건도 없는
  // 편집 콘텐츠이므로, Product로 선언하면 채울 수 없는 필드를 요구받는다.
  const jsonLd = generateArticleSchema({
    headline: item.title,
    description: item.summary,
    url: `${BASE}/shop/${item.slug}`,
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ContentDetail label={LABEL} item={item} />
    </>
  )
}
