'use client'

import { useState } from 'react'
import FeatureCard from '@/components/cards/variants/FeatureCard'
import NodeCard from '@/components/cards/variants/NodeCard'
import ConnectionCard from '@/components/cards/variants/ConnectionCard'
import WeightCard from '@/components/cards/variants/WeightCard'
import TimelineCard from '@/components/cards/variants/TimelineCard'
import ExploreDrawer from '@/components/drawer/ExploreDrawer'
import { DrawerBody, DrawerTags, DrawerArticles, DrawerNextQuestions } from '@/components/drawer/DrawerSection'
import { getTopicDrawerData, type TopicDrawerData } from '@/lib/drawer-data'
import { domainColors } from '@/lib/design-tokens'

export type GridCardDescriptor =
  | { kind: 'feature'; slug: string; domain: string; heatLabel: string; label: string; body: string }
  | { kind: 'weight'; slug: string; label: string; body: string }
  | { kind: 'connection'; slug: string; label: string; body: string }
  | { kind: 'node'; slug: string; domain: string; label: string; colSpan: number; rowSpan: number }

type TimelineEventItem = { time: string; title: string }

type HomeExplorerProps = {
  cards: GridCardDescriptor[]
  timelineEvents: TimelineEventItem[]
}

// 매거진 그리드 렌더 + 클릭 시 드로어를 여는 인터랙션 — 실데이터는 서버가 미리 내려주고,
// 클릭된 카드의 상세만 lib/drawer-data.ts 서버 액션으로 온디맨드 로드한다.
export default function HomeExplorer({ cards, timelineEvents }: HomeExplorerProps) {
  const [path, setPath] = useState<string[]>([])
  const [cache, setCache] = useState<Record<string, TopicDrawerData>>({})
  const [loading, setLoading] = useState(false)

  async function load(slug: string) {
    if (cache[slug]) return
    setLoading(true)
    const data = await getTopicDrawerData(slug)
    if (data) setCache((c) => ({ ...c, [slug]: data }))
    setLoading(false)
  }

  function openTopic(slug: string) {
    setPath([slug])
    load(slug)
  }

  function drillInto(slug: string) {
    setPath((p) => [...p, slug])
    load(slug)
  }

  const currentSlug = path[path.length - 1]
  const current = currentSlug ? cache[currentSlug] : undefined

  return (
    <>
      <div className="nj-magazine-grid">
        {cards.map((c) => {
          if (c.kind === 'feature') {
            return (
              <FeatureCard
                key={c.slug}
                href={`/topic/${c.slug}`}
                domain={c.domain}
                domainColor={domainColors[c.domain] || 'var(--accent)'}
                heatLabel={c.heatLabel}
                label={c.label}
                body={c.body}
                onClick={() => openTopic(c.slug)}
              />
            )
          }
          if (c.kind === 'weight') {
            return (
              <WeightCard
                key={c.slug}
                href={`/topic/${c.slug}`}
                label={c.label}
                body={c.body}
                onClick={() => openTopic(c.slug)}
              />
            )
          }
          if (c.kind === 'connection') {
            return (
              <ConnectionCard
                key={c.slug}
                href={`/topic/${c.slug}`}
                label={c.label}
                body={c.body}
                onClick={() => openTopic(c.slug)}
              />
            )
          }
          return (
            <NodeCard
              key={c.slug}
              href={`/topic/${c.slug}`}
              domain={c.domain}
              domainColor={domainColors[c.domain] || 'var(--accent)'}
              label={c.label}
              colSpan={c.colSpan}
              rowSpan={c.rowSpan}
              onClick={() => openTopic(c.slug)}
            />
          )
        })}
        {timelineEvents.length > 0 && <TimelineCard events={timelineEvents} />}
      </div>

      <ExploreDrawer
        open={path.length > 0}
        onClose={() => setPath([])}
        breadcrumb={path.map((slug, i) => ({
          label: cache[slug]?.title ?? '…',
          active: i === path.length - 1,
          onClick: () => setPath((p) => p.slice(0, i + 1)),
        }))}
        domain={current?.domain ?? undefined}
        domainColor={current?.domain ? domainColors[current.domain] : undefined}
        title={current?.title ?? (loading ? '불러오는 중…' : '')}
      >
        {current && (
          <>
            <DrawerBody text={current.body} />
            <DrawerTags tags={current.tags} />
            <DrawerArticles articles={current.articles.map((a) => ({ title: a.title, href: `/story/${a.id}` }))} />
            <DrawerNextQuestions
              items={current.related.map((r) => ({
                label: r.name,
                socialProof: r.explanation || '관련된 이슈입니다',
                onClick: () => drillInto(r.slug),
              }))}
            />
          </>
        )}
      </ExploreDrawer>
    </>
  )
}
