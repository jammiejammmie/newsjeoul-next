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

export async function generateMetadata(): Promise<Metadata> {
  const { silenceStories, totalOutlets } = await getData()
  const top = silenceStories[0]
  const reportingCount = top?.story_articles?.length || 0
  const desc = top
    ? `${totalOutlets}개 언론사 중 ${reportingCount}개만 보도 — "${top.title}"`
    : '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?'
  return {
    title: '뉴스저울 — 당신이 못 본 절반',
    description: desc,
    openGraph: {
      title: '뉴스저울 — 당신이 못 본 절반',
      description: desc,
      url: 'https://newsjeoul.co.kr',
      siteName: '뉴스저울',
      images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: '뉴스저울 — 당신이 못 본 절반',
      description: desc,
      images: ['https://newsjeoul.co.kr/og-image.png'],
    },
  }
}

function getArticles(story: any) {
  return (story.story_articles || []).map((sa: any) => sa.articles).filter(Boolean)
}

export default async function Home() {
  const { silenceStories, controversyStories, totalOutlets } = await getData()

  const top = silenceStories[0]
  const topReportingCount = top?.story_articles?.length || 0
  const restSilence = silenceStories.slice(1)

  const shareText = '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?'

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 20px' }}>

      {/* HERO */}
      <div style={{ padding: '72px 0 56px', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{
          fontFamily: "'Noto Serif KR', serif",
          fontSize: 'clamp(22px, 4vw, 40px)',
          fontWeight: 700,
          lineHeight: 1.55,
          color: 'var(--text)',
        }}>
          모든 뉴스에는<br />
          당신이 못 본 절반이 있습니다.
        </h1>
      </div>

      {/* 오늘의 침묵 뉴스 */}
      {top && (
        <div style={{
          margin: '48px 0',
          border: '1px solid var(--border2)',
          borderRadius: 20,
          padding: 'clamp(24px, 5vw, 40px)',
          background: 'var(--card)',
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '.16em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            marginBottom: 20,
          }}>
            오늘 대부분의 언론이 다루지 않은 뉴스
          </div>

          <p style={{
            fontFamily: "'Noto Serif KR', serif",
            fontSize: 'clamp(16px, 2.5vw, 22px)',
            fontWeight: 700,
            lineHeight: 1.6,
            color: 'var(--text)',
            marginBottom: 28,
          }}>
            {top.title}
          </p>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 32 }}>
            <span style={{
              fontFamily: "'Bebas Neue', cursive",
              fontSize: 64,
              lineHeight: 1,
              color: 'var(--text)',
            }}>
              {top.silence_score}
            </span>
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>침묵지수</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>
                {totalOutlets}개 언론사 중 {topReportingCount}개만 보도
              </div>
            </div>
          </div>

          <a
            href={`#story-${top.id}`}
            style={{
              display: 'inline-block',
              padding: '11px 22px',
              borderRadius: 12,
              fontSize: 13,
              fontWeight: 700,
              background: 'var(--text)',
              color: 'var(--bg)',
              textDecoration: 'none',
              letterSpacing: '.02em',
            }}
          >
            확인하기 →
          </a>
        </div>
      )}

      {/* 섹션 1: 같은 사건 완전히 다른 헤드라인 */}
      {controversyStories.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 28, paddingTop: 8 }}>
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
              fontSize: 'clamp(17px, 2.5vw, 22px)',
              fontWeight: 700,
              color: 'var(--text)',
            }}>
              같은 사건 완전히 다른 헤드라인
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {controversyStories.map((story: any) => {
              const articles = getArticles(story)
              return (
                <div
                  key={story.id}
                  id={`story-${story.id}`}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: 16,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{
                    padding: '16px 20px 14px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.5 }}>
                      {story.title}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    {articles.slice(0, 2).map((article: any, i: number) => {
                      const isGoogle = article.url?.includes('news.google.com')
                      return (
                        <div
                          key={article.id}
                          style={{
                            padding: '14px 18px 16px',
                            borderRight: i === 0 ? '1px solid var(--border)' : 'none',
                          }}
                        >
                          <div style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--muted)',
                            marginBottom: 8,
                            letterSpacing: '.04em',
                          }}>
                            {article.outlets?.name}
                          </div>
                          <p style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--text)',
                            lineHeight: 1.5,
                            marginBottom: 10,
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
                                borderBottom: '1px solid var(--border)',
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
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 섹션 2: 당신이 놓쳤을 수 있는 시각 */}
      {restSilence.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 28 }}>
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
              fontSize: 'clamp(17px, 2.5vw, 22px)',
              fontWeight: 700,
              color: 'var(--text)',
            }}>
              당신이 놓쳤을 수 있는 시각
            </h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {restSilence.map((story: any) => {
              const reportingCount = story.story_articles?.length || 0
              return (
                <div
                  key={story.id}
                  id={`story-${story.id}`}
                  style={{
                    padding: '20px 0',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 20,
                  }}
                >
                  <p style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    lineHeight: 1.5,
                    flex: 1,
                  }}>
                    {story.title}
                  </p>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: "'Bebas Neue', cursive",
                      fontSize: 22,
                      color: 'var(--text)',
                      lineHeight: 1,
                      marginBottom: 3,
                    }}>
                      {story.silence_score}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {reportingCount}개 보도
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* 데이터 없을 때 */}
      {silenceStories.length === 0 && controversyStories.length === 0 && (
        <div style={{ padding: '80px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
          오늘의 뉴스가 준비 중입니다.<br />매 3시간마다 업데이트됩니다.
        </div>
      )}

      {/* 공유 */}
      {(silenceStories.length > 0 || controversyStories.length > 0) && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '48px 0 32px',
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: "'Noto Serif KR', serif",
            fontSize: 'clamp(14px, 2vw, 17px)',
            color: 'var(--text2)',
            lineHeight: 1.8,
            marginBottom: 24,
          }}>
            {shareText}
          </p>
          <ShareButtons url="https://newsjeoul.co.kr" text={shareText} />
        </div>
      )}

    </div>
  )
}
