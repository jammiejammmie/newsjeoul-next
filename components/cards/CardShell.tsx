'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'

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
  // 실사 이미지 — CTR 우선 원칙(2026-07-10 결정)에 따라 있으면 카드 배경으로 꽉 채우고,
  // 하단부터 어두워지는 스크림을 얹어 그 위 텍스트가 항상 읽히게 한다. 없으면 기존 색상 카드 그대로.
  imageUrl?: string
  editorPersona?: EditorPersona
  // 성과 추적 훅 자리 — 지금은 아무도 호출하지 않음 (디지털 편집국 단계에서 실제 전송 로직 연결)
  onImpression?: () => void
  onClick?: () => void
  children: ReactNode
}

type CardStyle = CSSProperties & Record<string, string | number | undefined>

export default function CardShell({
  href, colSpan, rowSpan, bg, border, padding = '22px', justify = 'flex-start',
  hoverBg, hoverBorder, hoverTransform, imageUrl, onClick, children,
}: CardShellProps) {
  // 원문 이미지가 깨진 링크(만료된 인증서, 404, hotlink 차단 등)일 수 있어 로드 실패 시 자동으로
  // 기존 색상 카드로 폴백한다 — og:image URL을 저장할 때는 접근 가능했어도 이후 원본이 내려가거나
  // 언론사 CDN 인증서가 만료되는 경우가 실제로 있었다(2026-07-11 확인, pressian.com CDN 사례).
  const [imageBroken, setImageBroken] = useState(false)
  const showImage = imageUrl && !imageBroken

  const style: CardStyle = {
    gridColumn: `span ${colSpan}`,
    gridRow: `span ${rowSpan}`,
    padding,
    '--card-bg': bg,
    '--card-border': border,
    '--card-hover-bg': hoverBg,
    '--card-hover-border': hoverBorder,
    '--card-hover-transform': hoverTransform,
  }

  const content = (
    <div className="nj-card-shell" style={style}>
      {showImage && (
        <>
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageBroken(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
          />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: 'linear-gradient(180deg, rgba(11,11,13,.12) 0%, rgba(11,11,13,.52) 55%, rgba(11,11,13,.92) 100%)',
          }} />
        </>
      )}
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 10, height: '100%', justifyContent: justify }}>
        {children}
      </div>
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
