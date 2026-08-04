import type { ReactNode } from 'react'
import { badgeColors } from '@/lib/design-tokens'

type StatusKind = keyof typeof badgeColors

// rgba() 투명도 배경/보더 생성용 rgb 트리플.
//
// 예전엔 badgeColors의 hex와 1:1 대응하는 상수 맵을 손으로 유지했는데, v6 팔레트 전환에서
// badgeColors만 바꾸고 이 맵이 남아 색이 어긋났다(구 앰버 217,164,65가 그대로 남음).
// 병렬 상수를 유지하는 구조 자체가 문제였으므로 hex에서 파생하도록 바꿨다 —
// 이제 badgeColors만 고치면 여기가 따라온다.
function hexToRgbTriple(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

const STATUS_RGB = Object.fromEntries(
  (Object.keys(badgeColors) as StatusKind[]).map((k) => [k, hexToRgbTriple(badgeColors[k])])
) as Record<StatusKind, string>

type BadgeProps =
  | { kind: 'domain'; label: string; color: string }
  | { kind: 'status'; status: StatusKind; children: ReactNode }

export default function Badge(props: BadgeProps) {
  if (props.kind === 'domain') {
    return (
      <span className="nj-badge-domain" style={{ color: props.color }}>
        {props.label}
      </span>
    )
  }

  const rgb = STATUS_RGB[props.status]
  const color = badgeColors[props.status]
  return (
    <span
      className="nj-badge-status"
      style={{ color, background: `rgba(${rgb},.12)`, borderColor: `rgba(${rgb},.35)` }}
    >
      {props.children}
    </span>
  )
}
