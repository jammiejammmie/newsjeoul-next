import CardShell from '../CardShell'

type WeightCardProps = {
  href?: string
  label: string
  body: string
  colSpan?: number
  rowSpan?: number
  onClick?: () => void
}

// 오늘 가장 무거운 순간 — 홈페이지 큐레이션 슬롯
export default function WeightCard({ href, label, body, colSpan = 3, rowSpan = 1, onClick }: WeightCardProps) {
  return (
    <CardShell
      href={href}
      colSpan={colSpan}
      rowSpan={rowSpan}
      bg="rgba(124,140,255,0.05)"
      border="rgba(124,140,255,0.18)"
      padding="22px"
      justify="center"
      onClick={onClick}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
        오늘 가장 무거운 순간
      </div>
      <div style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 22, color: 'var(--accent)', lineHeight: 1.3 }}>
        {label}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </CardShell>
  )
}
