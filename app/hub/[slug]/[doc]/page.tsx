import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import '../../hub.css'
import { resolveHubConfig, getHubDocument, getHubDocuments } from '@/lib/hubs'

const BASE = 'https://newsjeoul.co.kr'

// 문서는 허브보다 덜 바뀐다. 1시간 ISR.
export const revalidate = 3600

// 문서는 계속 생성되므로 목록을 고정하지 않는다. 요청 시 렌더 후 ISR로 캐시된다 —
// 문서 하나가 늘 때마다 재배포를 기다리면 자동 생성의 의미가 없다.
export async function generateStaticParams() {
  return []
}

const FORMAT_LABEL: Record<string, string> = {
  howto: '사용법', troubleshoot: '문제 해결', compare: '비교', buying: '준비',
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string; doc: string }> }
): Promise<Metadata> {
  const { slug, doc } = await params
  const [resolved, document] = await Promise.all([resolveHubConfig(slug), getHubDocument(slug, doc)])
  if (!resolved || !document) return {}
  const url = `${BASE}/hub/${slug}/${doc}`
  const desc = document.lead || `${resolved.hub.title} — ${document.title}`
  return {
    title: `${document.title} | ${resolved.hub.title} | 뉴스저울`,
    description: desc,
    alternates: { canonical: url },
    openGraph: {
      title: document.title, description: desc, url, siteName: '뉴스저울', locale: 'ko_KR', type: 'article',
      images: [{ url: `${BASE}/og?type=weight&title=${encodeURIComponent(document.title)}`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: document.title, description: desc },
  }
}

// 에버그린 가이드 문서 — 허브의 4포맷 항목이 여기로 연결된다.
// 설계서 §3.3의 에버그린 문서가 실제 페이지로 존재하게 만드는 라우트다.
export default async function HubDocPage(
  { params }: { params: Promise<{ slug: string; doc: string }> }
) {
  const { slug, doc } = await params
  const [resolved, document] = await Promise.all([resolveHubConfig(slug), getHubDocument(slug, doc)])
  if (!resolved || !document) notFound()
  const hub = resolved.hub

  // 같은 허브의 다른 문서 — 문서에서 문서로 이어지게 한다(막다른 페이지를 만들지 않는다).
  const siblings = (await getHubDocuments(slug))
    .filter((d) => d.slug !== doc)
    .slice(0, 6)

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${BASE}/hub/${slug}/${doc}`,
        headline: document.title,
        description: document.lead || undefined,
        dateModified: document.updatedAt,
        isPartOf: { '@type': 'WebPage', '@id': `${BASE}/hub/${slug}`, name: hub.title },
        author: { '@type': 'Person', name: hub.editor.name, worksFor: { '@type': 'Organization', name: '뉴스저울', url: BASE } },
        publisher: { '@type': 'Organization', name: '뉴스저울', url: BASE },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: BASE },
          { '@type': 'ListItem', position: 2, name: hub.title, item: `${BASE}/hub/${slug}` },
          { '@type': 'ListItem', position: 3, name: document.title, item: `${BASE}/hub/${slug}/${doc}` },
        ],
      },
    ],
  }

  return (
    <div className="nj-hub">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '26px 32px 80px' }}>
        <nav style={{ font: '500 11.5px/1.5 Pretendard', color: 'var(--mute)', marginBottom: 14 }}>
          <Link href="/">홈</Link> <span style={{ opacity: .5 }}>›</span>{' '}
          <Link href={`/hub/${slug}`}>{hub.title}</Link> <span style={{ opacity: .5 }}>›</span>{' '}
          {FORMAT_LABEL[document.format] || '가이드'}
        </nav>

        <h1 style={{ margin: '0 0 10px', font: '800 28px/1.3 Pretendard', letterSpacing: '-.025em' }}>
          {document.title}
        </h1>

        {document.lead && (
          <p style={{ margin: '0 0 6px', font: '500 15px/1.75 Pretendard', color: 'var(--body)' }}>{document.lead}</p>
        )}

        {/* 자동 생성물임을 숨기지 않는다. 독자가 어느 정도로 신뢰할지 스스로 판단할 근거를 준다. */}
        <div style={{ font: '500 11.5px/1.6 Pretendard', color: 'var(--mute)', margin: '0 0 22px', paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
          {document.generatedBy === 'ai' ? 'AI 편집국 자동 작성' : `${hub.editor.name} 에디터`}
          {' · '}{new Date(document.updatedAt).toLocaleDateString('ko-KR')} 갱신
        </div>

        <article style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          {document.blocks.map((b, i) => (
            <section key={i}>
              <h2 style={{ margin: '0 0 9px', font: '800 17px/1.4 Pretendard' }}>{b.heading}</h2>
              {b.content.split(/\n{2,}/).map((para, j) => {
                // 모델이 '- '로 시작하는 목록을 쓰는 경우가 많다. 그대로 흘리면 한 줄로 붙어버린다.
                const lines = para.split('\n')
                const isList = lines.every((l) => l.trim().startsWith('-') || !l.trim())
                if (isList) {
                  return (
                    <ul key={j} style={{ margin: '0 0 11px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {lines.filter((l) => l.trim()).map((l, k) => (
                        <li key={k} style={{ font: '500 14.5px/1.75 Pretendard', color: 'var(--body)' }}>
                          {l.replace(/^\s*-\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  )
                }
                return (
                  <p key={j} style={{ margin: '0 0 11px', font: '500 14.5px/1.8 Pretendard', color: 'var(--body)' }}>{para}</p>
                )
              })}
            </section>
          ))}
        </article>

        {document.sourceNote && (
          <div style={{ marginTop: 28, borderLeft: '3px solid var(--hot)', background: 'var(--paper2)', padding: '12px 15px' }}>
            <div style={{ font: '700 11px/1 Pretendard', color: 'var(--hot)', marginBottom: 6 }}>근거와 확인처</div>
            <p style={{ margin: 0, font: '500 12.5px/1.7 Pretendard', color: 'var(--body2)' }}>{document.sourceNote}</p>
          </div>
        )}

        <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <Link href={`/hub/${slug}`} style={{ font: '700 13.5px/1.4 Pretendard' }}>
            ← {hub.title} 허브로 돌아가기
          </Link>
        </div>

        {siblings.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <div style={{ font: '800 15px/1.4 Pretendard', borderBottom: '2px solid var(--ink)', paddingBottom: 7, marginBottom: 9 }}>
              이 허브의 다른 가이드
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {siblings.map((d) => (
                <Link key={d.slug} href={`/hub/${slug}/${d.slug}`}
                  style={{ font: '600 13.5px/1.5 Pretendard', padding: '8px 0', borderBottom: '1px dotted var(--line)' }}>
                  <span style={{ font: '700 10.5px/1 Pretendard', color: 'var(--mute)', marginRight: 7 }}>
                    {FORMAT_LABEL[d.format] || '가이드'}
                  </span>
                  {d.title}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
