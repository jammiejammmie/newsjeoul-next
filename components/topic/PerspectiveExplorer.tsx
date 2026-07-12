'use client'

import { useState } from 'react'
import HeroImage from '@/components/story/HeroImage'

// Editorial Engine이 생성한 draft.blocks(축별 문단)를 "이 주제를 어디서부터 탐험할까요" 형태로
// 보여준다 — 포르쉐 Topic 탐험 목업의 관점 탭 UI를, 실제 데이터 형태(관점 라벨이 아니라 축 단위
// 블록)에 맞게 적용한 것. 목업처럼 서로 다른 엔티티로 전환되는 게 아니라 같은 글 안의 축을 오간다.
export type Block = { axis: string; content: string; image?: string; imageCaption?: string }

// 첫 문장을 분리해 볼드 처리 — 핵심 문장을 먼저 눈에 띄게 한다(2026-07-12, 가독성 개선)
function renderWithLeadEmphasis(text: string) {
  const match = text.match(/^.+?[.!?](?=\s|$)/)
  if (!match) return text
  const first = match[0]
  const rest = text.slice(first.length)
  return (
    <>
      <strong style={{ fontWeight: 700 }}>{first}</strong>
      {rest}
    </>
  )
}

// 본문을 빈 줄 기준으로 문단 분리해 각각 <p>로 렌더링 — 긴 문단 하나로 몰리는 걸 막는다
// (2026-07-12, PM 지시 — 문단 길이 개선). 첫 문단에만 첫 문장 강조를 적용한다.
function renderParagraphs(text: string) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  if (paragraphs.length <= 1) {
    return <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', lineHeight: 1.95 }}>{renderWithLeadEmphasis(text)}</p>
  }
  return (
    <>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', lineHeight: 1.95, marginBottom: i < paragraphs.length - 1 ? 16 : 0 }}>
          {i === 0 ? renderWithLeadEmphasis(p) : p}
        </p>
      ))}
    </>
  )
}

export default function PerspectiveExplorer({ blocks }: { blocks: Block[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  if (!blocks.length) return null
  const active = blocks[activeIdx]

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>
        이 주제를 어디서부터 탐험할까요
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
        {blocks.map((b, i) => (
          <button
            key={b.axis + i}
            onClick={() => setActiveIdx(i)}
            style={{
              textAlign: 'left', cursor: 'pointer', borderRadius: 14, padding: '14px 16px',
              border: `1px solid ${i === activeIdx ? 'var(--accent)' : 'var(--border)'}`,
              background: i === activeIdx ? 'var(--accent-soft)' : 'var(--card)',
              color: 'var(--text)', fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{b.axis}</span>
          </button>
        ))}
      </div>
      <div key={activeIdx} style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14 }}>
          {active.axis}
        </div>
        {active.image && (
          <div style={{ maxWidth: 480, margin: '0 auto' }}>
            <HeroImage src={active.image} />
          </div>
        )}
        {active.image && active.imageCaption && (
          <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: -12, marginBottom: 20 }}>{active.imageCaption}</p>
        )}
        {renderParagraphs(active.content)}
      </div>
    </section>
  )
}
