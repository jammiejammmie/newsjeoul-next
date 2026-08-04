import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getHomeCandidates, getTopicsBySlugs, getDiscoveryCards, getActiveTopicCount,
  pickHeroTopic, pickSideTopics, diversifyForIndex, isBriefTopic,
} from '@/lib/topics'
import { domainColors } from '@/lib/design-tokens'
import BriefBadge from '@/components/BriefBadge'

export const revalidate = 300

const BASE = 'https://newsjeoul.co.kr'
const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'
// Hero·사이드 카드·인덱스가 모두 이 후보 풀에서 나온다. 300건인 이유는 lib/topics.ts
// getHomeCandidates 주석 참고 — Hero 신선도 요건과 인덱스 다양성 상한을 적용하면 후보가 크게
// 줄어들어서(41건에 적용하니 11건만 남았다) 넓은 풀이 필요하다. 경량 조회라 약 190KB다.
// generateMetadata()와 Home()이 같은 값을 써야 OG 제목과 화면 헤드가 갈리지 않는다.
const HOME_CANDIDATE_POOL = 300

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
  // 아래 Home()과 반드시 같은 후보 풀·같은 함수를 써야 한다 — Hero가 4시간 단위 회전 +
  // 카테고리 다양성으로 선정되므로, 풀이 다르면 OG 제목과 화면 헤드가 서로 달라진다.
  // 여기서는 제목만 필요하므로 경량 조회로 충분하다(전체 ai_context를 받지 않는다).
  const topics = await getHomeCandidates(HOME_CANDIDATE_POOL)
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
  const [candidates, activeTopicCount] = await Promise.all([
    getHomeCandidates(HOME_CANDIDATE_POOL),
    getActiveTopicCount(),
  ])

  if (candidates.length === 0) {
    return (
      <div style={{ padding: '120px 32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        오늘의 이슈를 정리하는 중입니다.
      </div>
    )
  }

  // Hero와 사이드 카드(2·3번째)를 경량 후보 풀에서 고른다.
  // 사이드 카드는 예전에 rest.slice(0, 2) — 점수 2·3등 고정이었다. 그래서 Hero가 4시간마다
  // 바뀌어도 이 두 칸은 계속 같은 토픽이었다(PM 지시 (1)). 이제 Hero와 같은 4시간 버킷으로
  // 회전하고, Hero와 같은 주제 클러스터·같은 분야는 피한다.
  const heroPick = pickHeroTopic(candidates)
  const sidePicks = pickSideTopics(candidates, heroPick)

  // 본문 렌더링에 필요한 전체 데이터는 이 3건만 따로 조회한다(경량 풀에는 요약·키워드·보도수가 없다).
  const fullSlugs = [heroPick?.slug, ...sidePicks.map((t: any) => t.slug)].filter(Boolean) as string[]
  const fullTopics = await getTopicsBySlugs(fullSlugs)
  const heroTopic = fullTopics[0]
  const sideTopics = fullTopics.slice(1)

  if (!heroTopic) {
    return (
      <div style={{ padding: '120px 32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        오늘의 이슈를 정리하는 중입니다.
      </div>
    )
  }

  // 오늘의 무게 인덱스 — 예전엔 점수순 나열이라 같은 사안의 파편이 상단을 도배했다
  // (실측: 상위 41건 중 이란 관련 10건, PM 지시 (2)). 주제 클러스터당 최대 2건,
  // 카테고리당 최대 5건으로 제한해 고른다. Hero는 목록 맨 앞에 고정한다.
  // Hero를 seed로 넘겨 Hero의 주제·분야도 상한에 계산되게 한다 — 안 넘기면 Hero 포함 3건이
  // 같은 클러스터로 보일 수 있다.
  const indexPool = candidates.filter((t: any) => t.slug !== heroTopic.slug)
  const rankedAll = [heroTopic, ...diversifyForIndex(indexPool, { seed: [heroTopic] })]

  // 오늘의 발견 — 화면에 이미 나온 토픽은 제외해 같은 인물/사안이 반복되지 않게 한다(PM 지시 (3)).
  const discoveryCards = await getDiscoveryCards({
    excludeTopicSlugs: [heroTopic.slug, ...sideTopics.map((t: any) => t.slug)],
  })

  const weightOf = (t: any) => Math.round(t.importance_score ?? 0)
  // PM 지시(2026-07-17) — 제목을 다 읽기 전에 3초 안에 파악하게 하는 강조 키워드.
  // 아직 display_keywords를 만든 적 없는(장문 미발행) Topic은 빈 배열 — 카드 레이아웃은 그대로 유지.
  const keywordsOf = (t: any) => (t.ai_context?.draft?.display_keywords || []) as string[]

  // 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19) — 카드를 채울 실제 정보.
  const storyCountOf = (t: any) => (t as any).topic_stories?.[0]?.count ?? 0
  const summaryOf = (t: any) => t.ai_context?.draft?.lead || t.summary || ''
  // "왜 중요한가"는 임의 문구가 아니라 Weight Engine이 실제로 계산한 근거(ai_context.weight.reasons)를
  // 그대로 쓴다 — 근거 없는 숫자를 만들지 않는다는 원칙과 동일하게 적용.
  const whyItMattersOf = (t: any) => ((t.ai_context?.weight?.reasons || []) as string[]).slice(0, 2).join(' · ')
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
          오늘 {activeTopicCount}개의 세계가 열려 있습니다
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
