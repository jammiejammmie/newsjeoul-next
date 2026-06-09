import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'

export const dynamic = 'force-dynamic'

async function getData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [silenceRes, controversyRes, outletRes] = await Promise.all([
    supabase.from('stories').select(`id,title,silence_score,controversy_score,created_at,story_articles(article_id,articles(id,title,url,outlet_id,outlets(name)))`).order('silence_score',{ascending:false}).limit(10),
    supabase.from('stories').select(`id,title,silence_score,controversy_score,created_at,story_articles(article_id,articles(id,title,url,outlet_id,outlets(name)))`).order('controversy_score',{ascending:false}).limit(3),
    supabase.from('outlets').select('id',{count:'exact',head:true}),
  ])
  return {
    silenceStories: silenceRes.data || [],
    controversyStories: controversyRes.data || [],
    totalOutlets: outletRes.count || 20,
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { silenceStories } = await getData()
  const top = silenceStories[0]
  const desc = top ? `침묵지수 ${top.silence_score}점 — "${top.title}" 외 다수 언론이 침묵한 뉴스` : '내가 못 본 절반을 보여주는 미디어 리터러시 플랫폼'
  return {
    title: '뉴스저울 — 모든 뉴스에는 당신이 못 본 절반이 있습니다',
    description: desc,
    openGraph: {
      title: '뉴스저울',
      description: top ? `오늘 언론사 ${top.silence_score}%가 침묵한 뉴스: "${top.title}"` : '모든 뉴스에는 당신이 못 본 절반이 있습니다',
      url: 'https://newsjeoul.co.kr',
      siteName: '뉴스저울',
      images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
      locale: 'ko_KR',
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title: '뉴스저울', description: desc, images: ['https://newsjeoul.co.kr/og-image.png'] },
  }
}

export default async function Home() {
  const { silenceStories, controversyStories, totalOutlets } = await getData()
  const top = silenceStories[0]

  const shareText = top
    ? `오늘 언론사 ${top.silence_score}%가 침묵한 뉴스\n"${top.title}"\n\n내가 못 본 절반 →`
    : '모든 뉴스에는 당신이 못 본 절반이 있습니다 →'

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px'}}>

      {/* HERO */}
      <div style={{padding:'24px 0 20px',borderBottom:'1px solid var(--border)',marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>뉴스저울 — 미디어 리터러시 플랫폼</div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(20px,3.5vw,34px)',lineHeight:1.35,marginBottom:8}}>
          모든 뉴스에는<br/>당신이 못 본 <span style={{color:'var(--con)'}}>절반</span>이 있습니다
        </h1>
        <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,maxWidth:520,marginBottom:14}}>
          {totalOutlets}개 언론사를 매 3시간마다 분석합니다. 어떤 뉴스가 침묵받고 있는지 확인하세요.
        </p>
        <ShareButtons url="https://newsjeoul.co.kr" text={shareText} />
      </div>

      {/* 오늘의 침묵 뉴스 배너 */}
      {top && (
        <Link href={`/story/${top.id}`} style={{textDecoration:'none',display:'block'}}>
          <div style={{
            background:'linear-gradient(135deg,rgba(230,57,70,.06),rgba(37,99,235,.06))',
            border:'1px solid var(--border2)',borderRadius:16,
            padding:'16px 18px',marginBottom:20,cursor:'pointer',
          }}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>🔇 오늘의 침묵 뉴스</div>
            <div style={{display:'flex',alignItems:'flex-start',gap:14,flexWrap:'wrap'}}>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:48,color:'var(--con)',lineHeight:1,flexShrink:0}}>{top.silence_score}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:4,lineHeight:1.4}}>{top.title}</div>
                <div style={{fontSize:12,color:'var(--text2)'}}>침묵지수 {top.silence_score}점 — {totalOutlets}개 언론사 중 소수만 보도</div>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* 침묵지수 TOP */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--con)'}}/>침묵지수 TOP 뉴스
          </div>
          <div style={{fontSize:10,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--border)',padding:'3px 10px',borderRadius:20}}>{silenceStories.length}개 스토리</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {silenceStories.map((story:any,i:number) => {
            const articles = story.story_articles?.map((sa:any)=>sa.articles).filter(Boolean)||[]
            const outletNames = [...new Set(articles.map((a:any)=>a.outlets?.name).filter(Boolean))] as string[]
            return (
              <Link key={story.id} href={`/story/${story.id}`} style={{textDecoration:'none'}}>
                <div style={{
                  background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,
                  padding:'12px 14px',display:'flex',alignItems:'center',gap:12,
                  transition:'transform .15s',cursor:'pointer',
                }}>
                  <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:26,color:i===0?'var(--con)':'var(--muted2)',width:32,flexShrink:0,textAlign:'center'}}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:3,lineHeight:1.4,display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{story.title}</div>
                    <div style={{fontSize:10,color:'var(--muted)'}}>보도: {outletNames.slice(0,3).join(', ')}{outletNames.length>3?` 외 ${outletNames.length-3}개`:''}</div>
                  </div>
                  <div style={{flexShrink:0,textAlign:'center'}}>
                    <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:22,color:story.silence_score>70?'var(--con)':story.silence_score>40?'var(--gold)':'var(--green)'}}>{story.silence_score}</div>
                    <div style={{fontSize:9,color:'var(--muted)'}}>침묵지수</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* 오늘의 논쟁 */}
      {controversyStories.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
            <div style={{width:3,height:14,borderRadius:2,background:'var(--gold)'}}/>오늘의 논쟁
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {controversyStories.map((story:any)=>{
              const articles = story.story_articles?.map((sa:any)=>sa.articles).filter(Boolean)||[]
              return (
                <Link key={story.id} href={`/story/${story.id}`} style={{textDecoration:'none'}}>
                  <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',cursor:'pointer'}}>
                    <div style={{padding:'12px 14px 10px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--text)',flex:1,lineHeight:1.4}}>{story.title}</div>
                      <div style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',color:'var(--gold)',flexShrink:0}}>논쟁 {story.controversy_score}점</div>
                    </div>
                    <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:4}}>
                      {articles.slice(0,3).map((article:any)=>{
                        const isGoogle = article.url?.includes('news.google.com')
                        return (
                          <div key={article.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
                            <div style={{fontSize:10,fontWeight:700,color:'var(--muted)',flexShrink:0,minWidth:56,paddingTop:1}}>{article.outlets?.name}</div>
                            <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.5,flex:1}}>{article.title}</div>
                            {!isGoogle&&<a href={article.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:10,color:'var(--lib)',flexShrink:0,paddingTop:1}}>원문</a>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 내가 못 본 절반 */}
      <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,padding:'20px',marginBottom:24,textAlign:'center'}}>
        <div style={{fontSize:24,marginBottom:8}}>👁️</div>
        <div style={{fontFamily:"'Noto Serif KR',serif",fontSize:16,fontWeight:700,color:'var(--text)',marginBottom:8}}>내가 못 본 절반</div>
        <div style={{fontSize:13,color:'var(--text2)',lineHeight:1.7,marginBottom:12}}>기사를 읽으면 뉴스저울이 당신이 보지 못한 다른 시각의 기사를 자동으로 추천해드립니다.</div>
        <div style={{fontSize:12,color:'var(--muted)'}}>위 기사 중 하나를 클릭하면 시작됩니다 →</div>
      </div>

    </div>
  )
}
