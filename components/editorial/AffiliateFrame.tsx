import type { ReactNode } from 'react'
import type { HubAffiliateSlot } from '@/lib/hubs'
import type { AffiliatePlacement } from '@/lib/affiliate-placements'
import AffiliatePanel from './AffiliatePanel'

export default function AffiliateFrame({ children, placement, fallback = [], home = false }: {
  children: ReactNode; placement: AffiliatePlacement | null; fallback?: HubAffiliateSlot[]; home?: boolean
}) {
  const enabled = !!(placement?.slots.length || fallback.some(slot => slot.targetUrl))
  if (!enabled) return <>{children}</>
  return <div className={`affiliate-frame${home ? ' affiliate-frame-home' : ''}`}>
    <div className="affiliate-rail affiliate-rail-left"><div className="affiliate-rail-sticky"><AffiliatePanel placement={placement} fallback={fallback.slice(0, 2)} title="구매 전 가격 확인" compact position="left" /></div></div>
    <div className="affiliate-main">{children}</div>
    <div className="affiliate-rail affiliate-rail-right"><div className="affiliate-rail-sticky"><AffiliatePanel placement={placement} fallback={fallback.slice(-2)} title="판매 옵션 비교" compact position="right" /></div></div>
  </div>
}
