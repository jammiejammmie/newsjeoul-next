import CardShell, { type EditorPersona } from '../CardShell'

type FeatureCardProps = {
  href: string
  domain: string
  domainColor: string
  heatLabel: string
  label: string
  body: string
  colSpan?: number
  rowSpan?: number
  editorPersona?: EditorPersona
  onClick?: () => void
}

// 오늘 가장 무거운 토픽 — v5 매거진 그리드의 큐레이션 슬롯 (홈페이지가 직접 조립)
export default function FeatureCard({
  href, domain, domainColor, heatLabel, label, body, colSpan = 3, rowSpan = 2, editorPersona, onClick,
}: FeatureCardProps) {
  return (
    <CardShell
      href={href}
      colSpan={colSpan}
      rowSpan={rowSpan}
      bg="rgba(217,164,65,0.07)"
      border="rgba(217,164,65,0.28)"
      padding="26px"
      justify="space-between"
      hoverBorder="#D9A441"
      hoverTransform="translateY(-4px)"
      editorPersona={editorPersona}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: domainColor, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          {domain}
        </span>
        <span style={{ fontSize: 11, color: '#605D54', fontWeight: 600 }}>{heatLabel}</span>
      </div>
      <div style={{ fontSize: 'clamp(20px,1.6vw,26px)', fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
        {label}
      </div>
      <p style={{ fontSize: 13.5, color: '#B8B4A8', lineHeight: 1.65, margin: 0, flex: 1 }}>{body}</p>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>탐험하기 →</div>
    </CardShell>
  )
}
