import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopicsByCategory } from '@/lib/topics'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params
  const category = decodeURIComponent(name)
  return {
    title: `${category} 이슈 — 뉴스저울`,
    description: `뉴스저울이 추적 중인 ${category} 분야 이슈 목록입니다.`,
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
          {category}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>이 분야 이슈 {topics.length}개</p>
      </div>

      <div className="nj-topic-grid">
        {topics.map((t: any) => (
          <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none' }}>
            <div className="nj-topic-card">
              <div className="nj-topic-card-block" />
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{t.name}</p>
              {(t.summary || t.description) && (
                <p style={{
                  fontSize: 12, color: 'var(--text2)', lineHeight: 1.55,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {t.summary || t.description}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
