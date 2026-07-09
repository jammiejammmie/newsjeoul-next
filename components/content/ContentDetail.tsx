import type { GenericContentItem } from '@/lib/generic-content'

type ContentDetailProps = {
  label: string
  item: GenericContentItem
}

// guide/review/comparison/shopping_pick 공용 상세 레이아웃 — 실제 콘텐츠 파이프라인이
// 생기기 전까지의 최소 셸. 장르별 전용 섹션(리뷰 장단점, 비교표 등)은 필요해질 때 추가.
export default function ContentDetail({ label, item }: ContentDetailProps) {
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
      <p className="nj-badge-domain" style={{ color: 'var(--accent)' }}>{label}</p>
      <h1 style={{
        fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
        fontSize: 'clamp(24px,4vw,36px)', margin: '12px 0 20px', color: 'var(--text)',
      }}>
        {item.title}
      </h1>
      {item.summary && (
        <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.8, marginBottom: 24 }}>{item.summary}</p>
      )}
      {item.body && (
        <div style={{ fontSize: 14.5, color: 'var(--text2)', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>{item.body}</div>
      )}
    </div>
  )
}
