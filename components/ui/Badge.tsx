import type { ReactNode } from 'react'
import { badgeColors } from '@/lib/design-tokens'

type StatusKind = keyof typeof badgeColors

// badgeColors의 hex 값과 1:1 대응하는 rgb 트리플 — rgba() 투명도 배경/보더 생성용
const STATUS_RGB: Record<StatusKind, string> = {
  rising: '124,194,184',
  falling: '224,153,107',
  surging: '217,164,65',
  popular: '217,164,65',
  new: '124,140,255',
  connection: '185,140,255',
}

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
