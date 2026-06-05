import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import NewsCard from '@/components/NewsCard'
import ShareButtons from '@/components/ShareButtons'

// SSR - 서버에서 데이터 불러옴 (구글 크롤링 가능!)
async function getNews() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('news_kr')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  return data || []
}

// 동적 OG 태그 (오늘 뉴스 제목 포함)
export async function generateMetadata(): Promise<Metadata> {
  const news = await getNews()
  const titles = news.slice(0, 3).map(n => n.title).join(', ')
  const avgBias = news.length ? Math.round(news.reduce((s:number, n:any) => s + (n.bias_score||50), 0) / news.length) : 50
  const biasText = avgBias > 60 ? '오늘 보수 성향 우세' : avgBias < 40 ? '오늘 진보 성향 우세' : '오늘 균형 보도'

  return {
    title: '뉴스저울 — 같은 나라, 다른 뉴스',
    description: titles ? `${biasText} | ${titles}` : '조중동 vs 한경오. 같은 사건, 다른 시각.',
    openGraph: {
      title: '뉴스저울 — 같은 나라, 다른 뉴스',
      description: titles ? `오늘 주요 이슈: ${titles}` : '조중동 vs 한경오. 같은 사건, 다른 시각.',
      images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
    },
  }
}

export default async function Home() {
  const news = await getNews()
  const avgBias = news.length ? Math.round(news.reduce((s:number, n:any) => s + (n.bias_score||50), 0) / news.length) : 50
  const today = new Date()
  const dday = Math.ceil((new Date('2026-06-03').getTime() - today.getTime()) / 86400000)
  const titles = news.slice(0, 3).map((n:any) => n.title)

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px'}}>

      {/* HERO */}
      <div style={{padding:'28px 0 22px',borderBottom:'1px solid var(--border)',marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}>
          뉴스저울 — 대한민국 미디어 편향 분석
        </div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(20px,3.5vw,38px)',lineHeight:1.35,marginBottom:10}}>
          같은 뉴스, <span style={{color:'var(--con)'}}>보수</span>와 <span style={{color:'var(--lib)'}}>진보</span>는<br/>왜 다르게 보도할까요
        </h1>
        <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,maxWidth:520,marginBottom:14}}>
          매일 오전 9시, 오후 9시 업데이트. 어느 쪽이 맞다는 게 아니라 두 시각을 모두 보여드립니다.
        </p>
        <ShareButtons
          url="https://newsjeoul.co.kr"
          text={`오늘 편향 지수 ${avgBias}점 | ${titles.join(' · ')}\n보수 vs 진보 뉴스 비교 →`}
        />
      </div>

      {/* 선거 배너 (D-day 양수일 때만) */}
      {dday > 0 && (
        <div style={{
          background:'linear-gradient(135deg,var(--con-soft),var(--lib-soft))',
          border:'1px solid var(--border2)',
          borderRadius:16,
          padding:'14px 16px',
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          gap:12,
          marginBottom:24,
          flexWrap:'wrap',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:30,color:'var(--gold)',lineHeight:1,flexShrink:0}}>
              D-{dday}
            </div>
            <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.6,flex:1}}>
              <strong style={{color:'var(--text)',display:'block',marginBottom:2}}>🗳️ 6·3 지방선거</strong>
              같은 후보, 언론사마다 다른 여론조사
            </div>
          </div>
          <a href="/election" style={{
            background:'var(--con)',color:'#fff',border:'none',
            padding:'8px 14px',borderRadius:10,fontSize:11,fontWeight:700,
            cursor:'pointer',whiteSpace:'nowrap',textDecoration:'none',
          }}>선거 결과 →</a>
        </div>
      )}

      {/* 오늘의 편향 지수 */}
      {news.length > 0 && (
        <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,padding:'16px 18px',marginBottom:20}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>
            오늘의 편향 지수
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:11,fontWeight:700,color:'var(--lib)',whiteSpace:'nowrap'}}>진보</span>
            <div style={{flex:1,height:12,background:`linear-gradient(90deg,var(--lib),#888,var(--con))`,borderRadius:20,position:'relative'}}>
              <div style={{
                position:'absolute',top:'50%',left:`${avgBias}%`,
                transform:'translate(-50%,-50%)',
                width:20,height:20,
                background:'var(--text)',borderRadius:'50%',
                border:'3px solid var(--bg)',
                boxShadow:'0 2px 8px rgba(0,0,0,.5)',
              }}/>
            </div>
            <span style={{fontSize:11,fontWeight:700,color:'var(--con)',whiteSpace:'nowrap'}}>보수</span>
          </div>
          <div style={{fontSize:13,color:'var(--text2)',marginTop:10}}>
            {avgBias > 60 ? `오늘은 보수 성향 보도가 우세합니다 (평균 ${avgBias}점)` :
             avgBias < 40 ? `오늘은 진보 성향 보도가 우세합니다 (평균 ${avgBias}점)` :
             `오늘은 비교적 균형 잡힌 보도입니다 (평균 ${avgBias}점)`}
          </div>
        </div>
      )}

      {/* 뉴스 섹션 헤더 */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:3,height:14,borderRadius:2,background:'var(--con)'}}/>
          오늘의 뉴스 비교
        </div>
        {news.length > 0 && (
          <div style={{fontSize:10,color:'var(--muted)',background:'var(--card)',border:'1px solid var(--border)',padding:'3px 10px',borderRadius:20}}>
            {new Date(news[0].created_at).toLocaleDateString('ko-KR', {month:'numeric',day:'numeric'})} 업데이트
          </div>
        )}
      </div>

      {/* 뉴스 카드 */}
      {news.length > 0 ? (
        news.map((item: any) => <NewsCard key={item.id} item={item} />)
      ) : (
        <div style={{padding:'40px 20px',textAlign:'center',color:'var(--muted)',fontSize:13}}>
          오늘의 뉴스가 준비 중입니다.<br/>매일 오전 9시, 오후 9시에 업데이트됩니다.
        </div>
      )}

    </div>
  )
}
