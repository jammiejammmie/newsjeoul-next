import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import ShareButtons from '@/components/ShareButtons'

export const dynamic = 'force-dynamic'

async function getTopSilenceStories() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('stories')
    .select(`
      id, title, silence_score, controversy_score, created_at,
      story_articles(
        article_id,
        is_representative,
        articles(id, title, url, outlet_id, outlets(name))
      )
    `)
    .order('silence_score', { ascending: false })
    .limit(10)
  return data || []
}

async function getTopControversyStories() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('stories')
    .select(`
      id, title, silence_score, controversy_score, created_at,
      story_articles(
        article_id,
        is_representative,
        articles(id, title, url, outlet_id, outlets(name))
      )
    `)
    .order('controversy_score', { ascending: false })
    .limit(5)
  return data || []
}

async function getOutletCount() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { count } = await supabase.from('outlets').select('*', { count: 'exact', head: true })
  return count || 20
}

export async function generateMetadata(): Promise<Metadata> {
  const stories = await getTopSilenceStories()
  const top = stories[0]
  return {
    title: '뉴스저울 — 모든 뉴스에는 당신이 못 본 절반이 있습니다',
    description: top ? `침묵지수 ${top.silence_score}점 — "${top.title}" 외 다수 언론이 침묵한 뉴스` : '내가 못 본 절반을 보여주는 미디어 리터러시 플랫폼',
    openGraph: {
      title: '뉴스저울',
      description: top ? `오늘 언론사 ${top.silence_score}%가 침묵한 뉴스가 있습니다` : '모든 뉴스에는 당신이 못 본 절반이 있습니다',
      images: [{ url: 'https://newsjeoul.co.kr/og-image.png' }],
    },
  }
}

export default async function Home() {
  const [silenceStories, controversyStories, totalOutlets] = await Promise.all([
    getTopSilenceStories(),
    getTopControversyStories(),
    getOutletCount(),
  ])

  const topSilence = silenceStories[0]

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>

      {/* HERO */}
      <div style={{ padding: '28px 0 22px', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
          뉴스저울 — 미디어 리터러시 플랫폼
        </div>
        <h1 style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 'clamp(20px,3.5vw,36px)', lineHeight: 1.35, marginBottom: 10 }}>
          모든 뉴스에는<br/>당신이 못 본 <span style={{ color: 'var(--con)' }}>절반</span>이 있습니다
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 520, marginBottom: 14 }}>
          {totalOutlets}개 언론사를 매 3시간마다 분석합니다. 어떤 뉴스가 침묵받고 있는지, 같은 사건을 어떻게 다르게 보도하는지 확인하세요.
        </p>
        <ShareButtons
          url="https://newsjeoul.co.kr"
          text={topSilence ? `오늘 언론사 ${topSilence.silence_score}%가 침묵한 뉴스가 있습니다\n"${topSilence.title}"\n\n내가 못 본 절반 → https://newsjeoul.co.kr` : '모든 뉴스에는 당신이 못 본 절반이 있습니다 → https://newsjeoul.co.kr'}
        />
      </div>

      {/* 침묵지수 TOP */}
      {topSilence && (
        <div style={{
          background: 'linear-gradient(135deg,rgba(230,57,70,.06),rgba(37,99,235,.06))',
          border: '1px solid var(--border2)',
          borderRadius: 16,
          padding: '18px 20px',
          marginBottom: 24,
          cursor: 'pointer',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
            🔇 오늘의 침묵 뉴스
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 52, color: 'var(--con)', lineHeight: 1, flexShrink: 0 }}>
              {topSilence.silence_score}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.4 }}>
                {topSilence.title}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                침묵지수 {topSilence.silence_score}점 — {totalOutlets}개 언론사 중 소수만 보도
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 침묵지수 랭킹 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--con)' }} />
            침묵지수 TOP 뉴스
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--card)', border: '1px solid var(--border)', padding: '3px 10px', borderRadius: 20 }}>
            {silenceStories.length}개 스토리
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {silenceStories.map((story: any, i) => {
            const articles = story.story_articles?.map((sa: any) => sa.articles).filter(Boolean) || []
            const outletNames = articles.map((a: any) => a.outlets?.name).filter(Boolean)
            const uniqueOutlets = [...new Set(outletNames)]

            return (
              <div key={story.id} style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}>
                <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 28, color: i === 0 ? 'var(--con)' : 'var(--muted)', width: 36, flexShrink: 0, textAlign: 'center' }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {story.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    보도: {uniqueOutlets.slice(0, 3).join(', ')}{uniqueOutlets.length > 3 ? ` 외 ${uniqueOutlets.length - 3}개` : ''}
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Bebas Neue',cursive", fontSize: 24, color: story.silence_score > 70 ? 'var(--con)' : story.silence_score > 40 ? 'var(--gold)' : 'var(--green)' }}>
                    {story.silence_score}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)' }}>침묵지수</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 오늘의 논쟁 */}
      {controversyStories.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, background: 'var(--gold)' }} />
            오늘의 논쟁
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {controversyStories.slice(0, 3).map((story: any) => {
              const articles = story.story_articles?.map((sa: any) => sa.articles).filter(Boolean) || []

              return (
                <div key={story.id} style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, lineHeight: 1.4 }}>
                      {story.title}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)', color: 'var(--gold)', flexShrink: 0 }}>
                      논쟁 {story.controversy_score}점
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {articles.slice(0, 4).map((article: any) => (
                      <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, textDecoration: 'none',
                        padding: '6px 0', borderBottom: '1px solid var(--border)',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', flexShrink: 0, paddingTop: 2, minWidth: 60 }}>
                          {article.outlets?.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, flex: 1 }}>
                          {article.title}
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 내가 못 본 절반 안내 */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '20px',
        marginBottom: 28,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 24, marginBottom: 10 }}>👁️</div>
        <div style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          내가 못 본 절반
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
          기사를 읽으면 뉴스저울이 당신이 보지 못한 다른 시각의 기사를 자동으로 추천해드립니다.
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          위 기사 중 하나를 클릭하면 시작됩니다 →
        </div>
      </div>

    </div>
  )
}
