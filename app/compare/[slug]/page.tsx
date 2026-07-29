import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGenericContentBySlug } from '@/lib/generic-content'
import ContentDetail from '@/components/content/ContentDetail'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TABLE = 'comparisons'
const LABEL = '비교'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) return { title: '뉴스저울', robots: { index: false, follow: false } }
  return {
    title: `${item.title} | 뉴스저울 ${LABEL}`,
    description: item.summary || undefined,
    alternates: { canonical: `${BASE}/compare/${item.slug}` },
  }
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const item = await getGenericContentBySlug(TABLE, slug)
  if (!item) notFound()

  // ItemList 스키마(lib/schema/itemlist.ts)는 실제 "비교 대상 항목" 목록이 콘텐츠 모델에
  // 생기면 연결한다 — 지금은 비교 대상 데이터가 없어 가짜 항목을 만들지 않는다.
  return <ContentDetail label={LABEL} item={item} />
}
