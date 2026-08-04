import CardShell from '../CardShell'

type TimelineEvent = { time: string; title: string }

type TimelineCardProps = {
  events: TimelineEvent[]
  colSpan?: number
  rowSpan?: number
}

// 오늘의 흐름 — 홈페이지 큐레이션 슬롯 (아카이브형 콘텐츠가 아니라 이벤트 나열이라 registry에 없음)
export default function TimelineCard({ events, colSpan = 6, rowSpan = 2 }: TimelineCardProps) {
  return (
    <CardShell
      colSpan={colSpan}
      rowSpan={rowSpan}
      bg="var(--bg2)"
      border="var(--border)"
      padding="22px"
      justify="flex-start"
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 2 }}>
        오늘의 흐름
      </div>
      <div style={{ display: 'flex', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
        {events.map((ev, i) => (
          <div key={i} style={{
            flex: '0 0 auto', padding: '0 18px', borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130,
          }}>
            <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 14, color: 'var(--accent)' }}>
              {ev.time}
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', lineHeight: 1.4 }}>{ev.title}</span>
          </div>
        ))}
      </div>
    </CardShell>
  )
}
