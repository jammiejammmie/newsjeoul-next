import type { Metadata } from 'next'
import Link from 'next/link'
import { getActiveTopics } from '@/lib/topics'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '전체 이슈 — 뉴스저울',
  description: '뉴스저울이 지금 추적하고 있는 모든 이슈 목록입니다.',
}

export default async function TopicIndexPage() {
  const topics = await getActiveTopics(100)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ padding: '16px 0 0' }}>
        <Link href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← 뉴스저울로</Link>
      </div>

      <div style={{ padding: '16px 0 24px' }}>
        <h1 style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 'clamp(20px,3.5vw,28px)', color: 'var(--text)', marginBottom: 8 }}>
          전체 이슈
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>지금 뉴스저울이 추적 중인 이슈 {topics.length}개</p>
      </div>

      <div className="nj-topic-grid" style={{ marginBottom: 48 }}>
        {topics.map((t: any) => (
          <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none' }}>
            <div className="nj-topic-card">
              <div className="nj-topic-card-block" />
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{t.name}</p>
              {t.summary && (
                <p style={{
                  fontSize: 12, color: 'var(--text2)', lineHeight: 1.55,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {t.summary}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {topics.length === 0 && (
        <div style={{ padding: '80px 0', color: 'var(--muted)', fontSize: 13 }}>
          아직 추적 중인 이슈가 없습니다.
        </div>
      )}
    </div>
  )
}
