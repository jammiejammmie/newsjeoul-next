import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { getHomeTopicCards, getEntityConnectionChains, getEmergingTopics, getRecentTimelineEvents, getTopEntitiesByType } from '@/lib/topics'
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
    ? `${totalOutlets}개 언론사 중 ${reportingCount}개만 보도 — "${top.title}"`
    : '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?'

  return {
    title: '뉴스저울 — 세상이 연결되는 방식',
    description: desc,
    openGraph: {
      title: '뉴스저울 — 세상이 연결되는 방식',
      description: desc,
      url: BASE,
      siteName: '뉴스저울',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: '뉴스저울 — 세상이 연결되는 방식',
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
  { type: 'company', title: '오늘 가장 많이 연결되는 기업' },
  { type: 'person', title: '오늘 가장 많이 연결되는 인물' },
  { type: 'country', title: '오늘 가장 많이 등장한 국가' },
]

export default async function Home() {
  const { silenceStories, totalOutlets } = await getData()
  const [topicCards, chains, insights, emergingTopics, timelineEvents, topCompanies, topPeople, topCountries] = await Promise.all([
    getHomeTopicCards(12),
    getEntityConnectionChains(3),
    getTodayInsights(5),
    getEmergingTopics(5),
    getRecentTimelineEvents(10),
    getTopEntitiesByType('company', 8),
    getTopEntitiesByType('person', 8),
    getTopEntitiesByType('country', 8),
  ])
  const top10Lists = [topCompanies, topPeople, topCountries]

  const hasAnyContent = topicCards.length > 0 || silenceStories.length > 0
  const shareText = '뉴스저울 — 오늘 세상이 어떻게 움직이는지 연결해서 보여줍니다.'

  return (
    <div className="nj-container">

      {/* HERO */}
      <div className="nj-hero">
        <p style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.18em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 20,
        }}>
          뉴스저울
        </p>
        <h1 style={{
          fontFamily: "'Noto Serif KR', serif",
          fontSize: 'clamp(24px, 4vw, 48px)',
          fontWeight: 700,
          lineHeight: 1.5,
          color: 'var(--text)',
          maxWidth: 640,
        }}>
          모든 뉴스에는<br />
          당신이 못 본 절반이 있습니다.
        </h1>
      </div>

      {/* 뉴스저울 Insight — 홈 최상단 핵심 영역 */}
      {insights.length > 0 && (
        <section style={{ marginTop: 40, marginBottom: 56 }}>
          <p style={labelStyle}>뉴스저울 INSIGHT</p>
          <h2 style={headingStyle}>오늘 세상에서 가장 중요한 변화</h2>
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
        </section>
      )}

      {/* 오늘 움직이는 이슈 */}
      {topicCards.length > 0 && (
        <section id="issues" style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘 움직이는 이슈</p>
          <h2 style={headingStyle}>지금 세상은 이렇게 움직이고 있습니다</h2>
          <div className="nj-topic-grid">
            {topicCards.map((t: any) => (
              <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none' }}>
                <div className="nj-topic-card">
                  <div className="nj-topic-card-block" />
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
                    {t.name}
                  </p>
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
                  <div style={{
                    marginTop: 'auto', paddingTop: 8, display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      근거 기사 {t.storyCount}건
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
                      전체 흐름 보기 →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 오늘의 침묵지수 */}
      {silenceStories.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘의 침묵지수</p>
          <h2 style={headingStyle}>언론이 덜 비춘 이슈</h2>
          <div className="nj-silence-grid">
            {silenceStories.map((s: any) => {
              const reportingCount = s.story_articles?.length || 0
              return (
                <Link key={s.id} href={`/story/${s.id}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16,
                    padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', cursive", fontSize: 44, lineHeight: 1, color: 'var(--accent)',
                    }}>
                      {s.silence_score}
                    </span>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                      {s.title}
                    </p>
                    <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 'auto' }}>
                      {totalOutlets}개 언론사 중 {reportingCount}개만 보도
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 세상은 이렇게 연결됩니다 */}
      {chains.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>뉴스저울이 보는 연결</p>
          <h2 style={headingStyle}>세상은 이렇게 연결됩니다</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chains.map((c: any, i: number) => (
              <div key={i} className="nj-chain">
                {c.nodes.map((n: any, idx: number) => (
                  <span key={n.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {idx > 0 && <span className="nj-chain-arrow">→</span>}
                    <Link href={`/entity/${n.slug}`} style={{ textDecoration: 'none', fontSize: 13, fontWeight: idx === 0 ? 700 : 500, color: idx === 0 ? 'var(--text)' : 'var(--text2)' }}>
                      {n.name}
                    </Link>
                  </span>
                ))}
                {c.explanation && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>— {c.explanation}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 오늘 가장 많이 연결되는 기업/인물/국가 TOP10 */}
      {top10Lists.some(l => l.length > 0) && (
        <section style={{ marginBottom: 56 }}>
          <p style={labelStyle}>오늘의 랭킹</p>
          <h2 style={headingStyle}>오늘 가장 많이 연결된 것들</h2>
          <div className="nj-top10-grid">
            {TOP10_GROUPS.map((g, i) => {
              const list = top10Lists[i]
              if (!list.length) return null
              return (
                <div key={g.type} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 12 }}>{g.title}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {list.map((e: any, rank: number) => (
                      <Link key={e.slug} href={`/entity/${e.slug}`} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)', width: 16 }}>{rank + 1}</span>
                        <span>{entityIcon(g.type, e.name)}</span>
                        <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{e.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--accent)' }}>{e.count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 오늘 새롭게 떠오르는 Topic */}
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

      {/* 실시간 Timeline */}
      {timelineEvents.length > 0 && (
        <section style={{ marginBottom: 64 }}>
          <p style={labelStyle}>실시간 TIMELINE</p>
          <h2 style={headingStyle}>오늘 하루, 세상은 이렇게 흘렀습니다</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '2px solid var(--border)', paddingLeft: 18 }}>
            {timelineEvents.map((e: any) => (
              <Link key={e.id} href={`/topic/${e.topics.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{ padding: '10px 0', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: -23, top: 15, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
                  <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {new Date(e.event_date).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {e.topics.name}
                  </span>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{e.title}</p>
                </div>
              </Link>
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
