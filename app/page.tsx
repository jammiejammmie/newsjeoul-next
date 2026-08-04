import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getHomeCandidates, getTopicsBySlugs, getActiveTopicCount,
  pickHeroTopic, pickSideTopics, diversifyForIndex, isBriefTopic, getFeatureReads,
} from '@/lib/topics'
import { domainColors } from '@/lib/design-tokens'
import { ALL_HUBS } from '@/lib/hubs'
import { getIndexCounts, getRankDeltas, getUpcomingEvents, getMostReadTopics } from '@/lib/home-modules'
import BriefBadge from '@/components/BriefBadge'

export const revalidate = 300

const BASE = 'https://newsjeoul.co.kr'
const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'
// Hero·사이드 카드·인덱스가 모두 이 후보 풀에서 나온다. 300건인 이유는 lib/topics.ts
// getHomeCandidates 주석 참고 — Hero 신선도 요건과 인덱스 다양성 상한을 적용하면 후보가 크게
// 줄어들어서(41건에 적용하니 11건만 남았다) 넓은 풀이 필요하다. 경량 조회라 약 190KB다.
// generateMetadata()와 Home()이 같은 값을 써야 OG 제목과 화면 헤드가 갈리지 않는다.
const HOME_CANDIDATE_POOL = 300

// 2a 카테고리 네비 — 설계서 §1.3의 재편 기준("사람이 검색창에 치는가")을 반영해 기존
// 정치·경제·사회 대신 실제 카테고리 값과 허브 분야를 섞어 노출한다.
// 링크는 실재하는 라우트만 쓴다 — 없는 페이지로 보내면 404가 쌓인다.
const HOME_CATEGORY_NAV = [
  { label: 'IT·기술', href: '/category/Technology' },
  { label: '경제', href: '/category/Economy' },
  { label: '사회', href: '/category/Society' },
  { label: '과학', href: '/category/Science' },
  { label: '비즈니스', href: '/category/Business' },
  { label: '건강', href: '/category/Health' },
  { label: '문화', href: '/category/Entertainment' },
  { label: '전체 이슈', href: '/topic' },
]

// 도메인(카테고리)별 그라디언트 배경 — Cover Rotation 카드용. domainColors에 없는 카테고리는
// 중립 스톤 톤으로 폴백(색이 없다고 카드가 비어 보이지 않게).
// v6 라이트 전환: 카드 배경을 카테고리 색의 아주 옅은 틴트로 바꿨다.
// v5는 다크 잉크(rgba(11,11,13,.75))로 어둡게 깔고 흰 텍스트를 올렸는데, 밝은 배경에서는
// 카드만 검게 떠서 페이지와 분리돼 보인다. 종이 톤에서는 옅은 틴트 + 잉크 텍스트가 맞다.
function topicGradient(category: string | null) {
  const c = category ? domainColors[category] : undefined
  const base = c || '#8B887E'
  return {
    bg: `linear-gradient(155deg, ${base}14, #FFFFFF 70%)`,
    border: `${base}55`,
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
  // 2a 6개 모듈은 전부 실제 쿼리에서 값을 받는다. 비면 그 모듈을 숨긴다 —
  // 숫자를 만들어 채우면 시안과 똑같아 보이지만 전부 거짓이 된다.
  const [candidates, activeTopicCount, indexCounts, rankDeltas, upcoming, mostRead] = await Promise.all([
    getHomeCandidates(HOME_CANDIDATE_POOL),
    getActiveTopicCount(),
    getIndexCounts(),      // ① 색인 카운터
    getRankDeltas(10),     // ② 순위 변동 (ai_context.weight_history)
    getUpcomingEvents(6),  // ③ 캘린더 (upcoming_events)
    getMostReadTopics(6),  // ⑤ 조회수 (topic_reads)
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

  // 읽을 거리 · 기획과 해설 — 시안의 3층 구조(형식 라벨 + 후킹 문장 + 얻는 것).
  // 예전엔 getDiscoveryCards의 자동 조합을 썼는데 "…논란와 …취소, 무슨 상관이지?"처럼
  // 조사가 깨지고 클릭해서 얻는 것도 없었다(PM 지적 2026-08-05). 실제 발행 본문에서 뽑는다.
  const featureReads = await getFeatureReads({
    excludeTopicSlugs: [heroTopic.slug, ...sideTopics.map((t: any) => t.slug)],
    limit: 3,
  })

  // 2a 카테고리 4블록 — 시안의 'IT·AI / 경제·증시 / 건강 / 스포츠' 자리.
  // 실측 분포(2026-08-05): Society 354 · Technology 69 · Economy 61 · Business 58 · Entertainment 47.
  // Society가 압도적이라 그것만 담으면 4블록이 사실상 한 분야가 된다 — 그래서 분야를 고정하고
  // 각 분야에서 무게순 상위만 뽑는다. 토픽이 없는 분야는 블록 자체를 내린다(빈 칸을 두지 않는다).
  const CATEGORY_BLOCK_DEFS = [
    { label: 'IT·기술', href: '/category/Technology', match: ['Technology', 'Science', 'IT/보안', '산업/기술'] },
    { label: '경제·비즈니스', href: '/category/Economy', match: ['Economy', 'Business', 'Crypto', '경제/물가', '경제/기업', '경제/국제'] },
    { label: '사회', href: '/category/Society', match: ['Society', '사회', '사회/사고', '사회/사건사고', '사회/재난', '지역/행정'] },
    { label: '문화·건강', href: '/category/Entertainment', match: ['Entertainment', 'Health', 'Lifestyle', '스포츠'] },
  ]
  // 위쪽(급상승 스트립 + 히어로/사이드)에 이미 보인 토픽은 아래 목록에서 뺀다.
  // 스트립은 무게순 상위 8건이고 '더 많은 뉴스'도 무게순이라, 안 빼면 한 화면에서 같은 제목이
  // 두 번 보인다(실측: 스트립 8건 중 6건이 본문과 겹쳤다). 중복은 정보를 늘리지 않고
  // 페이지만 길어지게 한다 — PM이 지적한 "너무 많은 부분을 차지" 문제의 일부다.
  const shownInHero = new Set([
    heroTopic.slug,
    ...sideTopics.map((t: any) => t.slug),
    ...rankDeltas.slice(0, 8).map((d) => d.slug),
  ])
  const categoryBlocks = CATEGORY_BLOCK_DEFS.map((def) => ({
    label: def.label,
    href: def.href,
    items: candidates
      .filter((t: any) => def.match.includes(t.category) && !shownInHero.has(t.slug))
      .slice(0, 4),
  })).filter((b) => b.items.length > 0)

  // 더 많은 뉴스 — 카테고리 블록·히어로에 이미 나온 것은 빼고 다양성 정렬 순서를 따른다.
  // 예전 무게 인덱스는 rankedAll 25건 전부를 큰 카드로 깔았다(약 1,100px).
  const shownAbove = new Set([...shownInHero, ...categoryBlocks.flatMap((b) => b.items.map((t: any) => t.slug))])
  const moreNews = rankedAll.filter((t: any) => !shownAbove.has(t.slug)).slice(0, 12)

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
      {/* 2a 유틸리티 바 — 시안의 다크 상단 띠. ① 색인 카운터가 여기 들어간다.
          시안의 "오늘 색인 12,481건"을 실제 published 카운트로 채웠다(getIndexCounts). */}
      <div style={{ background: 'var(--text)', color: 'var(--bg)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', height: 32, display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, fontWeight: 500 }}>
          <span className="nj-live-dot" />
          <span>색인 <b style={{ fontWeight: 800 }}>{indexCounts.published.toLocaleString('ko-KR')}</b>건</span>
          <span style={{ opacity: .4 }}>|</span>
          <span>추적 중 <b style={{ fontWeight: 800 }}>{activeTopicCount.toLocaleString('ko-KR')}</b>건</span>
          {indexCounts.todayPublished > 0 && (
            <>
              <span style={{ opacity: .4 }}>|</span>
              <span>오늘 <b style={{ fontWeight: 800, color: '#FF8A9B' }}>+{indexCounts.todayPublished}</b></span>
            </>
          )}
          <span style={{ opacity: .4 }}>|</span>
          <Link href="/topic" style={{ color: 'inherit', opacity: .85 }}>전체 이슈</Link>
          <span style={{ opacity: .4 }}>|</span>
          <Link href="/hub/galaxy-z-fold8" style={{ color: 'inherit', opacity: .85 }}>토픽 허브</Link>
        </div>
      </div>

      {/* 2a 마스트헤드 + 카테고리 네비 */}
      <div style={{ borderBottom: '1px solid var(--text)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 32px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--text)' }}>뉴스저울</Link>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>검색해서 찾는 것들을 한 페이지에 모읍니다</span>
        </div>
        <nav style={{ maxWidth: 1240, margin: '0 auto', padding: '0 32px', display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {HOME_CATEGORY_NAV.map((c) => (
            <Link key={c.label} href={c.href} style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px 12px', color: 'var(--text)' }}>{c.label}</Link>
          ))}
        </nav>
      </div>

      {/* 2a 급상승 스트립 — ② 순위 변동. 시안의 ▲6 ▼1 NEW를 실제 값으로 채웠다.
          ai_context.weight_history는 update-topic-weight-background가 무게를 재계산할 때마다
          {grams, computed_at}을 append한다. 여기 델타는 그 이력의 마지막 두 값 차이다 —
          만들어낸 숫자가 아니라 Weight Engine이 실제로 계산한 변화량이다.
          이력이 1개뿐이면 비교 대상이 없으므로 NEW로 표시한다(0으로 속이지 않는다). */}
      {rankDeltas.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--text)' }}>
          <div className="nj-surge-grid" style={{ maxWidth: 1240, margin: '0 auto' }}>
            {rankDeltas.slice(0, 8).map((d, i) => (
              <Link key={d.slug} href={`/topic/${d.slug}`}
                style={{
                  // 시안은 1위 칸만 다크로 반전시켜 시선을 잡는다.
                  background: i === 0 ? 'var(--text)' : 'var(--bg)',
                  padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
                }}>
                <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1, color: i === 0 ? '#FF8A9B' : d.direction === 'down' ? 'var(--link)' : d.direction === 'flat' ? 'var(--muted)' : 'var(--accent)' }}>
                  {i === 0 ? '급상승 1'
                    : d.direction === 'up' ? `▲${d.delta}`
                    : d.direction === 'down' ? `▼${Math.abs(d.delta ?? 0)}`
                    : d.direction === 'new' ? 'NEW' : '–'}
                </span>
                <span style={{
                  fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, color: i === 0 ? 'var(--bg)' : 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {d.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 2a 2단 셸 — 본문 + 우측 레일.
          이전엔 전폭 섹션을 쌓았고 그 중 '오늘의 무게 인덱스'가 25행(약 1,100px)으로 화면을
          독점했다(PM 지적 2026-08-05). 시안 2a는 본문/레일 2단이고 무게 인덱스 같은 대형
          블록이 없다 — 카테고리 4블록·기획 3-up·컴팩트 목록으로 나눠 담는다. */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '18px 32px 80px' }}>
        <div className="nj-home-shell">
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 34 }}>

      {/* COVER ROTATION HERO — 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19).
          더 이상 이미지 공간을 전제로 한 고정 높이가 없다 — 카드는 내용 길이만큼만 커진다. */}
      <section>
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
                  <span key={kw} style={{ fontSize: i === 0 ? 'clamp(22px,3vw,30px)' : 'clamp(16px,2.2vw,20px)', fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text)', lineHeight: 1.3 }}>
                    {kw}
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 'clamp(28px,3.8vw,44px)', fontWeight: 800, lineHeight: 1.24, marginBottom: 16 }}>
              {heroTopic.name}
            </div>
            {summaryOf(heroTopic) && (
              <p style={{ fontSize: 15.5, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12, maxWidth: 620 }}>
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
                      <span key={kw} style={{ fontSize: i === 0 ? 'clamp(15px,2vw,18px)' : 13, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text)', lineHeight: 1.3 }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.4, marginBottom: 8 }}>{t.name}</div>
                {summaryOf(t) && (
                  <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: whyItMattersOf(t) ? 6 : 0 }}>
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

      {/* 2a 카테고리 4블록 — 시안의 'IT·AI / 경제·증시 / 건강 / 스포츠' 자리.
          무게 인덱스 25행을 대신한다. 같은 정보를 분야로 쪼개면 독자가 자기 관심사만
          골라 읽을 수 있고, 한 블록이 화면을 독점하지 않는다. */}
      {categoryBlocks.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '2px solid var(--text)', paddingBottom: 7 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>분야별 지금</h2>
            <Link href="/topic" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--link)' }}>전체 이슈 →</Link>
          </div>
          <div className="nj-cat-grid" style={{ borderBottom: '1px solid var(--border)' }}>
            {categoryBlocks.map((block) => (
              <div key={block.label} style={{ background: 'var(--bg)', padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <Link href={block.href} style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{block.label}</Link>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {block.items.map((t: any, i: number) => (
                    <Link key={t.slug} href={`/topic/${t.slug}`}
                      style={{
                        fontSize: 13, fontWeight: 500, lineHeight: 1.45, padding: '6px 0',
                        borderTop: i === 0 ? 'none' : '1px dotted var(--border)',
                      }}>
                      {t.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2a 기획·해설 3-up — 시안의 '읽을 거리 · 기획과 해설'.
          시안의 3층 구조를 그대로 따른다:
            형식 라벨(기획 · 3부작)  →  후킹 제목  →  얻는 것(구매 타이밍까지)
          예전엔 getDiscoveryCards의 자동 조합이라 "…논란와 …취소, 무슨 상관이지?"처럼
          조사가 깨지고, 클릭해서 무엇을 얻는지가 없었다(PM 지적 2026-08-05).
          지금은 발행 본문의 lead 첫 문장을 후킹으로, display_keywords를 '얻는 것'으로 쓴다. */}
      {featureReads.length > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
              읽을 거리 <span style={{ fontWeight: 500, color: 'var(--muted)' }}>· 기획과 해설</span>
            </h2>
            <Link href="/topic" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--link)' }}>전체 기획 →</Link>
          </div>
          <div className="nj-feature-3up">
            {featureReads.map((f) => (
              <Link key={f.slug} href={`/topic/${f.slug}`} className="nj-discovery-card"
                style={{
                  border: '1px solid var(--border)', background: 'var(--card)',
                  padding: '15px 16px 16px', flexDirection: 'column', gap: 7, minHeight: 150,
                }}>
                {/* 1층 — 형식 라벨. 무엇을 읽게 되는지(기획/해설/데이터)와 분량(관점 수). */}
                <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accent)', letterSpacing: '.04em' }}>
                  {f.kicker}
                </span>
                {/* 2층 — 제목. */}
                <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-.01em' }}>
                  {f.name}
                </span>
                {/* 3층 — 후킹 문장. lead의 첫 문장이라 숫자·장면이 살아 있다. */}
                <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.6, color: 'var(--text2)', flex: 1 }}>
                  {f.hook}
                </span>
                {/* 얻는 것 — 클릭 전에 무엇을 다루는지 보여준다. */}
                {f.payoff.length > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', paddingTop: 7, borderTop: '1px dotted var(--border)' }}>
                    {f.payoff.join(' · ')}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 2a 더 많은 뉴스 — 시안의 마지막 본문 블록.
          예전 '오늘의 무게 인덱스'가 이 역할이었는데 25행 카드 목록으로 화면을 독점했다.
          같은 데이터를 한 줄 목록으로 압축하고 무게만 우측에 붙인다. */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 2 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            더 많은 뉴스 <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--muted)' }}>무게순</span>
          </h2>
          <Link href="/topic" style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--link)' }}>전체 →</Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {moreNews.map((t, i) => (
            <Link key={t.slug} href={`/topic/${t.slug}`} className="nj-index-row"
              style={{
                display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', gap: 10,
                alignItems: 'baseline', padding: '9px 0', borderBottom: '1px dotted var(--border)',
              }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--muted)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.45, display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                {t.name}
                {isBriefTopic(t) && <BriefBadge size="sm" />}
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: 'var(--muted)' }}>
                {weightOf(t)}g
              </span>
            </Link>
          ))}
        </div>
      </section>

        </div>{/* /본문 */}

        {/* 2a 우측 레일 — 캘린더·계산기·많이 본. 시안과 같은 위치다.
            구독 폼은 PM 지시(2026-08-05)로 홈에서 내렸다. 컴포넌트와 /api/subscribe는
            그대로 남겨둔다 — 발송 경로가 준비되면 다시 붙인다. */}
        <aside className="nj-home-rail">
          {/* 추적 중인 허브 — 시안의 '오늘 나온 신제품' 자리.
              신제품 데이터가 따로 없으므로 실제로 운영 중인 허브를 넣는다(없는 데이터를
              만들지 않고, 이 자리의 역할인 '검색해서 찾는 실체'는 그대로 채운다). */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 8 }}>
              추적 중인 허브
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ALL_HUBS.map((h) => (
                <Link key={h.slug} href={`/hub/${h.slug}`}
                  style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 0', borderBottom: '1px dotted var(--border)' }}>
                  {h.title}
                </Link>
              ))}
            </div>
          </div>

          {/* 출시·마감 캘린더 — extract-upcoming-events-background가 채운다 */}
          {upcoming.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 8 }}>출시·마감 캘린더</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcoming.map((e) => (
                  <Link key={e.id} href={e.topicSlug ? `/topic/${e.topicSlug}` : '/topic'}
                    style={{ display: 'grid', gridTemplateColumns: '48px minmax(0,1fr) auto', gap: 8, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px dotted var(--border)' }}>
                    <b style={{ fontSize: 11.5, fontWeight: 800 }}>{e.date.slice(5).replace('-', '.')}</b>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{e.title}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: e.daysLeft <= 7 ? 'var(--accent)' : 'var(--muted)' }}>
                      {e.daysLeft === 0 ? '오늘' : `D-${e.daysLeft}`}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 비교표·계산기 */}
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 8 }}>비교표·계산기</div>
            <Link href="/tools/ev-subsidy"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', padding: '10px 11px' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>전기차 보조금 계산기</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)' }}>→</span>
            </Link>
          </div>

          {/* 많이 본 뉴스 24시간 — ReadTracker 비콘이 채운다 */}
          {mostRead.length > 0 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7, marginBottom: 8 }}>
                많이 본 뉴스 <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>· 24시간</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {mostRead.map((r, i) => (
                  <Link key={r.slug} href={`/topic/${r.slug}`}
                    style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: 8, alignItems: 'baseline', padding: '7px 0', borderBottom: '1px dotted var(--border)' }}>
                    <b style={{ fontSize: 11.5, fontWeight: 800, color: i < 3 ? 'var(--accent)' : 'var(--muted)' }}>{i + 1}</b>
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{r.views}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
        </div>{/* /nj-home-shell */}
      </div>

      {/* 2a 하단 SEO 색인 블록 — 홈의 역할 중 하나가 "내부링크 허브"다(설계서 §2 표).
          검색엔진과 독자 모두에게 이 사이트가 무엇을 다루는지 한눈에 보여준다. */}
      <section style={{ borderTop: '1px solid var(--text)', background: 'var(--bg2)', marginTop: 56 }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 32px 64px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 28 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 6, marginBottom: 8 }}>토픽 허브</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {ALL_HUBS.map((h) => (
                <Link key={h.slug} href={`/hub/${h.slug}`} style={{ fontSize: 12.5, fontWeight: 500 }}>{h.title}</Link>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 6, marginBottom: 8 }}>분야별 이슈</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 10px' }}>
              {HOME_CATEGORY_NAV.map((c) => (
                <Link key={c.label} href={c.href} style={{ fontSize: 12.5, fontWeight: 500 }}>{c.label}</Link>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 6, marginBottom: 8 }}>지금 추적 중인 이슈</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rankedAll.slice(0, 10).map((t) => (
                <Link key={t.slug} href={`/topic/${t.slug}`} style={{ fontSize: 12.5, fontWeight: 500 }}>{t.name}</Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
