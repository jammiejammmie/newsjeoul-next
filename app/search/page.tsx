import type { Metadata } from 'next'
import Link from 'next/link'
import { searchContent } from '@/lib/search'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams
  // 내부 검색 결과 페이지는 canonical 대신 noindex — 검색어 조합마다 무한히 새 URL이 생겨
  // 저품질 중복 페이지로 색인되는 것을 막는다(Google 공식 권장 관행, PM 지시 2026-07-22
  // "canonical/중복 페이지 전수 점검"). follow는 유지해 내부 링크 자체는 계속 탐색되게 한다.
  return { title: q ? `"${q}" 검색 결과 | 뉴스저울` : '검색 | 뉴스저울', robots: { index: false, follow: true } }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const results = q ? await searchContent(q) : []

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <form action="/search" style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        <input
          type="text"
          name="q"
          defaultValue={q || ''}
          placeholder="검색어를 입력하세요"
          style={{
            flex: 1, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 12,
            padding: '12px 16px', color: 'var(--text)', fontSize: 14,
          }}
        />
        <button type="submit" className="nj-btn-primary">검색</button>
      </form>

      {q && (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
          "{q}" 검색 결과 {results.length}건
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results.map((r) => (
          <Link
            key={`${r.type}-${r.slug}`}
            href={r.type === 'topic' ? `/topic/${r.slug}` : `/entity/${r.slug}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                {r.type === 'topic' ? '이슈' : '엔티티'}
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{r.name}</p>
              {r.summary && (
                <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6, lineHeight: 1.6 }}>{r.summary}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {q && results.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>검색 결과가 없습니다.</p>
      )}
    </div>
  )
}
