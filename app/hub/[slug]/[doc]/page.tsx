import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import '../../hub.css'
import { resolveHubConfig, getHubDocument, getHubDocuments } from '@/lib/hubs'
import type { HubAffiliateSlot } from '@/lib/hubs'

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

// FAQ는 별도 컬럼 없이 마지막 블록으로 저장된다(generate-hub-documents-background.js 참고).
// 이 제목과 'Q. / A.' 형식이 두 파일 사이의 계약이다 — 한쪽만 바꾸면 FAQ가 그냥 본문으로 렌더되고
// 구조화 데이터가 조용히 빈다. 파싱에 실패하면 블록을 본문으로 되돌려 렌더하므로 화면은 깨지지 않는다.
const FAQ_HEADING = '자주 묻는 질문'

type Faq = { q: string; a: string }

function parseFaqBlock(content: string): Faq[] {
  const out: Faq[] = []
  for (const chunk of content.split(/\n{2,}/)) {
    const m = chunk.match(/^\s*Q\.\s*([\s\S]+?)\n\s*A\.\s*([\s\S]+)$/)
    if (m) out.push({ q: m[1].trim(), a: m[2].trim() })
  }
  return out
}

/** 본문 블록과 FAQ를 가른다. FAQ 블록이 없거나 형식이 깨졌으면 전부 본문으로 둔다. */
function splitFaq(blocks: { heading: string; content: string }[]) {
  const idx = blocks.findIndex((b) => b.heading.trim() === FAQ_HEADING)
  if (idx < 0) return { body: blocks, faq: [] as Faq[] }
  const faq = parseFaqBlock(blocks[idx].content)
  if (faq.length < 2) return { body: blocks, faq: [] as Faq[] }
  return { body: blocks.filter((_, i) => i !== idx), faq }
}

/**
 * 문서 유형에 맞는 제휴 슬롯을 고른다.
 *
 * 유형별로 독자의 처지가 다르다는 것이 유일한 판단 기준이다:
 *  · howto·troubleshoot → 이미 기기를 가지고 쓰다가 막힌 사람이다. 본체 링크는 팔 대상이
 *    아니므로 아예 내보내지 않고, 실제로 필요한 케이스·필름·충전기만 보여준다.
 *  · compare·buying     → 아직 사지 않고 고르는 중이다. 본체를 앞에 세우고 액세서리를 뒤에 붙인다.
 *
 * targetUrl이 없는 슬롯은 여기서 먼저 걸러낸다 — 허브 페이지는 "링크 준비 중"을 회색으로
 * 보여주지만(그 자리가 채워질 자리임을 알리는 의미가 있다), 문서 하단은 본문을 다 읽은 뒤
 * 붙는 자리라 빈 항목이 늘어서면 잡음일 뿐이다.
 *
 * kind가 없는 슬롯(DB 자동 생성 허브의 config)은 액세서리로 본다. device로 치면 howto·
 * troubleshoot 문서에서 조용히 사라지는데, 링크가 사라지는 쪽이 잘못 놓이는 쪽보다 나쁘다.
 */
function pickSlots(format: string, slots: HubAffiliateSlot[]): HubAffiliateSlot[] {
  const live = slots.filter((s) => s.targetUrl)
  const accessory = live.filter((s) => s.kind !== 'device')
  if (format === 'howto' || format === 'troubleshoot') return accessory
  return [...live.filter((s) => s.kind === 'device'), ...accessory]
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

  // 링크 금지 허브(§8.3 신차·정책)는 슬롯 자체가 없으므로 섹션이 통째로 빠진다.
  const affiliateSlots = hub.affiliate.allowed ? pickSlots(document.format, hub.affiliate.slots) : []

  const { body: bodyBlocks, faq } = splitFaq(document.blocks)

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      // FAQ가 있을 때만 FAQPage를 넣는다. 질문이 없는데 빈 mainEntity를 내보내면
      // Search Console이 "유효하지 않은 항목"으로 잡는다(2026-08-08 Product/Offer 건과 같은 부류).
      ...(faq.length
        ? [{
            '@type': 'FAQPage',
            '@id': `${BASE}/hub/${slug}/${doc}#faq`,
            mainEntity: faq.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }]
        : []),
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
          {bodyBlocks.map((b, i) => (
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

        {/* FAQ — 본문 뒤, 근거 앞. 질문 그대로 검색해 들어온 사람에게는 이 자리가 본문이다.
            <details>로 두면 접힌 답이 크롤러에 보이지 않을 수 있어 항상 펼쳐진 마크업으로 둔다. */}
        {faq.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <h2 style={{ margin: '0 0 12px', font: '800 17px/1.4 Pretendard', borderBottom: '2px solid var(--ink)', paddingBottom: 7 }}>
              {FAQ_HEADING}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {faq.map((f, i) => (
                <div key={i}>
                  <h3 style={{ margin: '0 0 5px', font: '700 14.5px/1.5 Pretendard' }}>{f.q}</h3>
                  <p style={{ margin: 0, font: '500 14px/1.75 Pretendard', color: 'var(--body)' }}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {document.sourceNote && (
          <div style={{ marginTop: 28, borderLeft: '3px solid var(--hot)', background: 'var(--paper2)', padding: '12px 15px' }}>
            <div style={{ font: '700 11px/1 Pretendard', color: 'var(--hot)', marginBottom: 6 }}>근거와 확인처</div>
            <p style={{ margin: 0, font: '500 12.5px/1.7 Pretendard', color: 'var(--body2)' }}>{document.sourceNote}</p>
          </div>
        )}

        {/* 함께 찾는 제품 — 쿠팡 파트너스 (/go/{slot}).
            본문을 다 읽은 자리에 둔다. 읽기 전에 끼워 넣으면 문서를 링크 미끼로 만드는 것이고,
            그건 이 허브 구조가 쌓으려는 신뢰와 정반대다. */}
        {affiliateSlots.length > 0 && (
          <section style={{ marginTop: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid var(--ink)', paddingBottom: 7, marginBottom: 10 }}>
              <span style={{ font: '800 15px/1.4 Pretendard' }}>함께 찾는 제품</span>
              <span style={{ font: '500 10px/1 Pretendard', color: 'var(--mute)' }}>광고</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
              {affiliateSlots.map((a) => (
                // 제휴 링크는 rel="sponsored nofollow" 필수(§8.1 — 누락 시 페널티 사유).
                <a key={a.slot} href={`/go/${a.slot}`} rel="sponsored nofollow" target="_blank"
                  className="nj-hub-card" style={{ padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ font: '600 12.5px/1.35 Pretendard' }}>{a.label}</span>
                  <b style={{ font: '800 12px/1 Pretendard', color: 'var(--hot)' }}>최저가 확인 →</b>
                </a>
              ))}
            </div>
            <span style={{ display: 'block', font: '500 10.5px/1.55 Pretendard', color: 'var(--mute2)', marginTop: 8 }}>
              이 페이지는 쿠팡 파트너스 활동의 일환으로, 구매 시 일정액의 수수료를 제공받습니다.
            </span>
          </section>
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
