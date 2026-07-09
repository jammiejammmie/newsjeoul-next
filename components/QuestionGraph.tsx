import { categoryIcon } from '@/lib/icons'

type GraphNode = { storyId: string; name: string; category: string | null; strength: number }

// Question Graph — 이 질문(중심)과 실제 topic_relations로 연결된 것만 노드로 그린다.
// "다음 질문" 목록과 달리 패딩(부족분 채움)이 없다 — 그래프의 선은 곧 진짜 연결을 뜻하기 때문.
// 서버 컴포넌트(정적 SVG)로 만들어 클라이언트 JS 없이도 링크가 동작한다.
export default function QuestionGraph({
  nodes,
}: {
  nodes: GraphNode[]
}) {
  if (nodes.length === 0) return null

  const W = 640
  const H = 420
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(W, H) / 2 - 96
  const maxStrength = Math.max(...nodes.map((n) => n.strength || 0), 1)

  const positioned = nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
    return { ...n, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: 'auto', display: 'block' }}>
        {positioned.map((n) => {
          const t = (n.strength || 0) / maxStrength
          return (
            <line
              key={`edge-${n.storyId}`}
              x1={cx} y1={cy} x2={n.x} y2={n.y}
              stroke="var(--accent)"
              strokeWidth={1 + t * 1.6}
              strokeOpacity={0.22 + t * 0.4}
            />
          )
        })}

        <circle cx={cx} cy={cy} r={34} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={1.5} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--text)">지금 여기</text>

        {positioned.map((n) => (
          <a key={n.storyId} href={`/story/${n.storyId}`}>
            <title>{n.name}</title>
            <circle cx={n.x} cy={n.y} r={26} fill="var(--card)" stroke="var(--border2)" strokeWidth={1.5} />
            <text x={n.x} y={n.y - 34} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--text)">
              {n.name.length > 14 ? n.name.slice(0, 14) + '…' : n.name}
            </text>
            {n.category && (
              <text x={n.x} y={n.y + 5} textAnchor="middle" fontSize={14}>{categoryIcon(n.category)}</text>
            )}
          </a>
        ))}
      </svg>
      <p style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
        선이 굵을수록 더 강하게 연결된 질문입니다 — 노드를 눌러 이어서 탐험해보세요
      </p>
    </div>
  )
}
