import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import ShareButtons from '@/components/ShareButtons'
import { YoutubeShareBtn } from '@/components/YoutubeShareBtn'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '유튜브 비교 — 뉴스저울',
  description: '보수 vs 진보 유튜브 채널 최신 영상 비교',
  openGraph: {
    title: '유튜브 비교 — 뉴스저울',
    description: '가로세로연구소, 신의한수 vs 김어준, 매불쇼 — 오늘 뭘 다뤘나요?',
    images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
  },
}

async function getChannels() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase.from('youtube_channels').select('*').order('subscriber_count', { ascending: false })
  return data || []
}

function formatSubs(n: number | null) {
  if (!n) return ''
  if (n >= 10000000) return Math.floor(n/10000000) + '천만'
  if (n >= 1000000) return (Math.floor(n/100000)/10) + '백만'
  if (n >= 10000) return Math.floor(n/10000) + '만'
  return n.toLocaleString()
}

export default async function YoutubePage() {
  const channels = await getChannels()
  const conChannels = channels.filter((c: any) => c.lean === 'conservative')
  const libChannels = channels.filter((c: any) => c.lean === 'liberal')

  const ChannelCard = ({ ch, lean }: { ch: any, lean: string }) => (
    <div style={{background:'var(--card)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',marginBottom:10}}>
      {ch.latest_video_thumbnail ? (
        <img src={ch.latest_video_thumbnail} alt={ch.latest_video_title||''} style={{width:'100%',aspectRatio:'16/9',objectFit:'cover',display:'block'}} />
      ) : (
        <div style={{width:'100%',aspectRatio:'16/9',background:'var(--bg2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32}}>📺</div>
      )}
      <div style={{padding:'12px 14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
          {ch.thumbnail_url && <img src={ch.thumbnail_url} alt={ch.channel_name} style={{width:28,height:28,borderRadius:'50%',objectFit:'cover'}} />}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text2)'}}>{ch.channel_name}</div>
            {ch.subscriber_count && <div style={{fontSize:10,color:'var(--muted)'}}>구독자 {formatSubs(ch.subscriber_count)}명</div>}
          </div>
        </div>
        <div style={{fontSize:12,fontWeight:600,color:'var(--text)',lineHeight:1.5,marginBottom:6}}>{ch.latest_video_title||'최신 영상 없음'}</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:10,color:'var(--muted)'}}>{ch.latest_video_date||''}</div>
          {ch.latest_video_id && (
            <a href={`https://youtube.com/watch?v=${ch.latest_video_id}`} target="_blank" rel="noopener noreferrer" style={{
              padding:'4px 10px',borderRadius:8,fontSize:10,fontWeight:700,
              background: lean==='con'?'var(--con-soft)':'var(--lib-soft)',
              color: lean==='con'?'var(--con)':'var(--lib)',
              border: `1px solid ${lean==='con'?'rgba(230,57,70,.2)':'rgba(37,99,235,.2)'}`,
              textDecoration:'none',
            }}>▶ 보기</a>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{maxWidth:1100,margin:'0 auto',padding:'0 16px'}}>
      <div style={{padding:'28px 0 22px',borderBottom:'1px solid var(--border)',marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>유튜브 채널 비교</div>
        <h1 style={{fontFamily:"'Noto Serif KR',serif",fontSize:'clamp(20px,3.5vw,34px)',lineHeight:1.35,marginBottom:8}}>
          보수 vs 진보 유튜브,<br/>오늘은 뭘 다뤘나요?
        </h1>
        <p style={{fontSize:13,color:'var(--text2)',lineHeight:1.8,marginBottom:14}}>
          가로세로연구소, 신의한수 vs 김어준, 매불쇼 — 같은 날 어떤 콘텐츠를 올렸는지 나란히 비교합니다.
        </p>
        <ShareButtons url="https://newsjeoul.co.kr/youtube" text="보수 vs 진보 유튜브 오늘 영상 비교 — 뉴스저울" />
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--con)',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:3,height:14,borderRadius:2,background:'var(--con)'}}/> 🔴 보수 유튜브
            </div>
            <YoutubeShareBtn lean="con" />
          </div>
          {conChannels.map((ch: any) => <ChannelCard key={ch.id} ch={ch} lean="con" />)}
        </div>
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.14em',textTransform:'uppercase',color:'var(--lib)',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:3,height:14,borderRadius:2,background:'var(--lib)'}}/> 🔵 진보 유튜브
            </div>
            <YoutubeShareBtn lean="lib" />
          </div>
          {libChannels.map((ch: any) => <ChannelCard key={ch.id} ch={ch} lean="lib" />)}
        </div>
      </div>
    </div>
  )
}
