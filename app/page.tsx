import type { Metadata } from 'next'
import Link from 'next/link'
import { getActiveTopics, getDiscoveryCards, pickHeroTopic } from '@/lib/topics'
import { domainColors } from '@/lib/design-tokens'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'

// 도메인(카테고리)별 그라디언트 배경 — Cover Rotation 카드용. domainColors에 없는 카테고리는
// 중립 스톤 톤으로 폴백(색이 없다고 카드가 비어 보이지 않게).
function topicGradient(category: string | null) {
  const c = category ? domainColors[category] : undefined
  const base = c || '#8B887E'
  return {
    bg: `linear-gradient(155deg, ${base}29, rgba(11,11,13,.75))`,
    border: `${base}4D`,
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const topics = await getActiveTopics(30)
  const top = pickHeroTopic(topics)
  const desc = top
    ? `오늘 세상은 "${top.name}" 쪽으로 기울어 있습니다.`
    : '3분이면 오늘 세상을 이해할 수 있습니다.'
  const ogImageUrl = `${BASE}/og?type=weight&title=${encodeURIComponent(top?.name || '뉴스저울')}`

  return {
    title: TAGLINE,
    description: desc,
    openGraph: {
      title: TAGLINE, description: desc, url: BASE, siteName: '뉴스저울',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }], locale: 'ko_KR', type: 'website',
    },
    twitter: { card: 'summary_large_image', title: TAGLINE, description: desc, images: [ogImageUrl] },
  }
}

export default async function Home() {
  const [activeTopics, discoveryCards] = await Promise.all([
    getActiveTopics(41), // 지금 규모(active 약 41개)에서는 사실상 전체 풀
    getDiscoveryCards(),
  ])

  if (activeTopics.length === 0) {
    return (
      <div style={{ padding: '120px 32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        오늘의 이슈를 정리하는 중입니다.
      </div>
    )
  }

  // Hero는 메가토픽 화이트리스트 우선(§lib/topics.ts pickHeroTopic 주석 참고 —
  // importance_score가 아직 실제 계산되지 않아 순수 정렬만으로는 단발성 사건이 우연히 1등이 될 수 있음).
  // 나머지(사이드/Living Index)는 화이트리스트 없이 있는 그대로의 순위를 보여준다.
  const heroTopic = pickHeroTopic(activeTopics)!
  const rest = activeTopics.filter((t) => t.slug !== heroTopic.slug)
  const sideTopics = rest.slice(0, 2)

  // Living Index는 목업과 동일하게 히어로/사이드 포함 전체를 순위대로 다시 나열한다.
  const rankedAll = [heroTopic, ...rest]

  const weightOf = (t: (typeof activeTopics)[number]) => Math.round(t.importance_score ?? 0)
  // PM 지시(2026-07-17) — 제목을 다 읽기 전에 3초 안에 파악하게 하는 강조 키워드.
  // 아직 display_keywords를 만든 적 없는(장문 미발행) Topic은 빈 배열 — 카드 레이아웃은 그대로 유지.
  const keywordsOf = (t: (typeof activeTopics)[number]) => (t.ai_context?.draft?.display_keywords || []) as string[]

  return (
    <div style={{ fontFamily: "'Pretendard',-apple-system,sans-serif" }}>
      {/* 상단 라이브 표시줄 */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '14px 32px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
          <span className="nj-live-dot" />
          오늘 {activeTopics.length}개의 세계가 열려 있습니다
        </div>
      </div>

      {/* COVER ROTATION HERO */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 32px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, height: 'min(56vw, 540px)' }}>
          <Link
            href={`/topic/${heroTopic.slug}`}
            className="nj-cover-card"
            style={{
              position: 'relative', borderRadius: 20, overflow: 'hidden',
              background: topicGradient(heroTopic.category).bg,
              border: `1px solid ${topicGradient(heroTopic.category).border}`,
            }}
          >
            {/* 몇 g은 좌상단 고정 위치 유지 — 키워드와 경쟁하지 않도록 분리(PM 지시 2026-07-17) */}
            <div style={{ position: 'absolute', top: 20, left: 32, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--accent)' }}>
              무게 {weightOf(heroTopic)}g
            </div>
            <div style={{ position: 'absolute', inset: 0, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
              {keywordsOf(heroTopic).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginBottom: 10, maxHeight: '2.6em', overflow: 'hidden' }}>
                  {keywordsOf(heroTopic).slice(0, 3).map((kw, i) => (
                    <span key={kw} style={{ fontSize: i === 0 ? 'clamp(22px,3vw,30px)' : 'clamp(16px,2.2vw,20px)', fontWeight: 800, color: i === 0 ? 'var(--accent)' : '#fff', lineHeight: 1.3 }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--accent)', marginBottom: 14 }}>
                오늘의 표지
              </div>
              <div style={{ fontSize: 'clamp(24px,3.2vw,38px)', fontWeight: 800, lineHeight: 1.28, maxWidth: 600 }}>
                {heroTopic.name}
              </div>
            </div>
          </Link>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sideTopics.map((t) => (
              <Link
                key={t.slug}
                href={`/topic/${t.slug}`}
                className="nj-cover-card"
                style={{
                  flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden',
                  background: topicGradient(t.category).bg,
                  border: `1px solid ${topicGradient(t.category).border}`,
                }}
              >
                <div style={{ position: 'absolute', top: 14, left: 18, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--muted)' }}>
                  {weightOf(t)}g
                </div>
                <div style={{ position: 'absolute', inset: 0, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  {keywordsOf(t).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginBottom: 6, maxHeight: '2.4em', overflow: 'hidden' }}>
                      {keywordsOf(t).slice(0, 2).map((kw, i) => (
                        <span key={kw} style={{ fontSize: i === 0 ? 'clamp(15px,2vw,18px)' : 13, fontWeight: 800, color: i === 0 ? 'var(--accent)' : '#fff', lineHeight: 1.3 }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.4 }}>{t.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* LIVING INDEX */}
      <section style={{ maxWidth: 1240, margin: '56px auto 0', padding: '0 32px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
          오늘의 무게 — 실시간 인덱스
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          {rankedAll.map((t, i) => (
            <Link
              key={t.slug}
              href={`/topic/${t.slug}`}
              className="nj-index-row"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 20px', borderBottom: i < rankedAll.length - 1 ? '1px solid rgba(243,239,230,.06)' : 'none',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: "'Pretendard'", fontWeight: 700, fontSize: 13 }}>
                <span style={{ color: '#605D54', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                {t.name}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* 모멘텀(▲/▼/🔥) 델타는 importance_score 시계열 추적이 필요 — 아직 미구현이라
                    거짓 수치를 보여주지 않고 중립 표시로 남겨둔다(§docs/newsjeoul-decision-log.md 참고 예정). */}
                <span style={{ color: 'var(--muted)' }}>—</span>
                <span style={{ color: 'var(--muted)' }}>{weightOf(t)}g</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* DISCOVERY FEED */}
      {discoveryCards.length > 0 && (
        <section style={{ maxWidth: 1240, margin: '56px auto 0', padding: '0 32px 90px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--violet)', marginBottom: 16 }}>
            오늘의 발견 — 연결된 궁금증
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gridAutoRows: 130, gap: 14 }}>
            {discoveryCards.map((d, i) => (
              <Link
                key={i}
                href={d.href}
                className="nj-discovery-card"
                style={{
                  gridColumn: `span ${d.colSpan}`, gridRow: `span ${d.rowSpan}`,
                  border: '1px solid rgba(243,239,230,.08)', background: 'rgba(243,239,230,.03)',
                  borderRadius: 16, padding: 18, flexDirection: 'column', justifyContent: 'flex-end', gap: 8,
                }}
              >
                <span style={{ fontSize: 10.5, fontWeight: 700, color: d.accent, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {d.kicker}
                </span>
                <span style={{ fontSize: d.colSpan === 2 && d.rowSpan === 2 ? 16 : 13.5, fontWeight: 800, lineHeight: 1.4 }}>
                  {d.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
