import type { ReactNode } from 'react'
import type { HubAffiliateSlot } from '@/lib/hubs'
import type { AffiliatePlacement } from '@/lib/affiliate-placements'
import AffiliatePanel from './AffiliatePanel'

export default function AffiliateFrame({ children, placement, fallback = [], home = false }: {
  children: ReactNode; placement: AffiliatePlacement | null; fallback?: HubAffiliateSlot[]; home?: boolean
}) {
  const ids = placement?.slots ?? fallback.filter(s=>s.targetUrl).map(s=>s.slot)
  const leftIds = ids.slice(0,1), rightIds=ids.slice(1,2)
  const leftPlacement = leftIds.length ? {slots:leftIds,context:placement?.context??'',productPrompts:placement?.productPrompts}:null
  const rightPlacement = rightIds.length ? {slots:rightIds,context:placement?.context??'',productPrompts:placement?.productPrompts}:null
  const enabled = !!(placement?.slots.length || fallback.some(slot => slot.targetUrl))
  if (!enabled) return <>{children}</>
  return <div className={`affiliate-frame${home ? ' affiliate-frame-home' : ''}`}>
    <div className="affiliate-rail affiliate-rail-left"><div className="affiliate-rail-sticky"><AffiliatePanel placement={leftPlacement} fallback={fallback.filter(s=>leftIds.includes(s.slot))} title="구매 전 가격 확인" compact position="left" /></div></div>
    <div className="affiliate-main">{children}</div>
    {rightIds.length > 0 && <div className="affiliate-rail affiliate-rail-right"><div className="affiliate-rail-sticky"><AffiliatePanel placement={rightPlacement} fallback={fallback.filter(s=>rightIds.includes(s.slot))} title="판매 옵션 비교" compact position="right" /></div></div>}
  </div>
}
