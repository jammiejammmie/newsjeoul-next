import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

// 디지털 편집국 연결 자리 — 지금은 항상 undefined, 에디터 시스템이 채우기 시작하면
// 카드 컴포넌트를 고치지 않고도 표시가 자연스럽게 나타남
export type EditorPersona = {
  name?: string
  styleTag?: string
  avatarColor?: string
}

export type CardShellProps = {
  href?: string
  colSpan: number
  rowSpan: number
  bg: string
  border: string
  padding?: string
  justify?: CSSProperties['justifyContent']
  hoverBg?: string
  hoverBorder?: string
  hoverTransform?: string
  editorPersona?: EditorPersona
  // 성과 추적 훅 자리 — 지금은 아무도 호출하지 않음 (디지털 편집국 단계에서 실제 전송 로직 연결)
  onImpression?: () => void
  onClick?: () => void
  children: ReactNode
}

type CardStyle = CSSProperties & Record<string, string | number | undefined>

export default function CardShell({
  href, colSpan, rowSpan, bg, border, padding = '22px', justify = 'flex-start',
  hoverBg, hoverBorder, hoverTransform, onClick, children,
}: CardShellProps) {
  const style: CardStyle = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
    padding,
    justifyContent: justify,
    '--card-bg': bg,
    '--card-border': border,
    '--card-hover-bg': hoverBg,
    '--card-hover-border': hoverBorder,
    '--card-hover-transform': hoverTransform,
  }

  const content = (
    <div className="nj-card-shell" style={style}>
      {children}
    </div>
  )

  if (!href) return content

  // href는 크롤러/JS 미지원 환경을 위한 실제 이동 경로로 유지하고,
  // onClick이 있으면 JS 환경에서는 기본 이동을 막고 드로어를 여는 쪽으로 가로챈다.
  return (
    <Link
      href={href}
      style={{ display: 'contents' }}
      onClick={onClick ? (e) => { e.preventDefault(); onClick() } : undefined}
    >
      {content}
    </Link>
  )
}
