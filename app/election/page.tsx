import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import ShareButtons from '@/components/ShareButtons'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '선거 결과 — 뉴스저울',
  description: '6·3 지방선거 결과 vs 언론사 여론조사 비교. 어느 언론사 예측이 맞았나?',
  openGraph: {
    title: '선거 결과 — 뉴스저울',
    description: '6·3 지방선거 결과 vs 여론조사 비교',
    images: [{ url: 'https://newsjeoul.co.kr/og-election.png', width: 1200, height: 630 }],
  },
}

async function getPolls() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase.from('polls_kr').select('*').order('created_at', { ascending: false })
  return data || []
}

export default async function ElectionPage() {
  const polls = await getPolls()

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px'}}>
      <div style={{padding:'28px 0 22px',borderBottom:'1px solid var(--border)',marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--con)',marginBottom:8}}>
          🗳️ 선거 결과 & 여론조사 비교
        </div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(20px,3.5vw,34px)',lineHeight:1.35,marginBottom:8}}>
          여론조사는 얼마나 맞았나요?
        </h1>
        <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,marginBottom:14}}>
          6·3 지방선거 결과와 선거 전 여론조사를 비교합니다. 어느 언론사가 의뢰한 조사가 가장 정확했는지 확인하세요.
        </p>
        <ShareButtons
          url="https://newsjeoul.co.kr/election"
          text="6·3 선거 결과 vs 여론조사 비교 — 어느 언론사 예측이 맞았나? 뉴스저울에서 확인하세요."
        />
      </div>

      {polls.length > 0 ? (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:12}}>
          {polls.map((poll: any) => (
            <div key={poll.id} style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden'}}>
              <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:3}}>{poll.region}</div>
                <div style={{fontSize:10,color:'var(--muted)'}}>{poll.election_type} · {poll.poll_company} · {poll.survey_date}</div>
              </div>
              <div style={{padding:'14px 16px'}}>
                {[
                  {name:poll.candidate_a,party:poll.candidate_a_party,pct:poll.candidate_a_pct},
                  {name:poll.candidate_b,party:poll.candidate_b_party,pct:poll.candidate_b_pct},
                  poll.candidate_c && {name:poll.candidate_c,party:poll.candidate_c_party,pct:poll.candidate_c_pct},
                ].filter(Boolean).map((c: any, i) => (
                  <div key={i} style={{marginBottom:10}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{c.name} <span style={{fontSize:10,color:'var(--muted)'}}>{c.party}</span></span>
                      <span style={{fontFamily:"'Bebas Neue',cursive",fontSize:20,color: i===0?'var(--lib)':'var(--con)'}}>{c.pct}%</span>
                    </div>
                    <div style={{height:7,background:'var(--border)',borderRadius:20,overflow:'hidden'}}>
                      <div style={{height:'100%',borderRadius:20,width:`${c.pct}%`,background: i===0?'linear-gradient(90deg,#2563eb,#60a5fa)':'linear-gradient(90deg,#e63946,#ff6b6b)'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{padding:'40px 20px',textAlign:'center',color:'var(--muted)',fontSize:13}}>
          선거 결과 데이터를 준비 중입니다.
        </div>
      )}
    </div>
  )
}
