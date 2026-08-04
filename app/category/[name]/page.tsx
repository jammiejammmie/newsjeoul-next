import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopicsByCategory, isBriefTopic } from '@/lib/topics'
import { categoryIcon } from '@/lib/icons'
import SignatureCard from '@/components/SignatureCard'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params
  const category = decodeURIComponent(name)
  return {
    title: `${category} 이슈 — 뉴스저울`,
    description: `뉴스저울이 추적 중인 ${category} 분야 이슈 목록입니다.`,
    alternates: { canonical: `https://newsjeoul.co.kr/category/${encodeURIComponent(name)}` },
  }
}

export default async function CategoryPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const category = decodeURIComponent(name)
  const topics = await getTopicsByCategory(category, 50)
  if (!topics.length) notFound()

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ padding: '16px 0 0' }}>
        <Link href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← 뉴스저울로</Link>
      </div>

      <div style={{ padding: '16px 0 24px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
          분야별 세상 보기
        </p>
        <h1 style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 'clamp(20px,3.5vw,28px)', color: 'var(--text)' }}>
          {categoryIcon(category)} {category}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>이 분야 이슈 {topics.length}개</p>
      </div>

      <div className="nj-topic-grid">
        {topics.map((t: any) => (
          <SignatureCard
            key={t.id}
            href={`/topic/${t.slug}`}
            seed={t.slug}
            icon={categoryIcon(category)}
            brief={isBriefTopic(t)}
            title={t.name}
            subtitle={t.summary || t.description}
            size="md"
          />
        ))}
      </div>
    </div>
  )
}
