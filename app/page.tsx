import type { Metadata } from 'next'
import {
  getActiveTopics, getMostUnexpectedTopicPair, getRecentTimelineEvents, getRecentTopicUpdates,
} from '@/lib/topics'
import WeightHero from '@/components/home/WeightHero'
import HomeExplorer, { type GridCardDescriptor } from '@/components/home/HomeExplorer'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'

export async function generateMetadata(): Promise<Metadata> {
  const [top] = await getActiveTopics(1)
  const desc = top
    ? `오늘 세상은 "${top.name}" 쪽으로 기울어 있습니다.`
    : '3분이면 오늘 세상을 이해할 수 있습니다.'
  const ogImageUrl = top
    ? `${BASE}/og?type=weight&title=${encodeURIComponent(top.name)}`
    : `${BASE}/og?type=weight&title=${encodeURIComponent('뉴스저울')}`

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

const SPAN_CYCLE: [number, number][] = [[2, 1], [1, 1], [2, 1], [1, 1], [2, 1], [1, 1], [2, 1]]

export default async function Home() {
  const [activeTopics, connectionPair, timelineEventsRaw, recentUpdates] = await Promise.all([
    getActiveTopics(11),
    getMostUnexpectedTopicPair(),
    getRecentTimelineEvents(8),
    getRecentTopicUpdates(1),
  ])

  if (activeTopics.length === 0) {
    return (
      <div style={{ padding: '120px 32px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        오늘의 이슈를 정리하는 중입니다.
      </div>
    )
  }

  const heaviestTopic = activeTopics[0]
  const secondTopic = activeTopics[1] ?? activeTopics[0]

  const leftWeight = Math.round(secondTopic.importance_score ?? 0)
  const rightWeight = Math.round(heaviestTopic.importance_score ?? 0)
  const totalW = leftWeight + rightWeight || 1
  const beamAngle = ((rightWeight - leftWeight) / totalW) * -10
  const leftOrbSize = 34 + (rightWeight ? (leftWeight / rightWeight) * 44 : 0)
  const rightOrbSize = 34 + 44

  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

  const usedSlugs = new Set([heaviestTopic.slug])
  const cards: GridCardDescriptor[] = []

  cards.push({
    kind: 'feature', slug: heaviestTopic.slug, domain: heaviestTopic.category || '이슈',
    heatLabel: '오늘 가장 무거움', label: heaviestTopic.name,
    body: heaviestTopic.summary || '',
  })

  const latestUpdate = recentUpdates[0] as any
  if (latestUpdate) {
    cards.push({
      kind: 'weight',
      slug: latestUpdate.topics?.slug || heaviestTopic.slug,
      label: latestUpdate.title,
      body: '오늘 가장 최근에 업데이트된 소식입니다.',
    })
  }

  if (connectionPair) {
    const connSlug = connectionPair.target.slug !== heaviestTopic.slug
      ? connectionPair.target.slug
      : connectionPair.source.slug
    usedSlugs.add(connSlug)
    cards.push({
      kind: 'connection', slug: connSlug,
      label: `${connectionPair.source.name}와 ${connectionPair.target.name}, 무슨 상관이지?`,
      body: connectionPair.explanation || '서로 다른 분야지만 함께 연결되어 있습니다.',
    })
  }

  activeTopics.slice(1).filter((t) => !usedSlugs.has(t.slug)).forEach((t, i) => {
    const [colSpan, rowSpan] = SPAN_CYCLE[i % SPAN_CYCLE.length]
    cards.push({ kind: 'node', slug: t.slug, domain: t.category || '이슈', label: t.name, colSpan, rowSpan })
  })

  const timelineEvents = timelineEventsRaw.map((e: any) => ({
    time: new Date(e.event_date).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }),
    title: e.title,
  }))

  return (
    <>
      <WeightHero
        heaviestLabel={heaviestTopic.name}
        leftLabel={truncate(secondTopic.name, 14)}
        rightLabel={truncate(heaviestTopic.name, 14)}
        leftWeight={leftWeight}
        rightWeight={rightWeight}
        beamAngle={beamAngle}
        leftOrbSize={leftOrbSize}
        rightOrbSize={rightOrbSize}
      />

      <section style={{ padding: '24px 32px 96px' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto' }}>
          <HomeExplorer cards={cards} timelineEvents={timelineEvents} />
        </div>
      </section>
    </>
  )
}
