import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGenericContentBySlug } from '@/lib/generic-content'
import ContentDetail from '@/components/content/ContentDetail'
import { generateProductSchema } from '@/lib/schema/product'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TABLE = 'reviews'
const LABEL = '리뷰'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) return { title: '뉴스저울', robots: { index: false, follow: false } }
  return {
    title: `${item.title} | 뉴스저울 ${LABEL}`,
    description: item.summary || undefined,
    alternates: { canonical: `${BASE}/review/${item.slug}` },
  }
}

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) notFound()

  // 평점 데이터가 아직 콘텐츠 모델에 없어 aggregateRating은 비워둔다.
  const jsonLd = generateProductSchema({ name: item.title, description: item.summary })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ContentDetail label={LABEL} item={item} />
    </>
  )
}
