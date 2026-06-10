'use client'
import { useState } from 'react'
import Link from 'next/link'

const TOTAL = 20

export default function SilenceTop10({ stories }: { stories: any[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? stories : stories.slice(0, 5)
  const hasMore = stories.length > 5

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {shown.map((s, i) => {
          const n = s.story_articles?.length || 0
          return (
            <Link
              key={s.id}
              href={`/story/${s.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '12px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    fontFamily: "'Bebas Neue', cursive",
                    fontSize: 14,
                    color: 'var(--muted)',
                    width: 20,
                    flexShrink: 0,
                    paddingTop: 2,
                    textAlign: 'right',
                  }}
                >
                  {i + 1}
                </span>
                <p
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    lineHeight: 1.5,
                  }}
                >
                  {s.title}
                </p>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--muted)',
                    flexShrink: 0,
                    paddingTop: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {TOTAL}개 중 {n}개
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 12,
            width: '100%',
            padding: '9px 0',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--muted)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {expanded ? '접기 ↑' : `+ ${stories.length - 5}개 더 보기`}
        </button>
      )}
    </div>
  )
}
