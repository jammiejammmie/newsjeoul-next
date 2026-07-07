import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import {
  getActiveTopics, getHomeTopicCards, getEntityConnectionChains, getEntityRelationEdges,
  buildChainFromEntity, getEmergingTopics, getRecentTimelineEvents, getTopEntitiesByType,
  getCategoryCounts,
} from '@/lib/topics'
import { getTodayInsights } from '@/lib/insights'
import { entityIcon } from '@/lib/icons'

export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // KST 오늘 00:00 → UTC 변환 (KST = UTC+9)
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(Date.now() + kstOffset)
  const todayKST = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()))
  const todayStart = new Date(todayKST.getTime() - kstOffset).toISOString()

  const [silenceRes, outletRes] = await Promise.all([
    supabase
      .from('stories')
      .select('id,title,silence_score,controversy_score,created_at,story_articles(article_id)')
      .gte('created_at', todayStart)
      .order('silence_score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('outlets').select('id', { count: 'exact', head: true }),
  ])
  return {
    silenceStories: silenceRes.data || [],
    totalOutlets: outletRes.count || 20,
  }
}

const BASE = 'https://newsjeoul.co.kr'

export async function generateMetadata(): Promise<Metadata> {
  const { silenceStories, totalOutlets } = await getData()
  const top = silenceStories[0]
  const reportingCount = top?.story_articles?.length || 0

  const ogImageUrl = top
    ? `${BASE}/og?type=silence` +
      `&title=${encodeURIComponent(top.title)}` +
      `&outlets=${reportingCount}` +
      `&total=${totalOutlets}`
    : `${BASE}/og?type=silence&title=뉴스저울&outlets=3&total=20`

  const desc = top
    ? `3분이면 오늘 세상을 이해할 수 있습니다 — "${top.title}" 외`
    : '3분이면 오늘 세상을 이해할 수 있습니다.'

  return {
    title: '뉴스저울 — 3분이면 오늘 세상을 이해합니다',
    description: desc,
    openGraph: {
      title: '뉴스저울 — 3분이면 오늘 세상을 이해합니다',
      description: desc,
      url: BASE,
      siteName: '뉴스저울',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: '뉴스저울 — 3분이면 오늘 세상을 이해합니다',
      description: desc,
      images: [ogImageUrl],
    },
  }
}

const labelStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 6,
}

const headingStyle: CSSProperties = {
  fontFamily: "'Noto Serif KR', serif",
  fontSize: 'clamp(18px, 2.5vw, 24px)',
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 20,
}

const TOP10_GROUPS: { type: string; title: string }[] = [
  { type: 'company', title: '오늘 가장 많이 연결된 기업' },
  { type: 'person', title: '오늘 가장 많이 연결된 인물' },
  { type: 'country', title: '오늘 가장 많이 등장한 국가' },
]

export default async function Home() {
  const { silenceStories, totalOutlets } = await getData()
  const [
    briefingTopics, topicCards, chains, chainEdges, insights, emergingTopics, timelineEvents,
    topCompanies, topPeople, topCountries, categories,
  ] = await Promise.all([
    getActiveTopics(5),
    getHomeTopicCards(5),
    getEntityConnectionChains(3),
    getEntityRelationEdges(30),
    getTodayInsights(5),
    getEmergingTopics(5),
    getRecentTimelineEvents(10),
    getTopEntitiesByType('company', 6),
    getTopEntitiesByType('person', 6),
    getTopEntitiesByType('country', 6),
    getCategoryCounts(8),
  ])
  const top10Lists = [topCompanies, topPeople, topCountries]

  const hasAnyContent = topicCards.length > 0 || silenceStories.length > 0
  const shareText = '뉴스저울 — 3분이면 오늘 세상을 이해할 수 있습니다.'

  return (
    <div className="nj-container">

      {/* HERO */}
      <div className="nj-hero">
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase',
          color: 'var(--muted)', marginBottom: 20,
        }}>
          뉴스저울
        </p>
        <h1 style={{
          fontFamily: "'Noto Serif KR', serif", fontSize: 'clamp(24px, 4vw, 44px)', fontWeight: 700,
          lineHeight: 1.5, color: 'var(--text)', maxWidth: 640,
        }}>
          3분이면<br />오늘 세상을 이해할 수 있습니다.
        </h1>
      </div>

      {/* ① 오늘 30초 브리핑 */}
      {briefingTopics.length > 0 && (
        <section style={{ marginTop: 40, marginBottom: 56 }}>
          <p style={labelStyle}>오늘 30초 브리핑</p>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 16, padding: '20px 24px' }}>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {briefingTopics.map((t: any) => (
                <li key={t.id}>
                  <Link href={`/topic/${t.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: 'var(--accent)', fontSize: 13 }}>•</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="#issues" style={{ display: 'inline-block', marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
              더 자세히 보기 →
            </Link>
          </div>
        </section>
      )}

      {/* ② 오늘의 발견 (구 AI Insight) — 뉴스저울 브랜드 전면화 */}
      {insights.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>뉴스저울 발견</p>
          <h2 style={headingStyle}>오늘의 발견</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((ins: any) => (
              <div key={ins.id} style={{
                background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14,
                padding: '18px 20px', borderLeft: '3px solid var(--accent)',
              }}>
                <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.7 }}>{ins.insight_text}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10 }}>데이터 기반 자동 분석 · 참고용</p>
        </section>
      )}

      {/* ③ 오늘 세상은 이렇게 움직였습니다 — 대표 기능 */}
      {chains.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>뉴스저울 연결 분석</p>
          <h2 style={headingStyle}>오늘 세상은 이렇게 움직였습니다</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chains.map((c: any, i: number) => (
              <div key={i} className="nj-chain" style={{ flexWrap: 'wrap' }}>
                {c.nodes.map((n: any, idx: number) => (
                  <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {idx > 0 && <span className="nj-chain-arrow">↓</span>}
                    <Link href={`/entity/${n.slug}`} style={{ textDecoration: 'none', fontSize: 14, fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? 'var(--text)' : 'var(--text2)' }}>
                      {n.name}
                    </Link>
                  </span>
                ))}
                {c.explanation && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', width: '100%', marginTop: 4 }}>{c.explanation}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ④ 오늘 가장 중요한 이슈 */}
      {topicCards.length > 0 && (
        <section id="issues" style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘 가장 중요한 이슈</p>
          <h2 style={headingStyle}>지금 세상은 이렇게 움직이고 있습니다</h2>
          <div className="nj-topic-grid">
            {topicCards.map((t: any) => (
              <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none' }}>
                <div className="nj-topic-card">
                  <div className="nj-topic-card-block" />
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{t.name}</p>
                  {(t.summary || t.description) && (
                    <p style={{
                      fontSize: 12, color: 'var(--text2)', lineHeight: 1.55,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {t.summary || t.description}
                    </p>
                  )}
                  {t.entityNames.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {t.entityNames.map((name: string) => (
                        <span key={name} style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
                          background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)',
                        }}>
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>근거 기사 {t.storyCount}건</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>전체 흐름 보기 →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <Link href="/topic" style={{
              display: 'inline-block', padding: '10px 24px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              color: 'var(--text)', border: '1px solid var(--border2)', textDecoration: 'none',
            }}>
              전체 이슈 보기 →
            </Link>
          </div>
        </section>
      )}

      {/* ⑤ 오늘 사람들이 놓친 뉴스 */}
      {silenceStories.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>뉴스저울 시그널</p>
          <h2 style={headingStyle}>오늘 사람들이 놓친 뉴스</h2>
          <div className="nj-silence-grid">
            {silenceStories.map((s: any) => {
              const reportingCount = s.story_articles?.length || 0
              return (
                <Link key={s.id} href={`/story/${s.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
                    padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <span style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 44, lineHeight: 1, color: 'var(--accent)' }}>
                      {s.silence_score}
                    </span>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{s.title}</p>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 'auto' }}>
                      중요도 대비 {totalOutlets}개 중 {reportingCount}개만 보도
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ⑥ 오늘 가장 많이 연결된 것 */}
      {top10Lists.some(l => l.length > 0) && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘의 랭킹</p>
          <h2 style={headingStyle}>오늘 가장 많이 연결된 것</h2>
          <div className="nj-top10-grid">
            {TOP10_GROUPS.map((g, i) => {
              const list = top10Lists[i]
              if (!list.length) return null
              return (
                <div key={g.type} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 12 }}>{g.title}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {list.map((e: any, rank: number) => {
                      const chain = buildChainFromEntity(e.id, chainEdges, 3)
                      return (
                        <div key={e.slug}>
                          <Link href={`/entity/${e.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--muted)', width: 16 }}>{rank + 1}</span>
                            <span>{entityIcon(g.type, e.name)}</span>
                            <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{e.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--accent)' }}>{e.count}</span>
                          </Link>
                          {chain ? (
                            <div style={{ marginLeft: 24, marginTop: 4, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                              {chain.slice(1).map((n: any, ni: number) => (
                                <span key={n.id} style={{ fontSize: 10, color: 'var(--muted)' }}>
                                  {ni === 0 ? '↳' : '→'} {n.name}
                                </span>
                              ))}
                            </div>
                          ) : e.reason ? (
                            <p style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 24, marginTop: 2, lineHeight: 1.5 }}>{e.reason}</p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ⑦ 분야별 세상 */}
      {categories.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>분야별 세상</p>
          <h2 style={headingStyle}>원하는 분야만 골라서 볼 수 있습니다</h2>
          <div className="nj-top10-grid">
            {categories.map((c: any) => (
              <div key={c.category} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 20px' }}>
                <Link href={`/category/${encodeURIComponent(c.category)}`} style={{ textDecoration: 'none' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
                    {c.category} <span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 400 }}>{c.count}건</span>
                  </p>
                </Link>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {c.preview.map((p: any) => (
                    <Link key={p.slug} href={`/topic/${p.slug}`} style={{ textDecoration: 'none' }}>
                      <p style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>· {p.name}</p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ⑧ 계속 읽게 만드는 구조 — 새롭게 떠오르는 Topic + 실시간 Timeline */}
      {emergingTopics.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘 새롭게 떠오르는 Topic</p>
          <h2 style={headingStyle}>🌱 이제 막 움직이기 시작한 이슈</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {emergingTopics.map((t: any) => (
              <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none', flexShrink: 0, width: 220 }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px', height: '100%' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>🌱 {t.name}</p>
                  {(t.summary || t.description) && (
                    <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{t.summary || t.description}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {timelineEvents.length > 0 && (
        <section style={{ marginBottom: 64 }}>
          <p style={labelStyle}>실시간 TIMELINE</p>
          <h2 style={headingStyle}>오늘 하루, 세상은 이렇게 흘렀습니다</h2>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            {timelineEvents.map((e: any, i: number) => (
              <div key={e.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                <Link href={`/topic/${e.topics.slug}`} style={{ textDecoration: 'none', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', cursive", fontSize: 15, color: 'var(--accent)',
                      background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 8,
                      padding: '4px 10px', flexShrink: 0,
                    }}>
                      {new Date(e.event_date).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{e.title}</p>
                      <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{e.topics.name}</p>
                    </div>
                  </div>
                </Link>
                {i < timelineEvents.length - 1 && (
                  <span style={{ color: 'var(--border2)', fontSize: 13, paddingLeft: 24 }}>↓</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {!hasAnyContent && (
        <div style={{ padding: '80px 0', color: 'var(--muted)', fontSize: 13 }}>
          오늘의 이슈를 정리하는 중입니다.
        </div>
      )}

      {/* Share */}
      {hasAnyContent && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 40, paddingBottom: 64 }}>
          <p style={{
            fontFamily: "'Noto Serif KR', serif", fontSize: 'clamp(14px, 1.8vw, 17px)',
            color: 'var(--text2)', lineHeight: 1.8, marginBottom: 24,
          }}>
            {shareText}
          </p>
          <ShareButtons url={BASE} text={shareText} />
        </div>
      )}

    </div>
  )
}
