'use client'

export function YoutubeShareBtn({ lean }: { lean: string }) {
  const share = () => {
    const text = lean === 'con'
      ? '보수 유튜브 오늘 영상 — 가로세로연구소, 신의한수 최신 콘텐츠\n뉴스저울 → https://newsjeoul.co.kr/youtube'
      : '진보 유튜브 오늘 영상 — 김어준, 매불쇼 최신 콘텐츠\n뉴스저울 → https://newsjeoul.co.kr/youtube'
    window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(text), '_blank')
  }

  return (
    <button onClick={share} style={{
      padding:'5px 12px',borderRadius:8,fontSize:11,fontWeight:600,
      background: lean==='con'?'var(--con)':'var(--lib)',
      color:'#fff',border:'none',cursor:'pointer',
    }}>공유</button>
  )
}
