import type { Metadata } from 'next'
import ShareButtons from '@/components/ShareButtons'

export const metadata: Metadata = {
  title: '미디어101 — 뉴스저울',
  description: '한국 주요 언론사 성향 가이드. 조중동, 한경오까지 — 어느 언론이 어떤 성향인지 알아보세요.',
  openGraph: {
    title: '미디어101 — 뉴스저울',
    description: '어느 언론을 읽느냐가 세상을 보는 방식을 바꿉니다.',
    images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
  },
}

const mediaList = [
  { name: '조선일보', lean: 'con', leanLabel: '강보수', score: 88, desc: '1920년 창간. 국내 최대 발행부수. 친기업·안보 강조.' },
  { name: '동아일보', lean: 'con', leanLabel: '보수', score: 78, desc: '1920년 창간. 조선일보와 함께 보수 양대 신문.' },
  { name: 'TV조선', lean: 'con', leanLabel: '강보수', score: 85, desc: '조선일보 계열 종편. 보수 성향 방송 중 시청률 1위.' },
  { name: '중앙일보', lean: 'mid', leanLabel: '중도보수', score: 60, desc: '비교적 균형적. 디지털 전환에 적극적.' },
  { name: 'KBS', lean: 'mid', leanLabel: '공영방송', score: 50, desc: '수신료로 운영. 정권 따라 논조가 흔들린다는 평가.' },
  { name: '한겨레', lean: 'lib', leanLabel: '진보', score: 80, desc: '1988년 국민주 모아 창간. 노동·인권 이슈 집중.' },
  { name: '경향신문', lean: 'lib', leanLabel: '진보', score: 74, desc: '한겨레와 함께 진보 양대 신문.' },
  { name: 'JTBC', lean: 'lib', leanLabel: '진보 성향', score: 65, desc: '중앙일보 계열이나 방송은 진보 성향.' },
  { name: '오마이뉴스', lean: 'lib', leanLabel: '강진보', score: 85, desc: '시민기자 모델로 2000년 창간.' },
]

const leanColors: Record<string, string> = { con: 'var(--con)', lib: 'var(--lib)', mid: 'var(--gold)' }

export default function Media101Page() {
  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px'}}>
      <div style={{padding:'28px 0 22px',borderBottom:'1px solid var(--border)',marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>미디어101 — 언론사 성향 가이드</div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(20px,3.5vw,34px)',lineHeight:1.35,marginBottom:8}}>
          어느 언론을 읽느냐가<br/>세상을 보는 방식을 바꿉니다
        </h1>
        <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,marginBottom:14}}>
          편향을 아는 것이 편향에서 자유로워지는 첫 걸음입니다.
        </p>
        <ShareButtons url="https://newsjeoul.co.kr/media101" text="어느 언론을 읽느냐가 세상을 보는 방식을 바꿉니다 — 한국 언론사 성향 가이드 | 뉴스저울" />
      </div>

      {/* 스펙트럼 */}
      <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:16,padding:20,marginBottom:24}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:16}}>📊 한국 언론사 편향 스펙트럼</div>
        <div style={{height:40,borderRadius:12,background:'linear-gradient(90deg,var(--lib),#6b7280,var(--con))',position:'relative',marginBottom:40}}>
          {[
            {name:'조선',pos:12},{name:'동아',pos:22},{name:'중앙',pos:35},
            {name:'KBS',pos:48},{name:'JTBC',pos:62},{name:'한겨레',pos:75},{name:'경향',pos:88},
          ].map(({name,pos}) => (
            <div key={name} style={{position:'absolute',bottom:-32,left:`${pos}%`,transform:'translateX(-50%)',textAlign:'center'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'var(--text)',margin:'0 auto 4px',border:'2px solid var(--bg)'}}/>
              <div style={{fontSize:10,fontWeight:700,color:'var(--text2)',whiteSpace:'nowrap'}}>{name}</div>
            </div>
          ))}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--muted)',marginTop:8}}>
          <span style={{color:'var(--lib)'}}>← 진보</span>
          <span>중도</span>
          <span style={{color:'var(--con)'}}>보수 →</span>
        </div>
      </div>

      {/* 언론사 카드 */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
        {mediaList.map(m => (
          <div key={m.name} style={{
            background:'var(--card)',
            border:`1px solid var(--border)`,
            borderLeft:`3px solid ${leanColors[m.lean]}`,
            borderRadius:14,padding:14,
          }}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:3}}>{m.name}</div>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:leanColors[m.lean],marginBottom:10}}>{m.leanLabel}</div>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <div style={{fontSize:10,color:'var(--muted)',width:50,flexShrink:0}}>편향도</div>
              <div style={{flex:1,height:5,background:'var(--border2)',borderRadius:20,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:20,background:leanColors[m.lean],width:`${m.score}%`}}/>
              </div>
              <div style={{fontFamily:"'Bebas Neue',cursive",fontSize:16,width:28,textAlign:'right',color:leanColors[m.lean]}}>{m.score}</div>
            </div>
            <div style={{fontSize:11,color:'var(--muted)',lineHeight:1.6,borderTop:'1px solid var(--border)',paddingTop:8}}>{m.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
