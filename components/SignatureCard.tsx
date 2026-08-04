import Link from 'next/link'
import { seedGradient } from '@/lib/icons'
import BriefBadge from '@/components/BriefBadge'

// 뉴스저울 시그니처 카드 — 외부 이미지 없이 색상+아이콘+텍스트로 만드는 대표 이미지 레이어.
// Topic/Entity/Category/오늘의 카드 등 전 화면에서 재사용한다(카드뉴스 재사용 설계 원칙).
export default function SignatureCard({
  href, seed, icon, badge, title, subtitle, size = 'md', brief = false,
}: {
  href?: string
  seed: string
  icon: string
  badge?: string
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
  /** 단문(Brief) Topic이면 true — 카테고리 배지와 겹치지 않게 반대쪽 모서리에 표시한다. */
  brief?: boolean
}) {
  const blockHeight = size === 'lg' ? 120 : size === 'sm' ? 56 : 84
  const iconSize = size === 'lg' ? 40 : size === 'sm' ? 22 : 30

  const content = (
    <div className="nj-sig-card">
      <div className="nj-sig-card-block" style={{ background: seedGradient(seed), height: blockHeight }}>
        {badge && <span className="nj-sig-card-badge">{badge}</span>}
        {/* 카테고리 배지는 좌상단(.nj-sig-card-badge)이므로 Brief는 우상단에 둔다 — 둘이 겹치지 않게. */}
        {brief && (
          <span style={{ position: 'absolute', top: 8, right: 8 }}>
            <BriefBadge size="sm" />
          </span>
        )}
        <span style={{ fontSize: iconSize }}>{icon}</span>
      </div>
      <div className="nj-sig-card-body">
        <p className="nj-sig-card-title">{title}</p>
        {subtitle && <p className="nj-sig-card-subtitle">{subtitle}</p>}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>{content}</Link>
  }
  return content
}
