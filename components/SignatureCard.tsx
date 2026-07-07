import Link from 'next/link'
import { seedGradient } from '@/lib/icons'

// 뉴스저울 시그니처 카드 — 외부 이미지 없이 색상+아이콘+텍스트로 만드는 대표 이미지 레이어.
// Topic/Entity/Category/오늘의 카드 등 전 화면에서 재사용한다(카드뉴스 재사용 설계 원칙).
export default function SignatureCard({
  href, seed, icon, badge, title, subtitle, size = 'md',
}: {
  href?: string
  seed: string
  icon: string
  badge?: string
  title: string
  subtitle?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const blockHeight = size === 'lg' ? 120 : size === 'sm' ? 56 : 84
  const iconSize = size === 'lg' ? 40 : size === 'sm' ? 22 : 30

  const content = (
    <div className="nj-sig-card">
      <div className="nj-sig-card-block" style={{ background: seedGradient(seed), height: blockHeight }}>
        {badge && <span className="nj-sig-card-badge">{badge}</span>}
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
