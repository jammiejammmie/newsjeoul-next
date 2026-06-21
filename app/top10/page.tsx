import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '오늘의 침묵 TOP10 — 뉴스저울',
  description: '오늘 가장 많은 언론사가 침묵한 뉴스 10개를 확인하세요.',
}

const TOTAL_OUTLETS = 20

async function getTop10() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // KST 오늘 00:00 → UTC 변환 (KST = UTC+9)
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(Date.now() + kstOffset)
  const todayKST = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()))
  const todayStart = new Date(todayKST.getTime() - kstOffset).toISOString()

  const { data } = await supabase
    .from('stories')
    .select('id,title,silence_score,story_articles(article_id)')
    .gte('created_at', todayStart)
    .order('silence_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10)
  return data || []
}

export default async function Top10Page() {
  const stories = await getTop10()

  return (
    <div className="nj-container">
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px 80px' }}>

        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.18em', color: 'var(--muted)', marginBottom: 12 }}>
            NEWSJEOUL
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', lineHeight: 1.3, marginBottom: 12 }}>
            오늘의 침묵 TOP10
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>
            {TOTAL_OUTLETS}개 언론사 중 가장 많은 곳이 다루지 않은 뉴스입니다.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {stories.map((s: any, i: number) => {
            const n = s.story_articles?.length || 0
            const rank = i + 1
            const isTop3 = rank <= 3

            return (
              <Link key={s.id} href={`/story/${s.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 20,
                    padding: '22px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {/* Rank */}
                  <span
                    style={{
                      fontFamily: "'Bebas Neue', cursive",
                      fontSize: 36,
                      lineHeight: 1,
                      color: rank === 1 ? 'var(--accent)' : isTop3 ? 'var(--text2)' : 'var(--muted)',
                      width: 48,
                      flexShrink: 0,
                      paddingTop: 2,
                    }}
                  >
                    #{rank}
                  </span>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 20,
                          background: 'rgba(200,168,122,0.12)',
                          color: 'var(--accent)',
                          letterSpacing: '.03em',
                          flexShrink: 0,
                        }}
                      >
                        침묵지수 {s.silence_score ?? '—'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isTop3 ? 'var(--accent)' : 'var(--muted)' }}>
                        {TOTAL_OUTLETS}개 중 {n}개만 보도
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: isTop3 ? 16 : 14,
                        fontWeight: isTop3 ? 700 : 500,
                        color: 'var(--text)',
                        lineHeight: 1.55,
                        marginBottom: 10,
                      }}
                    >
                      {s.title}
                    </p>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>자세히 보기 →</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <Link
            href="/"
            style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
          >
            ← 홈으로 돌아가기
          </Link>
        </div>

      </div>
    </div>
  )
}
