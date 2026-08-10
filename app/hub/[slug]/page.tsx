import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import '../hub.css'
import {
  getHubConfig, getHubMeta, getHubNews, getHubTopics, HUB_SLUGS,
  resolveHubConfig, getDbHubSlugs, getHubDocuments, hubDocHref,
} from '@/lib/hubs'
import type { HubDocument } from '@/lib/hubs'
import type { HubConfig, HubGuide } from '@/lib/hubs/types'

const BASE = 'https://newsjeoul.co.kr'

// 뉴스는 계속 들어오지만 허브 본문은 자주 바뀌지 않는다. 30분 ISR로 신선도와 부하를 맞춘다.
export const revalidate = 1800

// URL에 날짜·연도를 넣지 않는다(설계서 §6.1) — /hub/{slug} 고정.
// 연도가 붙으면 해마다 새 URL이 되어 누적 링크·색인 자산이 리셋된다.
// 레지스트리 허브 + 자동 생성 허브를 함께 프리렌더한다. 빌드 후에 생성된 허브는
// dynamicParams(기본 true)로 요청 시 렌더되고 ISR로 캐시된다 — 새 허브가 배포를 기다리지 않는다.
export async function generateStaticParams() {
  const dbSlugs = await getDbHubSlugs()
  return [...HUB_SLUGS, ...dbSlugs].map((slug) => ({ slug }))
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
function fmtShort(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`
}
function timeAgo(iso: string | null | undefined) {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 0) return ''
  if (mins < 60) return `${mins}분 전`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.round(h / 24)
  return d === 1 ? '어제' : `${d}일 전`
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const resolved = await resolveHubConfig(slug)
  if (!resolved) return {}
  const hub = resolved.hub
  const url = `${BASE}/hub/${hub.slug}`
  const title = `${hub.title} — 가격·사용법·오류 해결 총정리 | 뉴스저울`
  return {
    title,
    description: hub.definition,
    alternates: { canonical: url },
    openGraph: {
      title, description: hub.definition, url, siteName: '뉴스저울', locale: 'ko_KR', type: 'website',
      images: [{ url: `${BASE}/og?type=weight&title=${encodeURIComponent(hub.title)}`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description: hub.definition },
  }
}

/** 에버그린 4포맷 한 칸 */
function EvergreenBlock({ label, items }: { label: string; items: HubGuide[] }) {
  return (
    <div className="nj-hub-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ font: '700 11px/1 Pretendard', color: 'var(--hot)', letterSpacing: '.06em' }}>{label}</span>
      {items.map((g, i) => {
        const inner = (
          <>
            {g.title}
            {g.badge && (
              <span style={{ font: '700 10.5px/1 Pretendard', color: 'var(--paper)', background: g.badge === '계산' ? 'var(--hot)' : 'var(--ink)', padding: '2px 5px', marginLeft: 6 }}>
                {g.badge}
              </span>
            )}
            {g.updatedAt && (
              <span style={{ font: '500 11px/1 Pretendard', color: 'var(--mute2)', marginLeft: 6 }}>· {fmtShort(g.updatedAt)} 갱신</span>
            )}
          </>
        )
        const style: React.CSSProperties = {
          display: 'block', font: '600 14.5px/1.45 Pretendard',
          paddingBottom: i < items.length - 1 ? 7 : 0,
          borderBottom: i < items.length - 1 ? '1px dotted var(--line)' : 'none',
        }
        // href가 없으면 링크로 만들지 않는다 — 아직 쓰지 않은 문서로 보내면 404가 쌓이고
        // 색인 품질이 떨어진다(설계서 §10.3 방어선).
        return g.href
          ? <Link key={g.title} href={g.href} style={style}>{inner}</Link>
          : <span key={g.title} style={{ ...style, color: 'var(--body2)' }}>{inner}</span>
      })}
    </div>
  )
}

export default async function HubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const resolved = await resolveHubConfig(slug)
  if (!resolved) notFound()
  const hub = resolved.hub

  const [meta, news, topics, docs] = await Promise.all([
    getHubMeta(hub),
    getHubNews(hub, 6),
    getHubTopics(hub, 4),
    // 에버그린 문서 — 제목만 있던 항목이 실제 문서로 연결된다.
    getHubDocuments(hub.slug),
  ])

  const trend = hub.trend
  const maxTrend = trend ? Math.max(...trend.points.map((p) => p.value)) : 0
  const slots = hub.affiliate.allowed ? hub.affiliate.slots : []
  // 실제 목적지가 연결된 첫 슬롯. 화면의 고지 문구와 Offer의 url이 같은 사실을 근거로 삼는다.
  const primaryAffiliate = slots.find((a) => a.targetUrl)
  const hasLiveAffiliate = Boolean(primaryAffiliate)

  // ── 구조화 데이터 (설계서 §10.5: 허브 = Product/FAQPage, 저자 = Person) ──
  const personSchema = {
    '@type': 'Person',
    '@id': `${BASE}/hub/${hub.slug}#editor`,
    name: hub.editor.name,
    jobTitle: `${hub.editor.beat} 데이터 분석 에디터`,
    description: hub.editor.statement,
    worksFor: { '@type': 'Organization', name: '뉴스저울', url: BASE },
  }
  // kind별로 스키마 타입이 갈린다(설계서 §10.5). 제도를 Product로 내보내면 잘못된 선언이 된다.
  //   product → Product / car → Car / policy → GovernmentService / program → SoftwareApplication
  const SCHEMA_TYPE: Record<string, string> = {
    product: 'Product', car: 'Car', policy: 'GovernmentService', program: 'SoftwareApplication',
  }
  const entitySchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[hub.kind] ?? 'Product',
    '@id': `${BASE}/hub/${hub.slug}#entity`,
    name: hub.title,
    description: hub.definition,
    category: hub.category,
    url: `${BASE}/hub/${hub.slug}`,
    // image는 Product류 스키마의 권장 필드다(Search Console "판매자 목록 — image 필드 누락").
    // 실제 제품 사진을 보유하지 않으므로 이 허브의 대표 이미지(OG 카드)를 쓴다 —
    // 우리가 실제로 발행하는 이미지이고, 페이지 메타데이터가 쓰는 것과 같은 URL이다.
    image: `${BASE}/og?type=weight&title=${encodeURIComponent(hub.title)}`,
    additionalProperty: hub.specs.map((s) => ({ '@type': 'PropertyValue', name: s.label, value: s.value })),
    ...(hub.schema.brand ? { brand: { '@type': 'Brand', name: hub.schema.brand } } : {}),
    ...(hub.schema.releaseDate ? { releaseDate: hub.schema.releaseDate } : {}),
    ...(hub.schema.provider ? { provider: { '@type': 'GovernmentOrganization', name: hub.schema.provider } } : {}),
    ...(hub.schema.applicationCategory ? { applicationCategory: hub.schema.applicationCategory } : {}),
    ...(hub.schema.operatingSystem ? { operatingSystem: hub.schema.operatingSystem } : {}),
    // ── Offer ── 2026-08-08 Search Console "제품 스니펫" 오류 대응.
    //
    // 경위: 08-07에 Offer를 뗐다(커밋 d8674a5). Offer가 있으면 Google이 이 페이지를
    // "판매자 목록(merchant listing)" 후보로 보고 hasMerchantReturnPolicy·shippingDetails를
    // 요구했기 때문이다. 그런데 그 조치가 경고를 오류로 바꿔놨다 —
    // Product는 offers·review·aggregateRating 중 하나가 없으면 항목 자체가 '유효하지 않음'이 되어
    // 리치 결과에서 완전히 빠진다(08-08 확인, 영향 URL: /hub/galaxy-z-fold8 1건).
    // 판매자 목록의 두 필드는 '권장'이라 경고에 그쳤다. 경고를 지우려다 색인 자격을 잃은 셈이라 되돌린다.
    //
    // review·aggregateRating은 대안이 아니다. 평점 데이터가 실제로 없고,
    // 없는 평점을 지어내는 것은 Google 정책상 수동 조치 대상이다. 남는 선택지는 Offer뿐이다.
    //
    // 판매자 오인을 다시 부르지 않기 위해 seller를 명시한다 — 파는 쪽은 쿠팡이고 뉴스저울이 아니다.
    // 그래서 반품·배송 조건을 우리가 선언할 이유가 없다는 사실이 마크업에 그대로 드러난다.
    // 여전히 "추정치를 선언하지 않는다"는 원칙은 유지한다: price가 확정된 허브에만 Offer가 붙는다
    // (가격 미공시 신차 등은 그대로 Offer 없음).
    ...(typeof hub.schema.price === 'number'
      ? {
          offers: {
            '@type': 'Offer',
            price: hub.schema.price,
            priceCurrency: hub.schema.currency ?? 'KRW',
            availability: 'https://schema.org/InStock',
            // 실제 구매 경로가 연결돼 있으면 그곳을, 아직이면 이 허브 페이지를 가리킨다.
            // 목적지가 비어 있는 /go/{slot}은 404를 반환하므로(app/go/[slot]/route.ts)
            // 링크가 붙기 전에 그 주소를 Offer에 선언하면 죽은 URL을 구조화 데이터로 내보내게 된다.
            url: primaryAffiliate
              ? `${BASE}/go/${primaryAffiliate.slot}`
              : `${BASE}/hub/${hub.slug}`,
            ...(primaryAffiliate
              ? { seller: { '@type': 'Organization', name: '쿠팡' } }
              : {}),
          },
        }
      : {}),
  }
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${BASE}/hub/${hub.slug}#faq`,
    mainEntity: hub.faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }
  // dateModified 정확성은 설계서 §10.5가 명시한 요건이다 — hubs 테이블 값을 그대로 쓴다.
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${BASE}/hub/${hub.slug}`,
    name: hub.title,
    description: hub.definition,
    datePublished: meta.createdAt,
    dateModified: meta.updatedAt,
    author: personSchema,
    // 2026-08-07 Search Console "탐색경로(심각) — item 필드 누락" 수정.
    //
    // 이전에는 hub.breadcrumb(['신제품·가전','모바일'])를 중간 항목으로 넣으면서 item을 주지
    // 않았다. 그 분류는 허브 전용 표기라 대응하는 페이지가 없다 — 실측으로 /category/신제품·가전,
    // /category/모바일, /category/신차 모두 404다. 그래서 URL을 붙이는 대신 항목을 뺐다.
    // 없는 URL을 지어 붙이면 경고는 사라져도 404를 구조화 데이터로 선언하게 된다.
    // 화면의 시각적 breadcrumb는 분류를 그대로 보여준다(아래 렌더링부) — 표시와 선언은 별개다.
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: BASE },
        { '@type': 'ListItem', position: 2, name: hub.title, item: `${BASE}/hub/${hub.slug}` },
      ],
    },
  }

  // 추이가 없는 허브(프로그램·일부 제도)는 목차에서도 그 항목을 뺀다 — 없는 앵커로 보내지 않는다.
  const TOC = [
    { id: 'news', label: '최신 소식' },
    ...(trend ? [{ id: 'trend', label: trend.title }] : []),
    { id: 'guides', label: '가이드' },
    ...(hub.tools?.length ? [{ id: 'tools', label: '계산기' }] : []),
    { id: 'specs', label: hub.specsTitle },
    { id: 'timeline', label: '타임라인' },
    { id: 'faq', label: '자주 묻는 질문' },
  ]

  return (
    <div className="nj-hub">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(entitySchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />

      {/* 브레드크럼 */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '11px 24px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 7, alignItems: 'center', font: '500 12px/1 Pretendard', color: 'var(--mute)', flexWrap: 'wrap' }}>
        <Link href="/" style={{ color: 'var(--mute)' }}>홈</Link>
        {hub.breadcrumb.map((b) => (<span key={b} style={{ display: 'contents' }}><span>›</span><span>{b}</span></span>))}
        <span>›</span>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{hub.title}</span>
      </div>

      {/* 허브 헤더 */}
      <header style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 24px', borderBottom: '1px solid var(--ink)' }}>
        <span style={{ font: '700 11px/1 Pretendard', color: 'var(--hot)', letterSpacing: '.1em' }}>{hub.trackingNote}</span>
        <h1 style={{ margin: '10px 0 0', font: '800 clamp(28px,4vw,38px)/1.15 Pretendard', letterSpacing: '-.04em' }}>{hub.title}</h1>
        <p style={{ margin: '10px 0 0', font: '400 15px/1.7 Pretendard', color: 'var(--body)', maxWidth: 640 }}>{hub.definition}</p>

        <div className="nj-hub-stats" style={{ marginTop: 14 }}>
          {hub.stats.map((s) => (
            <div className="nj-hub-stat" key={s.label}>
              <span style={{ font: '500 11px/1 Pretendard', color: 'var(--mute)' }}>{s.label}</span>
              <b style={{ font: '800 18px/1.1 Pretendard', color: s.emphasis ? 'var(--hot)' : 'var(--ink)' }}>{s.value}</b>
              {s.note && <span style={{ font: `500 11px/1 Pretendard`, color: s.emphasis ? 'var(--hot)' : 'var(--mute2)' }}>{s.note}</span>}
            </div>
          ))}
        </div>

        {/* 갱신 메타 — 최초/최종/횟수 */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', font: '500 12px/1.6 Pretendard', color: 'var(--mute)', marginTop: 12 }}>
          <span>최초 작성 {fmtDate(meta.createdAt)}</span>
          <time dateTime={meta.updatedAt} style={{ color: 'var(--ink)', fontWeight: 700 }}>최종 갱신 {fmtDate(meta.updatedAt)}</time>
          <span>갱신 {meta.updateCount}회</span>
        </div>
      </header>

      {/* 목차 탭 */}
      <nav style={{ maxWidth: 1120, margin: '0 auto', background: 'var(--tabbar)', borderBottom: '1px solid var(--ink)', display: 'flex', flexWrap: 'wrap', padding: '0 12px' }}>
        {TOC.map((t, i) => (
          <a key={t.id} href={`#${t.id}`} style={{ font: `${i === 0 ? 700 : 500} 13px/1 Pretendard`, padding: '11px 12px', color: i === 0 ? 'var(--hot)' : 'var(--ink)' }}>{t.label}</a>
        ))}
      </nav>

      <div className="nj-hub-grid">
        <div className="nj-hub-main" style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>

          {/* 최신 소식 — articles 실연동 */}
          <section id="news" style={{ scrollMarginTop: 12 }}>
            <div className="nj-hub-h2">
              <h2>최신 소식 <span className="sub">이 제품 관련 보도 {news.length}건</span></h2>
            </div>
            {news.length === 0 ? (
              <p style={{ margin: 0, font: '400 13.5px/1.7 Pretendard', color: 'var(--body2)' }}>
                아직 수집된 관련 보도가 없습니다. 기사가 들어오면 이 자리에 자동으로 채워집니다.
              </p>
            ) : (
              news.map((n, i) => (
                <a
                  key={n.id}
                  href={n.url || undefined}
                  target={n.url ? '_blank' : undefined}
                  rel={n.url ? 'noopener nofollow' : undefined}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline',
                    padding: '9px 0', borderBottom: i < news.length - 1 ? '1px solid var(--line2)' : 'none',
                  }}
                >
                  <span style={{ font: `${i === 0 ? '700 16px' : '600 14.5px'}/1.45 Pretendard` }}>{n.title}</span>
                  <span style={{ font: '500 11px/1 Pretendard', color: 'var(--mute2)', whiteSpace: 'nowrap' }}>
                    {n.source ? `${n.source} · ` : ''}{timeAgo(n.publishedAt)}
                  </span>
                </a>
              ))
            )}
            {topics.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ font: '700 11px/1 Pretendard', color: 'var(--mute)' }}>관련 이슈</span>
                {topics.map((t: any) => (
                  <Link key={t.slug} href={`/topic/${t.slug}`} className="nj-hub-tag">{t.name}</Link>
                ))}
              </div>
            )}
          </section>

          {/* 수치 추이(있는 허브만) + 에디터 판단 1문장 */}
          {trend && (
            <section id="trend" style={{ scrollMarginTop: 12 }}>
              <div className="nj-hub-h2">
                <h2>{trend.title} <span className="sub">{trend.label}</span></h2>
                {trend.cadence && <span className="sub">{trend.cadence}</span>}
              </div>
              <div className="nj-hub-bars">
                {trend.points.map((p, i) => {
                  const last = i === trend.points.length - 1
                  return (
                    <div className="nj-hub-bar-col" key={p.date}>
                      <span style={{ font: '700 11px/1 Pretendard', color: last ? 'var(--hot)' : 'var(--mute)' }}>{p.value}{trend.unit}</span>
                      <div className={`nj-hub-bar${last ? ' is-last' : ''}`} style={{ height: Math.round((p.value / maxTrend) * 96) }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, padding: '6px 0 0' }}>
                {trend.points.map((p, i) => {
                  const last = i === trend.points.length - 1
                  return (
                    <span key={p.date} style={{ flex: 1, textAlign: 'center', font: `${last ? 700 : 500} 11px/1 Pretendard`, color: last ? 'var(--ink)' : 'var(--mute2)' }}>
                      {fmtShort(p.date)}
                    </span>
                  )
                })}
              </div>
            </section>
          )}

          {/* 에디터 판단 1문장 — 추이가 없는 허브에도 항상 노출한다(§3.2·§4.1-2).
              수치만 보여주고 판단을 빼면 AI 요약에 그대로 먹힌다. */}
          <section style={{ borderLeft: '3px solid var(--hot)', background: 'var(--card)', border: '1px solid var(--line)', borderLeftWidth: 3, padding: '14px 16px' }}>
            <span style={{ display: 'block', font: '700 11px/1 Pretendard', color: 'var(--hot)', letterSpacing: '.06em', marginBottom: 7 }}>에디터 판단</span>
            <p style={{ margin: 0, font: '400 14px/1.7 Pretendard', color: 'var(--body)' }}>
              {hub.verdict} <b style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>— {hub.editor.name} 에디터</b>
            </p>
          </section>

          {/* 에버그린 4포맷 */}
          <section id="guides" style={{ scrollMarginTop: 12 }}>
            <div className="nj-hub-h2">
              <h2>분석해 정리한 가이드 <span className="sub">공식 자료·사용자 리포트 종합 · 계속 갱신</span></h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '14px 20px' }}>
              {(['howto', 'troubleshoot', 'compare', 'buying'] as const).map((key) => (
                <EvergreenBlock
                  key={key}
                  label={hub.evergreen[key].label}
                  // 설정의 href가 있으면 그대로, 없으면 생성된 문서가 있을 때만 링크가 붙는다.
                  items={hub.evergreen[key].items.map((i) => ({
                    ...i, href: i.href ?? hubDocHref(hub.slug, docs, i.title),
                  }))}
                />
              ))}
            </div>
          </section>

          {/* 계산기·도구 — 설정에 선언된 허브만 렌더된다(§4.1-3).
              허브가 늘어도 템플릿은 그대로 두고 config에 tools만 추가하면 된다. */}
          {hub.tools?.length ? (
            <section id="tools" style={{ scrollMarginTop: 12 }}>
              <div className="nj-hub-h2"><h2>계산기 <span className="sub">입력값으로 직접 계산</span></h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
                {hub.tools.map((tool) => (
                  <Link key={tool.href} href={tool.href}
                    style={{ display: 'block', background: 'var(--card)', border: '1px solid var(--line)', padding: '13px 15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <b style={{ font: '800 14px/1.4 Pretendard' }}>{tool.title}</b>
                      <span style={{ font: '800 12px/1 Pretendard', color: 'var(--accent)' }}>→</span>
                    </div>
                    <p style={{ margin: '5px 0 0', font: '500 12.5px/1.6 Pretendard', color: 'var(--mute)' }}>{tool.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* 스펙 */}
          <section id="specs" style={{ scrollMarginTop: 12 }}>
            <div className="nj-hub-h2"><h2>{hub.specsTitle} <span className="sub">공식 자료 기준</span></h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '0 24px' }}>
              {hub.specs.map((s) => (
                <div key={s.label} style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 10, font: '500 13.5px/1.5 Pretendard', padding: '7px 0', borderBottom: '1px dotted var(--line)' }}>
                  <span style={{ color: 'var(--mute)' }}>{s.label}</span>
                  <span>{s.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 타임라인 */}
          <section id="timeline" style={{ scrollMarginTop: 12 }}>
            <div className="nj-hub-h2"><h2>{hub.timelineTitle} <span className="sub">기록된 변화</span></h2></div>
            {hub.timeline.map((t) => (
              <div key={t.date} style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12, font: '400 13.5px/1.6 Pretendard', padding: '7px 0', borderBottom: '1px dotted var(--line)' }}>
                <b style={{ fontWeight: 700 }}>{fmtShort(t.date)}</b>
                <span>{t.text}</span>
              </div>
            ))}
          </section>

          {/* FAQ */}
          <section id="faq" style={{ scrollMarginTop: 12 }}>
            <div className="nj-hub-h2"><h2>자주 묻는 질문 <span className="sub">검색으로 들어온 질문을 모아 답합니다</span></h2></div>
            {hub.faq.map((f, i) => (
              <div key={f.q} style={{ padding: '11px 0', borderBottom: i < hub.faq.length - 1 ? '1px solid var(--line2)' : 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ font: '700 15px/1.4 Pretendard' }}>{f.q}</span>
                <span style={{ font: '400 13.5px/1.65 Pretendard', color: 'var(--body)' }}>{f.a}</span>
              </div>
            ))}
          </section>
        </div>

        {/* 우측 sticky 레일 */}
        <aside className="nj-hub-rail">
          {/* 담당 에디터 */}
          <div className="nj-hub-card" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ font: '700 11px/1 Pretendard', color: 'var(--mute)', letterSpacing: '.06em' }}>이 페이지를 담당합니다</span>
            {/* '{이름} — {분야} 데이터 분석 에디터' 한 줄. 연차(years) 표기는 2026-08-10 폐지 —
                검증할 수 없는 경력 주장이라 신뢰 신호가 아니라 리스크였다. */}
            <span style={{ font: '500 12.5px/1.45 Pretendard', color: 'var(--mute)' }}>
              <b style={{ font: '700 14.5px/1.45 Pretendard', color: 'var(--ink)' }}>{hub.editor.name}</b>
              {' — '}{hub.editor.beat} 데이터 분석 에디터
            </span>
            <span style={{ font: '400 12.5px/1.6 Pretendard', color: 'var(--body)' }}>{hub.editor.statement}</span>
            <div style={{ display: 'flex', gap: 14, font: '500 11.5px/1 Pretendard', color: 'var(--mute)' }}>
              {hub.editor.hubCount != null && <span>담당 허브 {hub.editor.hubCount}개</span>}
            </div>
          </div>

          {/* 지금 사기 — 쿠팡 파트너스 (/go/{slot}).
              링크 금지 카테고리(§8.3 신차·정책)는 슬롯 자체가 없고, 대신 왜 없는지를 밝힌다.
              설계서 §6.3-2와 같은 원리다: "링크 없는 섹션의 존재가 신뢰의 증거"다. */}
          {hub.affiliate.allowed ? (
            <div>
              <div className="nj-hub-rail-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span>지금 사기</span>
                <span style={{ font: '500 10px/1 Pretendard', color: 'var(--mute)' }}>광고</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {slots.map((a) => {
                  const inner = (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ font: '600 12px/1.3 Pretendard' }}>{a.label}</span>
                      <b style={{ font: '800 12px/1 Pretendard', color: a.targetUrl ? 'var(--hot)' : 'var(--mute2)' }}>
                        {a.targetUrl ? '최저가 확인 →' : '링크 준비 중'}
                      </b>
                    </div>
                  )
                  // 제휴 링크는 rel="sponsored nofollow" 필수(§8.1 — 누락 시 페널티 사유).
                  // targetUrl이 없는 슬롯은 링크로 만들지 않는다(빈 목적지로 보내지 않는다).
                  return a.targetUrl ? (
                    <a key={a.slot} href={`/go/${a.slot}`} rel="sponsored nofollow" target="_blank" className="nj-hub-card" style={{ padding: '8px 9px' }}>
                      {inner}
                    </a>
                  ) : (
                    <div key={a.slot} className="nj-hub-card" style={{ padding: '8px 9px', opacity: 0.6 }}>{inner}</div>
                  )
                })}
              </div>
              <span style={{ display: 'block', font: '500 10px/1.5 Pretendard', color: 'var(--mute2)', marginTop: 7 }}>
                {hasLiveAffiliate
                  ? '이 페이지는 쿠팡 파트너스 활동의 일환으로, 구매 시 일정액의 수수료를 제공받습니다.'
                  : '제휴 링크가 연결되면 쿠팡 파트너스 고지 문구가 함께 표시됩니다.'}
              </span>
            </div>
          ) : (
            <div>
              <div className="nj-hub-rail-h">제휴 링크 없음</div>
              <p style={{ margin: 0, font: '400 12px/1.65 Pretendard', color: 'var(--body2)' }}>{hub.affiliate.reason}</p>
            </div>
          )}

          {/* 함께 보는 허브 */}
          <div>
            <div className="nj-hub-rail-h">함께 보는 허브</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {hub.related.map((r, i) => {
                const exists = HUB_SLUGS.includes(r.slug)
                const row = (
                  <>
                    <span style={{ font: '600 13px/1.4 Pretendard', color: exists ? 'var(--ink)' : 'var(--mute)' }}>{r.title}</span>
                    <span style={{ font: '500 11px/1 Pretendard', color: 'var(--mute2)' }}>
                      {exists ? `가이드 ${r.guideCount ?? 0}` : '준비 중'}
                    </span>
                  </>
                )
                const style: React.CSSProperties = {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '6px 0', borderBottom: i < hub.related.length - 1 ? '1px dotted var(--line)' : 'none',
                }
                // 아직 만들지 않은 허브로는 링크하지 않는다 — 404를 쌓지 않는다.
                return exists
                  ? <Link key={r.slug} href={`/hub/${r.slug}`} style={style}>{row}</Link>
                  : <div key={r.slug} style={style}>{row}</div>
              })}
            </div>
          </div>

          {/* 태그 */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {hub.tags.map((t) => (
              <Link key={t} href={`/search?q=${encodeURIComponent(t)}`} className="nj-hub-tag">#{t}</Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
