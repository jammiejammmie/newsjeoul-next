import CardShell, { type EditorPersona } from '../CardShell'

type ConnectionCardProps = {
  href: string
  label: string
  body: string
  colSpan?: number
  rowSpan?: number
  editorPersona?: EditorPersona
  onClick?: () => void
}

// 의외의 연결 — content_type 'connection'의 렌더러
export default function ConnectionCard({
  href, label, body, colSpan = 3, rowSpan = 1, editorPersona, onClick,
}: ConnectionCardProps) {
  return (
    <CardShell
      href={href}
      colSpan={colSpan}
      rowSpan={rowSpan}
      bg="rgba(185,140,255,0.05)"
      border="rgba(185,140,255,0.2)"
      padding="22px"
      justify="center"
      hoverBorder="#B98CFF"
      editorPersona={editorPersona}
      onClick={onClick}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--violet)', marginBottom: 2 }}>
        의외의 연결
      </div>
      <div style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.45 }}>{label}</div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>{body}</p>
    </CardShell>
  )
}
