'use client'

import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'

export type Breadcrumb = {
  label: string
  color?: string
  active?: boolean
  onClick?: () => void
}

type ExploreDrawerProps = {
  open: boolean
  onClose: () => void
  breadcrumb: Breadcrumb[]
  domain?: string
  domainColor?: string
  title: string
  children: ReactNode
}

// 콘텐츠 타입에 무관한 범용 드로어 셸. 데스크톱은 우측 슬라이드(520px/440px),
// 760px 이하는 하단 바텀시트(88vh)로 CSS만으로 전환된다 (반응형 기준표 그대로).
export default function ExploreDrawer({
  open, onClose, breadcrumb, domain, domainColor, title, children,
}: ExploreDrawerProps) {
  if (!open) return null

  return (
    <>
      <div className="nj-drawer-overlay" onClick={onClose} />
      <div className="nj-drawer-panel">
        <div className="nj-drawer-header">
          <div className="nj-drawer-breadcrumb">
            {breadcrumb.map((bc, i) => (
              <span key={i} className="nj-drawer-crumb">
                <button
                  className="nj-drawer-crumb-btn"
                  onClick={bc.onClick}
                  style={{ color: bc.color ?? (bc.active ? 'var(--text)' : 'var(--muted)') }}
                >
                  {bc.label}
                </button>
                {i < breadcrumb.length - 1 && <span>›</span>}
              </span>
            ))}
          </div>
          <Button variant="ghost-icon" onClick={onClose} aria-label="닫기">×</Button>
        </div>

        <div key={title} className="nj-drawer-body">
          {domain && (
            <div className="nj-drawer-domain" style={{ color: domainColor ?? 'var(--accent)' }}>
              {domain}
            </div>
          )}
          <h2 className="nj-drawer-title">{title}</h2>
          {children}
        </div>
      </div>
    </>
  )
}
