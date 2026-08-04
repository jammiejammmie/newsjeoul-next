import CardShell, { type EditorPersona } from '../CardShell'

type NodeCardProps = {
  href: string
  domain: string
  domainColor: string
  label: string
  colSpan?: number
  rowSpan?: number
  editorPersona?: EditorPersona
  onClick?: () => void
}

// 일반 이슈(Topic) 카드 — content_type 'topic'의 기본 렌더러 (registry.ts에서 매핑)
export default function NodeCard({
  href, domain, domainColor, label, colSpan = 2, rowSpan = 1, editorPersona, onClick,
}: NodeCardProps) {
  return (
    <CardShell
      href={href}
      colSpan={colSpan}
      rowSpan={rowSpan}
      bg="var(--card)"
      border="var(--border)"
      padding="18px"
      justify="space-between"
      hoverBg="var(--card2)"
      hoverBorder="rgba(200,16,46,0.3)"
      hoverTransform="translateY(-3px)"
      editorPersona={editorPersona}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: domainColor, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          {domain}
        </span>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: domainColor, opacity: 0.7 }} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.45 }}>{label}</div>
    </CardShell>
  )
}
