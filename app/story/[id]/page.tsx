import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function getStory(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
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
  return data
}

async function getRelatedStories(id: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('stories')
    .select('id, title, silence_score, controversy_score')
    .neq('id', id)
    .order('created_at', { ascending: false })
    .limit(5)
  return data || []
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const story = await getStory(id)
  if (!story) return { title: '뉴스저울' }
  return {
    title: `${story.title} — 뉴스저울`,
    description: `침묵지수 ${story.silence_score}점 | 논쟁지수 ${story.controversy_score}점`,
    openGraph: {
      title: story.title,
      description: `침묵지수 ${story.silence_score}점 — 이 뉴스를 보지 못했을 수 있습니다`,
      images: [{ url: 'https://newsjeoul.co.kr/og-image.png' }],
    },
  }
}

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [story, related] = await Promise.all([
    getStory(id),
    getRelatedStories(id),
  ])

  if (!story) notFound()

  const articles = story.story_articles
    ?.map((sa: any) => sa.articles)
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    || []

  const outletNames = [...new Set(articles.map((a: any) => a.outlets?.name).filter(Boolean))]
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

      {/* 관련 스토리 */}
      {related.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--purple)'}}/>관련 스토리
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {related.map((s:any)=>(
              <Link key={s.id} href={`/story/${s.id}`} style={{textDecoration:'none'}}>
                <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                  <div style={{fontSize:13,color:'var(--text)',flex:1,lineHeight:1.4}}>{s.title}</div>
                  <div style={{fontSize:10,color:'var(--muted)',flexShrink:0}}>침묵 {s.silence_score}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
