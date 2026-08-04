import CardShell, { type EditorPersona } from '../CardShell'

type GuideCardProps = {
  href: string
  label: string
  meta?: string
  colSpan?: number
  rowSpan?: number
  editorPersona?: EditorPersona
}

// 가이드(How-to) — content_type 'guide'의 렌더러
// 임시 비주얼: v5 확정 카드 5종에 아직 없는 신규 장르라 NodeCard의 중립 셰이프를 그대로 재사용.
// 디자인팀 산출물이 나오면 교체.
export default function GuideCard({
  href, label, meta, colSpan = 2, rowSpan = 1, editorPersona,
}: GuideCardProps) {
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
    >
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
        가이드
      </span>
      <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.45 }}>{label}</div>
      {meta && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{meta}</span>}
    </CardShell>
  )
}
