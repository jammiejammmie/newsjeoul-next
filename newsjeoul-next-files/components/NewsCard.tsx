'use client'

interface NewsItem {
  id: string
  title: string
  category: string
  conservative_outlet: string
  conservative_headline: string
  conservative_summary: string
  conservative_url: string | null
  liberal_outlet: string
  liberal_headline: string
  liberal_summary: string
  liberal_url: string | null
  bias_score: number
}

const catColors: Record<string, string> = {
  '정치': 'rgba(230,57,70,.1)',
  '경제': 'rgba(245,158,11,.1)',
  '사회': 'rgba(16,185,129,.1)',
  '국제': 'rgba(139,92,246,.1)',
}
const catTextColors: Record<string, string> = {
  '정치': 'var(--con)',
  '경제': 'var(--gold)',
  '사회': 'var(--green)',
  '국제': '#8b5cf6',
}

function shareItem(type: string, title: string, biasScore: number, conUrl: string | null, libUrl: string | null) {
  const biasText = biasScore > 60 ? `보수 성향 ${biasScore}점` : biasScore < 40 ? `진보 성향 ${100-biasScore}점` : '균형 보도'
  const text = `"${title}"\n편향 지수: ${biasText}\n\n보수 vs 진보 전문 비교 → https://newsjeoul.co.kr`
  if (type === 'thread') window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(text), '_blank')
  else if (type === 'x') window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank')
  else navigator.clipboard.writeText('https://newsjeoul.co.kr').then(() => alert('링크 복사됨!'))
}

export default function NewsCard({ item }: { item: NewsItem }) {
  const cat = item.category || '정치'

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 12,
    }}>
      {/* 헤더 */}
      <div style={{padding:'12px 16px 10px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',flex:1,lineHeight:1.4}}>{item.title}</div>
        <div style={{
          fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:20,flexShrink:0,
          background: catColors[cat] || catColors['정치'],
          color: catTextColors[cat] || catTextColors['정치'],
          border: `1px solid ${catTextColors[cat] || catTextColors['정치']}33`,
        }}>{cat}</div>
      </div>

      {/* 본문 */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr'}}>
        <div style={{padding:'12px 16px',background:'var(--con-soft)',borderRight:'1px solid var(--border)'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--con)',marginBottom:5}}>🔴 보수 시각</div>
          <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:4}}>{item.conservative_outlet}</div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:6,lineHeight:1.4}}>{item.conservative_headline}</div>
          <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7}}>{item.conservative_summary}</div>
        </div>
        <div style={{padding:'12px 16px',background:'var(--lib-soft)'}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',color:'var(--lib)',marginBottom:5}}>🔵 진보 시각</div>
          <div style={{fontSize:11,color:'var(--muted)',fontWeight:600,marginBottom:4}}>{item.liberal_outlet}</div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text)',marginBottom:6,lineHeight:1.4}}>{item.liberal_headline}</div>
          <div style={{fontSize:12,color:'var(--text2)',lineHeight:1.7}}>{item.liberal_summary}</div>
        </div>
      </div>

      {/* 푸터 */}
      <div style={{padding:'8px 16px',background:'var(--bg2)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        <span style={{fontSize:9,fontWeight:700,color:'var(--lib)',whiteSpace:'nowrap'}}>진보</span>
        <div style={{flex:1,height:5,background:'var(--border2)',borderRadius:20,overflow:'hidden',minWidth:40}}>
          <div style={{height:'100%',borderRadius:20,background:'linear-gradient(90deg,var(--lib),var(--con))',width:`${item.bias_score||50}%`}}/>
        </div>
        <span style={{fontSize:9,fontWeight:700,color:'var(--con)',whiteSpace:'nowrap'}}>보수</span>

        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {item.conservative_url && (
            <a href={item.conservative_url} target="_blank" rel="noopener noreferrer" style={{
              padding:'4px 8px',borderRadius:8,fontSize:10,fontWeight:600,
              border:'1px solid rgba(230,57,70,.3)',color:'var(--con)',
              background:'transparent',textDecoration:'none',whiteSpace:'nowrap',
            }}>🔴 원문</a>
          )}
          {item.liberal_url && (
            <a href={item.liberal_url} target="_blank" rel="noopener noreferrer" style={{
              padding:'4px 8px',borderRadius:8,fontSize:10,fontWeight:600,
              border:'1px solid rgba(37,99,235,.3)',color:'var(--lib)',
              background:'transparent',textDecoration:'none',whiteSpace:'nowrap',
            }}>🔵 원문</a>
          )}
          <button onClick={() => shareItem('thread', item.title, item.bias_score, item.conservative_url, item.liberal_url)} style={{
            padding:'4px 8px',borderRadius:8,fontSize:10,fontWeight:600,
            border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',
            cursor:'pointer',whiteSpace:'nowrap',
          }}>스레드</button>
          <button onClick={() => shareItem('x', item.title, item.bias_score, item.conservative_url, item.liberal_url)} style={{
            padding:'4px 8px',borderRadius:8,fontSize:10,fontWeight:600,
            border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',
            cursor:'pointer',whiteSpace:'nowrap',
          }}>𝕏</button>
          <button onClick={() => shareItem('copy', item.title, item.bias_score, item.conservative_url, item.liberal_url)} style={{
            padding:'4px 8px',borderRadius:8,fontSize:10,fontWeight:600,
            border:'1px solid var(--border)',background:'var(--card)',color:'var(--muted)',
            cursor:'pointer',whiteSpace:'nowrap',
          }}>🔗</button>
        </div>
      </div>
    </div>
  )
}
