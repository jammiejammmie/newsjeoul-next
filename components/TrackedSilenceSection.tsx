// @deprecated 구 "침묵지수" 정체성 컴포넌트. 어디서도 import되지 않음(2026-07-09 확인).
// v5 브랜드 전환 이후 폐기 대상 — 삭제는 별도 승인 후 진행.
export default function TrackedSilenceSection({
  stories,
}: {
  stories: any[]
}) {
  if (!stories.length) return null

  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          marginBottom: 6,
        }}>
          추적 중인 침묵
        </p>
        <h2 style={{
          fontFamily: "'Noto Serif KR', serif",
          fontSize: 'clamp(18px,2.5vw,24px)',
          fontWeight: 700,
          color: 'var(--text)',
        }}>
          아직 침묵 중인 뉴스
        </h2>
      </div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {stories.map((s: any) => (
          <a
            key={s.id}
            href={`/story/${s.id}`}
            style={{ textDecoration: 'none' }}
          >
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: '14px 16px',
            }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--accent)',
                display: 'block',
                marginBottom: 6,
              }}>
                침묵지수 {s.silence_score}
              </span>
              <p style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                lineHeight: 1.5,
                margin: 0,
              }}>
                {s.title}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  )
}
