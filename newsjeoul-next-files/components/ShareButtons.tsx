'use client'

interface ShareButtonsProps {
  url: string
  text: string
}

export default function ShareButtons({ url, text }: ShareButtonsProps) {
  const share = (type: string) => {
    if (type === 'thread') window.open('https://www.threads.net/intent/post?text=' + encodeURIComponent(text + '\n' + url), '_blank')
    else if (type === 'x') window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url), '_blank')
    else if (type === 'kakao') alert('카카오 공유 준비 중입니다')
    else navigator.clipboard.writeText(url).then(() => alert('링크 복사됨!'))
  }

  const btnStyle = (bg: string, color: string, border?: string) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 5,
    padding: '7px 12px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer' as const,
    border: border || 'none',
    background: bg,
    color,
    fontFamily: "'Noto Sans KR', sans-serif",
    whiteSpace: 'nowrap' as const,
    transition: 'opacity .15s',
  })

  return (
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      <button onClick={() => share('thread')} style={btnStyle('#000','#fff','1px solid #333')}>스레드 공유</button>
      <button onClick={() => share('x')} style={btnStyle('#111','#fff','1px solid #444')}>𝕏 공유</button>
      <button onClick={() => share('kakao')} style={btnStyle('#FAE100','#000')}>카카오 공유</button>
      <button onClick={() => share('copy')} style={btnStyle('var(--card)','var(--text)','1px solid var(--border2)')}>🔗 링크 복사</button>
    </div>
  )
}
