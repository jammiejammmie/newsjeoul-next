// @deprecated 구 "보수/진보 유튜브 비교" 정체성 컴포넌트. app/youtube가 redirect 처리되며 어디서도 import되지 않음(2026-07-10 확인).
// v5 브랜드 전환 이후 폐기 대상 — 삭제는 별도 승인 후 진행.
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
