'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: '80px 24px', gap: 20,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--rose)' }}>
        오류
      </div>
      <h1 style={{
        fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
        fontSize: 'clamp(24px,4vw,36px)', color: 'var(--text)', margin: 0,
      }}>
        잠시 무게가 흔들렸습니다
      </h1>
      <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 400, lineHeight: 1.7 }}>
        페이지를 불러오는 중 문제가 발생했습니다. 다시 시도해주세요.
      </p>
      <button onClick={reset} className="nj-btn-primary" style={{ marginTop: 8 }}>
        다시 시도
      </button>
    </div>
  )
}
