import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import SilenceTop10 from '@/components/SilenceTop10'
import { getRelatedSections } from '@/lib/relatedSections'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function getStory(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await supabase
    .from('stories')
    .select(`
      id, title, silence_score, controversy_score, created_at,
      story_articles(
        is_representative,
        articles(id, title, url, published_at, outlet_id, outlets(id, name))
      )
    `)
    .eq('id', id)
    .single()
  if (error) console.error('[getStory] id=%s code=%s msg=%s', id, error.code, error.message)
  return data
}

const BASE = 'https://newsjeoul.co.kr'
const TOTAL_OUTLETS = 20

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const story = await getStory(id)
  if (!story) return { title: '뉴스저울' }

  const articles = (story.story_articles || []).map((sa: any) => sa.articles).filter(Boolean)
  const reportingCount = articles.length
  const isDebate = story.controversy_score > story.silence_score && articles.length >= 2

  let ogImageUrl: string
  if (isDebate) {
    const a0 = articles[0]
    const a1 = articles[1]
    ogImageUrl = `${BASE}/og?type=debate` +
      `&title=${encodeURIComponent(story.title)}` +
      `&h1=${encodeURIComponent(a0?.title || '')}` +
      `&o1=${encodeURIComponent(a0?.outlets?.name || '')}` +
      `&h2=${encodeURIComponent(a1?.title || '')}` +
      `&o2=${encodeURIComponent(a1?.outlets?.name || '')}`
  } else {
    ogImageUrl = `${BASE}/og?type=silence` +
      `&title=${encodeURIComponent(story.title)}` +
      `&outlets=${reportingCount}` +
      `&total=${TOTAL_OUTLETS}`
  }

  const desc = isDebate
    ? `같은 사건, 완전히 다른 헤드라인 — ${story.title}`
    : `${TOTAL_OUTLETS}개 언론사 중 ${reportingCount}개만 보도 — ${story.title}`

  return {
    title: `${story.title} — 뉴스저울`,
    description: desc,
    openGraph: {
      title: story.title,
      description: desc,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: story.title,
      description: desc,
      images: [ogImageUrl],
    },
  }
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [story, sections] = await Promise.all([
    getStory(id),
    getRelatedSections(id),
  ])
  const { silenceTop5, controversyTop5, silenceTop10 } = sections

  if (!story) notFound()

  const articles = story.story_articles
    ?.map((sa: any) => sa.articles)
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    || []

  const outletNames = [...new Set(articles.map((a: any) => a.outlets?.name).filter(Boolean))]
  const whyMissed = outletNames.length === 1
    ? `${outletNames[0]}만 이 사안을 다뤘습니다.`
    : outletNames.length <= 2
    ? '대부분의 언론이 이 사안을 다루지 않았습니다.'
    : '이 뉴스는 소수의 언론사만 보도했습니다.'
  const shareText = `"${story.title}"\n침묵지수 ${story.silence_score}점 — ${outletNames.length}개 언론사만 보도\n\n뉴스저울 →`

  return (
    <div style={{maxWidth:800,margin:'0 auto',padding:'0 16px'}}>

      {/* 뒤로가기 */}
      <div style={{padding:'16px 0 0'}}>
        <Link href="/" style={{fontSize:12,color:'var(--muted)',textDecoration:'none'}}>← 뉴스저울로</Link>
      </div>

      {/* 헤더 */}
      <div style={{padding:'16px 0 20px',borderBottom:'1px solid var(--border)',marginBottom:20}}>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <div style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:20,background:'rgba(230,57,70,.1)',border:'1px solid rgba(230,57,70,.2)',color:'var(--con)'}}>
            🔇 침묵지수 {story.silence_score}
          </div>
          <div style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:20,background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',color:'var(--gold)'}}>
            ⚡ 논쟁지수 {story.controversy_score}
          </div>
          <div style={{fontSize:10,fontWeight:700,padding:'4px 10px',borderRadius:20,background:'var(--card)',border:'1px solid var(--border)',color:'var(--muted)'}}>
            {outletNames.length}개 언론사 보도
          </div>
        </div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(18px,3vw,28px)',lineHeight:1.4,marginBottom:14,color:'var(--text)'}}>{story.title}</h1>
        <p style={{
          fontSize: 13,
          color: 'var(--muted)',
          lineHeight: 1.6,
          marginBottom: 14,
          fontStyle: 'italic',
        }}>
          {whyMissed}
        </p>
        <ShareButtons url={`https://newsjeoul.co.kr/story/${story.id}`} text={shareText} />
      </div>

      {/* 보도 언론사 */}
      <div style={{marginBottom:8,fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:3,height:14,borderRadius:2,background:'var(--lib)'}}/>
        보도한 언론사 ({outletNames.length}개)
      </div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:20}}>
        {(outletNames as string[]).map((name:string)=>(
          <div key={name} style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:20,background:'var(--card)',border:'1px solid var(--border)',color:'var(--text2)'}}>{name}</div>
        ))}
      </div>

      {/* 기사 목록 */}
      <div style={{marginBottom:8,fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8}}>
        <div style={{width:3,height:14,borderRadius:2,background:'var(--con)'}}/>
        언론사별 보도 ({articles.length}개 기사)
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
        {articles.map((article:any)=>{
          const isGoogle = article.url?.includes('news.google.com')
          const pubDate = article.published_at ? new Date(article.published_at).toLocaleDateString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''
          return (
            <div key={article.id} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:'14px 16px'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text2)',background:'var(--bg2)',border:'1px solid var(--border)',padding:'3px 10px',borderRadius:999}}>{article.outlets?.name}</div>
                {pubDate&&<div style={{fontSize:10,color:'var(--muted)'}}>{pubDate}</div>}
              </div>
              <div style={{fontSize:14,fontWeight:600,color:'var(--text)',lineHeight:1.5,marginBottom:isGoogle?0:10}}>{article.title}</div>
              {!isGoogle&&(
                <a href={article.url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--lib)',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:4}}>
                  원문 보기 →
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* ── 관련 콘텐츠 3섹션 ───────────────────────────────── */}

      {/* 1. 당신이 놓쳤을 수 있는 뉴스 */}
      {silenceTop5.length > 0 && (
        <div style={{marginBottom:32}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--accent)'}}/>
            당신이 놓쳤을 수 있는 뉴스
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {silenceTop5.map((s:any) => {
              const n = s.story_articles?.length || 0
              return (
                <Link key={s.id} href={`/story/${s.id}`} style={{textDecoration:'none'}}>
                  <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                      <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:'rgba(200,168,122,0.12)',color:'var(--accent)',letterSpacing:'.03em',flexShrink:0}}>
                        침묵지수 {s.silence_score ?? '—'}
                      </span>
                      <span style={{fontSize:11,color:'var(--muted)'}}>
                        {TOTAL_OUTLETS}개 중 {n}개만 보도
                      </span>
                    </div>
                    <p style={{fontSize:13,fontWeight:600,color:'var(--text)',lineHeight:1.5,marginBottom:10}}>{s.title}</p>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--accent)'}}>확인하기 →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 2. 같은 사건, 다른 헤드라인 */}
      {controversyTop5.length > 0 && (
        <div style={{marginBottom:32}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--accent)'}}/>
            같은 사건, 다른 헤드라인
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {controversyTop5.map((s:any) => {
              const n = s.story_articles?.length || 0
              return (
                <Link key={s.id} href={`/story/${s.id}`} style={{textDecoration:'none'}}>
                  <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,padding:'16px'}}>
                    <p style={{fontSize:10,fontWeight:700,color:'var(--muted)',marginBottom:6,letterSpacing:'.04em'}}>{n}개 언론사 보도</p>
                    <p style={{fontSize:13,fontWeight:600,color:'var(--text)',lineHeight:1.5,marginBottom:10}}>{s.title}</p>
                    <span style={{fontSize:11,fontWeight:700,color:'var(--accent)'}}>다른 시각 보기 →</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 3. 오늘 가장 많이 침묵한 뉴스 — TOP10, 더보기 접기 포함 */}
      {silenceTop10.length > 0 && (
        <div style={{marginBottom:32}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--accent)'}}/>
            오늘 가장 많이 침묵한 뉴스
          </div>
          <SilenceTop10 stories={silenceTop10} />
        </div>
      )}

      {/* 하단 CTA */}
      <div style={{marginTop:8,marginBottom:40,padding:'28px 24px',background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,display:'flex',flexDirection:'column',alignItems:'center',gap:14,textAlign:'center'}}>
        <p style={{fontSize:14,color:'var(--text2)',lineHeight:1.7}}>오늘 언론사 90%가 침묵한 뉴스가 있습니다.</p>
        <Link href="/top10" style={{padding:'12px 28px',background:'var(--text)',color:'var(--bg)',borderRadius:10,fontSize:13,fontWeight:700,textDecoration:'none',display:'inline-block'}}>
          오늘 가장 많이 침묵한 뉴스 보기
        </Link>
      </div>

    </div>
  )
}
