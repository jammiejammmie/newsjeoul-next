import { findAffiliateSlot } from '@/lib/hubs'
import type { HubAffiliateSlot } from '@/lib/hubs'
import type { AffiliatePlacement } from '@/lib/affiliate-placements'
import './affiliate.css'

export default function AffiliatePanel({ placement, fallback = [], title = '쿠팡에서 상품 보기', compact = false, position = 'bottom' }: {
  placement: AffiliatePlacement | null
  fallback?: HubAffiliateSlot[]
  title?: string
  compact?: boolean
  position?: string
}) {
  const candidates = placement
    ? placement.slots.flatMap(id => { const found = findAffiliateSlot(id); return found?.entry.targetUrl ? [found.entry] : [] })
    : fallback.filter(slot => slot.targetUrl)
  const slots = [...new Map(candidates.map(slot => [slot.slot, slot])).values()]
  if (!slots.length) return null
  return (
    <aside aria-label="쿠팡 파트너스 광고" data-affiliate-panel data-affiliate-position={position} className={`affiliate-panel${compact ? ' affiliate-compact' : ''}`}>
      <span className="affiliate-label">광고 · 쿠팡 파트너스</span>
      <strong className="affiliate-title">{title}</strong>
      <p className="affiliate-disclosure">이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      {placement?.context && <p className="affiliate-context">{placement.context}</p>}
      <div className="affiliate-products">
        {slots.map(slot => (
          <a key={slot.slot} href={`/go/${slot.slot}`} rel="sponsored nofollow noopener noreferrer" target="_blank" className="affiliate-product">
            <span className="affiliate-product-name">{slot.label}</span>
            <span className="affiliate-cta">쿠팡 가격·옵션 보기 <span aria-hidden="true">↗</span></span>
          </a>
        ))}
      </div>
    </aside>
  )
}
