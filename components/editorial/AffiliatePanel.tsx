import { findAffiliateSlot } from '@/lib/hubs'
import type { HubAffiliateSlot } from '@/lib/hubs'
import type { AffiliatePlacement } from '@/lib/affiliate-placements'

export default function AffiliatePanel({ placement, fallback = [] }: {
  placement: AffiliatePlacement | null
  fallback?: HubAffiliateSlot[]
}) {
  const slots = placement
    ? placement.slots.flatMap(id => { const found = findAffiliateSlot(id); return found?.entry.targetUrl ? [found.entry] : [] })
    : fallback.filter(slot => slot.targetUrl)
  if (!slots.length) return null
  return (
    <aside aria-label="쿠팡 파트너스 광고" data-affiliate-panel style={{ margin: '28px 0', padding: 16, border: '1px solid var(--line, #d8d8d0)', borderRadius: 12, background: 'var(--paper2, #f5f4ee)' }}>
      <strong style={{ fontSize: 15 }}>광고 · 쿠팡에서 상품 보기</strong>
      <p style={{ fontSize: 12, lineHeight: 1.7, margin: '8px 0' }}>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      {placement && <p style={{ fontSize: 12, lineHeight: 1.7, margin: '8px 0 12px' }}>{placement.context}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 8 }}>
        {slots.map(slot => (
          <a key={slot.slot} href={`/go/${slot.slot}`} rel="sponsored nofollow noopener noreferrer" target="_blank" style={{ padding: 12, border: '1px solid var(--line, #d8d8d0)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8, textDecoration: 'none' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{slot.label}</span>
            <span style={{ fontSize: 12 }}>판매가·구성 확인 →</span>
          </a>
        ))}
      </div>
    </aside>
  )
}
