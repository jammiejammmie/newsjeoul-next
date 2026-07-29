import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGenericContentBySlug } from '@/lib/generic-content'
import ContentDetail from '@/components/content/ContentDetail'
import { generateHowToSchema } from '@/lib/schema/howto'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TABLE = 'guides'
const LABEL = '가이드'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) return { title: '뉴스저울', robots: { index: false, follow: false } }
  return {
    title: `${item.title} | 뉴스저울 ${LABEL}`,
    description: item.summary || undefined,
    alternates: { canonical: `${BASE}/guide/${item.slug}` },
  }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) notFound()

  // 단계별 구조(step-by-step)가 아직 콘텐츠 모델에 없어 steps는 비워둔다 —
  // 실제 가이드 파이프라인이 생기면 name/description만으로도 유효한 HowTo 스키마.
  const jsonLd = generateHowToSchema({ name: item.title, description: item.summary, steps: [] })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ContentDetail label={LABEL} item={item} />
    </>
  )
}
