import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '80px 24px', gap: 20,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        404
      </div>
      <h1 style={{
        fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
        fontSize: 'clamp(24px,4vw,36px)', color: 'var(--text)', margin: 0,
      }}>
        여기까지 따라오셨습니다
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7 }}>
        찾으시는 페이지가 없거나 옮겨졌습니다.
      </p>
      <Link href="/" className="nj-btn-primary" style={{ textDecoration: 'none', marginTop: 8 }}>
        오늘의 무게로 돌아가기
      </Link>
    </div>
  )
}
