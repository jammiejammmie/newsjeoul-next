import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import ShareButtons from '@/components/ShareButtons'

export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [silenceRes, controversyRes, outletRes] = await Promise.all([
    supabase
      .from('stories')
      .select('id,title,silence_score,controversy_score,created_at,story_articles(article_id,articles(id,title,url,outlet_id,outlets(name)))')
      .order('silence_score', { ascending: false })
      .limit(10),
    supabase
      .from('stories')
      .select('id,title,silence_score,controversy_score,created_at,story_articles(article_id,articles(id,title,url,outlet_id,outlets(name)))')
      .order('controversy_score', { ascending: false })
      .limit(3),
    supabase.from('outlets').select('id', { count: 'exact', head: true }),
  ])
  return {
    silenceStories: silenceRes.data || [],
    controversyStories: controversyRes.data || [],
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
    title: '뉴스저울 — 당신이 못 본 절반',
    description: desc,
    openGraph: {
      title: '뉴스저울 — 당신이 못 본 절반',
      description: desc,
      url: BASE,
      siteName: '뉴스저울',
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: '뉴스저울 — 당신이 못 본 절반',
      description: desc,
      images: [ogImageUrl],
    },
  }
}

function getArticles(story: any) {
  return (story.story_articles || []).map((sa: any) => sa.articles).filter(Boolean)
}

/* ── Story card: shows two contrasting headlines side by side ── */
function StoryCard({ story }: { story: any }) {
  const articles = getArticles(story)
  const a = articles[0]
  const b = articles[1]

  return (
    <div
      id={`story-${story.id}`}
      style={{
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
        background: 'var(--card)',
      }}
    >
      {/* Story title */}
      <div style={{
        padding: '16px 20px 14px',
        borderBottom: '1px solid var(--border)',
      }}>
        <p style={{
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--text)',
          lineHeight: 1.55,
          fontFamily: "'Noto Serif KR', serif",
        }}>
          {story.title}
        </p>
      </div>

      {/* Two articles */}
      {a && b ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {[a, b].map((article, i) => {
            const isGoogle = article.url?.includes('news.google.com')
            return (
              <div
                key={article.id}
                style={{
                  padding: '14px 18px 16px',
                  borderRight: i === 0 ? '1px solid var(--border)' : 'none',
                }}
              >
                <p style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  letterSpacing: '.05em',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}>
                  {article.outlets?.name}
                </p>
                <p style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  lineHeight: 1.55,
                  marginBottom: 12,
                }}>
                  {article.title}
                </p>
                {!isGoogle && article.url && (
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      textDecoration: 'none',
                      borderBottom: '1px solid var(--border2)',
                      paddingBottom: 1,
                    }}
                  >
                    원문 →
                  </a>
                )}
              </div>
            )
          })}
        </div>
      ) : a ? (
        /* Single article fallback */
        <div style={{ padding: '14px 20px 16px' }}>
          <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            {a.outlets?.name}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.55 }}>
            {a.title}
          </p>
        </div>
      ) : null}
    </div>
  )
}

/* ── Silence score row for sidebar list ── */
function SilenceRow({ story, rank, totalOutlets }: { story: any; rank: number; totalOutlets: number }) {
  const reportingCount = story.story_articles?.length || 0
  return (
    <a
      href={`#story-${story.id}`}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid var(--border)',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <span style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: 13,
        color: 'var(--muted)',
        width: 16,
        flexShrink: 0,
        paddingTop: 2,
        textAlign: 'right',
      }}>
        {rank}
      </span>
      <p style={{
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text2)',
        lineHeight: 1.5,
        flex: 1,
      }}>
        {story.title}
      </p>
      <div style={{ flexShrink: 0, textAlign: 'right' }}>
        <div style={{
          fontFamily: "'Bebas Neue', cursive",
          fontSize: 18,
          color: 'var(--accent)',
          lineHeight: 1,
        }}>
          {story.silence_score}
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
          {reportingCount}/{totalOutlets}
        </div>
      </div>
    </a>
  )
}

export default async function Home() {
  const { silenceStories, controversyStories, totalOutlets } = await getData()

  const top = silenceStories[0]
  const topReportingCount = top?.story_articles?.length || 0
  const silenceRanking = silenceStories.slice(1)
  const hasContent = silenceStories.length > 0 || controversyStories.length > 0

  const shareText = '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?'

  return (
    <div className="nj-container">

      {/* HERO — full width, always ────────────────── */}
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

      {/* TWO-COLUMN LAYOUT (desktop) / single (mobile) */}
      <div className="nj-layout">

        {/* ── MAIN ─────────────────────────────────── */}
        <main className="nj-main">

          {/* Section: 같은 사건 완전히 다른 헤드라인 */}
          {controversyStories.length > 0 && (
            <section style={{ marginBottom: 56 }}>
              <div style={{ marginBottom: 24 }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: 6,
                }}>
                  오늘의 논쟁
                </p>
                <h2 style={{
                  fontFamily: "'Noto Serif KR', serif",
                  fontSize: 'clamp(18px, 2.5vw, 24px)',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}>
                  같은 사건 완전히 다른 헤드라인
                </h2>
              </div>
              {controversyStories.map((story: any) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </section>
          )}

          {/* Section: 당신이 놓쳤을 수 있는 시각 */}
          {silenceRanking.length > 0 && (
            <section style={{ marginBottom: 56 }}>
              <div style={{ marginBottom: 24 }}>
                <p style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '.14em',
                  textTransform: 'uppercase',
                  color: 'var(--muted)',
                  marginBottom: 6,
                }}>
                  내가 못 본 절반
                </p>
                <h2 style={{
                  fontFamily: "'Noto Serif KR', serif",
                  fontSize: 'clamp(18px, 2.5vw, 24px)',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}>
                  당신이 놓쳤을 수 있는 시각
                </h2>
              </div>
              {silenceRanking.map((story: any) => (
                <StoryCard key={story.id} story={story} />
              ))}
            </section>
          )}

          {/* Empty state */}
          {!hasContent && (
            <div style={{ padding: '80px 0', color: 'var(--muted)', fontSize: 13 }}>
              오늘의 뉴스가 준비 중입니다.
            </div>
          )}

          {/* Share */}
          {hasContent && (
            <div style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 48,
              paddingBottom: 64,
            }}>
              <p style={{
                fontFamily: "'Noto Serif KR', serif",
                fontSize: 'clamp(14px, 1.8vw, 17px)',
                color: 'var(--text2)',
                lineHeight: 1.8,
                marginBottom: 24,
              }}>
                {shareText}
              </p>
              <ShareButtons url="https://newsjeoul.co.kr" text={shareText} />
            </div>
          )}
        </main>

        {/* ── SIDEBAR ──────────────────────────────── */}
        <aside className="nj-sidebar">

          {/* 침묵 TOP1 card */}
          {top && (
            <div style={{
              border: '1px solid var(--border2)',
              borderRadius: 16,
              padding: 28,
              background: 'var(--card)',
              marginBottom: 32,
            }}>
              <p style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 16,
              }}>
                오늘의 침묵 뉴스
              </p>

              <p style={{
                fontFamily: "'Noto Serif KR', serif",
                fontSize: 15,
                fontWeight: 700,
                lineHeight: 1.65,
                color: 'var(--text)',
                marginBottom: 24,
              }}>
                {top.title}
              </p>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 24 }}>
                <span style={{
                  fontFamily: "'Bebas Neue', cursive",
                  fontSize: 56,
                  lineHeight: 1,
                  color: 'var(--accent)',
                }}>
                  {top.silence_score}
                </span>
                <div style={{ paddingBottom: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>침묵지수</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500 }}>
                    {totalOutlets}개 언론사 중<br />{topReportingCount}개만 보도
                  </div>
                </div>
              </div>

              <a
                href={`#story-${top.id}`}
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--text)',
                  color: 'var(--bg)',
                  textDecoration: 'none',
                  letterSpacing: '.03em',
                }}
              >
                확인하기 →
              </a>
            </div>
          )}

          {/* 침묵지수 순위 */}
          {silenceRanking.length > 0 && (
            <div>
              <p style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                color: 'var(--muted)',
                marginBottom: 4,
                paddingBottom: 12,
                borderBottom: '1px solid var(--border)',
              }}>
                침묵 순위
              </p>
              {silenceRanking.map((story: any, i: number) => (
                <SilenceRow
                  key={story.id}
                  story={story}
                  rank={i + 2}
                  totalOutlets={totalOutlets}
                />
              ))}
            </div>
          )}

        </aside>
      </div>
    </div>
  )
}
