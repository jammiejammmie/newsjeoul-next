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
          const rank = i + 1
          const isTop3 = rank <= 3

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
                  padding: '14px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {/* Rank — number first, big */}
                <span
                  style={{
                    fontFamily: "'Bebas Neue', cursive",
                    fontSize: 28,
                    lineHeight: 1,
                    color: rank === 1 ? 'var(--accent)' : isTop3 ? 'var(--text2)' : 'var(--muted)',
                    width: 36,
                    flexShrink: 0,
                    paddingTop: 2,
                  }}
                >
                  #{rank}
                </span>

                {/* Stat first, then title */}
                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: isTop3 ? 'var(--accent)' : 'var(--muted)',
                      marginBottom: 5,
                      letterSpacing: '.02em',
                    }}
                  >
                    {TOTAL}개 언론사 중 {n}개만 보도
                  </p>
                  <p
                    style={{
                      fontSize: isTop3 ? 14 : 13,
                      fontWeight: isTop3 ? 700 : 500,
                      color: 'var(--text)',
                      lineHeight: 1.5,
                    }}
                  >
                    {s.title}
                  </p>
                </div>
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
