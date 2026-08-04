import type { Metadata } from 'next'
import Link from 'next/link'
import { getActiveTopics, getDiscoveryCards, pickHeroTopic, isBriefTopic } from '@/lib/topics'
import { domainColors } from '@/lib/design-tokens'
import BriefBadge from '@/components/BriefBadge'

export const revalidate = 300

const BASE = 'https://newsjeoul.co.kr'
const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'
// generateMetadata()와 Home()이 같은 후보 풀을 보게 하는 상수(Hero 회전 결과가 갈리지 않도록).
const HOME_TOPIC_POOL = 41

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
  // 아래 Home()과 반드시 같은 limit을 써야 한다 — Hero가 4시간 단위 회전 + 카테고리 다양성으로
  // 선정되므로, 후보 풀이 다르면 OG 제목과 화면에 보이는 헤드가 서로 달라질 수 있다.
  const topics = await getActiveTopics(HOME_TOPIC_POOL)
  const top = pickHeroTopic(topics)
  const desc = top
    ? `오늘 세상은 "${top.name}" 쪽으로 기울어 있습니다.`
    : '3분이면 오늘 세상을 이해할 수 있습니다.'
  const ogImageUrl = `${BASE}/og?type=weight&title=${encodeURIComponent(top?.name || '뉴스저울')}`

  return {
    title: TAGLINE,
    description: desc,
    alternates: { canonical: BASE },
    openGraph: {
      title: TAGLINE, description: desc, url: BASE, siteName: '뉴스저울',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }], locale: 'ko_KR', type: 'website',
    },
    twitter: { card: 'summary_large_image', title: TAGLINE, description: desc, images: [ogImageUrl] },
  }
}

export default async function Home() {
  const [activeTopics, discoveryCards] = await Promise.all([
    // 주의: 이 41은 오래된 주석("active 약 41개")이 근거였지만 지금 active는 642건이다.
    // Hero 회전 후보(카테고리당 1개, 상위 6개)를 뽑기에는 상위 41건으로 충분해서 값은 유지한다.
    // generateMetadata()와 같은 값을 써야 헤드가 갈리지 않는다(HOME_TOPIC_POOL).
    getActiveTopics(HOME_TOPIC_POOL),
    getDiscoveryCards(),
  ])

  if (activeTopics.length === 0) {
    return (
      <div style={{ padding: '120px 32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        오늘의 이슈를 정리하는 중입니다.
      </div>
    )
  }

  // Hero는 실제 importance_score(Weight Engine) 1위 — getActiveTopics()가 이미 정렬해 넘겨준다.
  const heroTopic = pickHeroTopic(activeTopics)!
  const rest = activeTopics.filter((t) => t.slug !== heroTopic.slug)
  const sideTopics = rest.slice(0, 2)

  // Living Index는 목업과 동일하게 히어로/사이드 포함 전체를 순위대로 다시 나열한다.
  const rankedAll = [heroTopic, ...rest]

  const weightOf = (t: (typeof activeTopics)[number]) => Math.round(t.importance_score ?? 0)
  // PM 지시(2026-07-17) — 제목을 다 읽기 전에 3초 안에 파악하게 하는 강조 키워드.
  // 아직 display_keywords를 만든 적 없는(장문 미발행) Topic은 빈 배열 — 카드 레이아웃은 그대로 유지.
  const keywordsOf = (t: (typeof activeTopics)[number]) => (t.ai_context?.draft?.display_keywords || []) as string[]

  // 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19) — 카드를 채울 실제 정보.
  const storyCountOf = (t: (typeof activeTopics)[number]) => (t as any).topic_stories?.[0]?.count ?? 0
  const summaryOf = (t: (typeof activeTopics)[number]) => t.ai_context?.draft?.lead || t.summary || ''
  // "왜 중요한가"는 임의 문구가 아니라 Weight Engine이 실제로 계산한 근거(ai_context.weight.reasons)를
  // 그대로 쓴다 — 근거 없는 숫자를 만들지 않는다는 원칙과 동일하게 적용.
  const whyItMattersOf = (t: (typeof activeTopics)[number]) => ((t.ai_context?.weight?.reasons || []) as string[]).slice(0, 2).join(' · ')
  function timeAgo(iso: string | null) {
    if (!iso) return ''
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
    if (mins < 60) return `${mins}분 전`
    const hours = Math.round(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    return `${Math.round(hours / 24)}일 전`
  }

  return (
    <div style={{ fontFamily: "'Pretendard',-apple-system,sans-serif" }}>
      {/* 상단 라이브 표시줄 */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '14px 32px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
          <span className="nj-live-dot" />
          오늘 {activeTopics.length}개의 세계가 열려 있습니다
        </div>
      </div>

      {/* COVER ROTATION HERO — 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19).
          더 이상 이미지 공간을 전제로 한 고정 높이가 없다 — 카드는 내용 길이만큼만 커진다. */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 32px 0' }}>
        <div className="nj-hero-grid">
          <Link
            href={`/topic/${heroTopic.slug}`}
            className="nj-cover-card"
            style={{
              position: 'relative', borderRadius: 20, overflow: 'hidden', padding: '28px 32px',
              background: topicGradient(heroTopic.category).bg,
              border: `1px solid ${topicGradient(heroTopic.category).border}`,
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 18, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--accent)' }}>
              <span>무게 {weightOf(heroTopic)}g</span>
              {heroTopic.category && <><span style={{ color: 'var(--muted)' }}>·</span><span style={{ color: 'var(--muted)' }}>{heroTopic.category}</span></>}
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>{timeAgo(heroTopic.updated_at)}</span>
              <span style={{ color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)' }}>관련 보도 {storyCountOf(heroTopic)}건</span>
            </div>
            {keywordsOf(heroTopic).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', marginBottom: 14 }}>
                {keywordsOf(heroTopic).slice(0, 3).map((kw, i) => (
                  <span key={kw} style={{ fontSize: i === 0 ? 'clamp(22px,3vw,30px)' : 'clamp(16px,2.2vw,20px)', fontWeight: 800, color: i === 0 ? 'var(--accent)' : '#fff', lineHeight: 1.3 }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 'clamp(28px,3.8vw,44px)', fontWeight: 800, lineHeight: 1.24, marginBottom: 16 }}>
              {heroTopic.name}
            </div>
            {summaryOf(heroTopic) && (
              <p style={{ fontSize: 15.5, color: 'var(--text2, #cfcac0)', lineHeight: 1.7, marginBottom: 12, maxWidth: 620 }}>
                {summaryOf(heroTopic)}
              </p>
            )}
            {whyItMattersOf(heroTopic) && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--accent)', fontWeight: 700 }}>왜 중요한가 · </strong>{whyItMattersOf(heroTopic)}
              </div>
            )}
          </Link>
          <div className="nj-hero-side-col">
            {sideTopics.map((t) => (
              <Link
                key={t.slug}
                href={`/topic/${t.slug}`}
                className="nj-cover-card"
                style={{
                  position: 'relative', borderRadius: 16, overflow: 'hidden', padding: '18px 20px',
                  background: topicGradient(t.category).bg,
                  border: `1px solid ${topicGradient(t.category).border}`,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginBottom: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--muted)' }}>
                  <span style={{ color: 'var(--accent)' }}>{weightOf(t)}g</span>
                  {t.category && <><span>·</span><span>{t.category}</span></>}
                  <span>·</span>
                  <span>보도 {storyCountOf(t)}건</span>
                  {/* 단문 표시 — 이 메타 줄이 이미 무게·카테고리·보도수를 담고 있어, 분량 정보도
                      같은 줄에 두는 편이 카드 레이아웃을 흔들지 않는다. */}
                  {isBriefTopic(t) && <BriefBadge size="sm" />}
                </div>
                {keywordsOf(t).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginBottom: 6 }}>
                    {keywordsOf(t).slice(0, 2).map((kw, i) => (
                      <span key={kw} style={{ fontSize: i === 0 ? 'clamp(15px,2vw,18px)' : 13, fontWeight: 800, color: i === 0 ? 'var(--accent)' : '#fff', lineHeight: 1.3 }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.4, marginBottom: 8 }}>{t.name}</div>
                {summaryOf(t) && (
                  <p style={{ fontSize: 12.5, color: 'var(--text2, #cfcac0)', lineHeight: 1.6, marginBottom: whyItMattersOf(t) ? 6 : 0 }}>
                    {summaryOf(t).slice(0, 70)}{summaryOf(t).length > 70 ? '…' : ''}
                  </p>
                )}
                {whyItMattersOf(t) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{whyItMattersOf(t).slice(0, 60)}</div>
                )}
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
                {isBriefTopic(t) && <BriefBadge size="sm" />}
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
