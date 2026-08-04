import CardShell, { type EditorPersona } from '../CardShell'

type ShoppingCardProps = {
  href: string
  label: string
  meta?: string
  colSpan?: number
  rowSpan?: number
  editorPersona?: EditorPersona
}

// 쇼핑 추천 — content_type 'shopping_pick'의 렌더러
// 임시 비주얼: NodeCard 셰이프 재사용, 디자인팀 산출물 나오면 교체.
export default function ShoppingCard({
  href, label, meta, colSpan = 2, rowSpan = 1, editorPersona,
}: ShoppingCardProps) {
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
      hoverBorder="rgba(217,164,65,0.3)"
      hoverTransform="translateY(-3px)"
      editorPersona={editorPersona}
    >
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        쇼핑
      </span>
      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.45 }}>{label}</div>
      {meta && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{meta}</span>}
    </CardShell>
  )
}
