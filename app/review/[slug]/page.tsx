import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGenericContentBySlug } from '@/lib/generic-content'
import ContentDetail from '@/components/content/ContentDetail'
import { generateArticleSchema } from '@/lib/schema/article'

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

  // 평점 데이터가 콘텐츠 모델에 없으므로 Product가 아니라 Article로 선언한다(2026-08-07).
  // 이 페이지는 실제로 편집 콘텐츠다 — 평점 없는 Product는 제품 스니펫 자격 미달로 매번
  // Search Console 경고를 냈고, 평점을 지어내는 것은 허위 마크업이라 선택지가 아니었다.
  const jsonLd = generateArticleSchema({
    headline: item.title,
    description: item.summary,
    url: `${BASE}/review/${item.slug}`,
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ContentDetail label={LABEL} item={item} />
    </>
  )
}
