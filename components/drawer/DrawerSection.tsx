import Link from 'next/link'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'

// 드로어 내부 블록들 — 콘텐츠 타입별로 조합만 다르게 쓰면 드로어 셸은 그대로 재사용된다.
// (예: 리뷰는 여기에 장단점 섹션을, 비교글은 비교표 섹션을 추가로 조합)

export function DrawerBody({ text }: { text: string }) {
  return <p style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.85, margin: '0 0 22px' }}>{text}</p>
}

export function DrawerTags({ tags }: { tags: { category?: string; value: string }[] }) {
  if (tags.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
      {tags.map((t, i) => (
        <Tag key={i} category={t.category} value={t.value} />
      ))}
    </div>
  )
}

export function DrawerArticles({ articles }: { articles: { title: string; source?: string; href?: string }[] }) {
  if (articles.length === 0) return null
  return (
    <div className="nj-drawer-articles">
      {articles.map((a, i) => {
        const row = (
          <div className="nj-drawer-article-row">
            <span style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</span>
            {a.source && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.source}</span>
            )}
          </div>
        )
        return a.href
          ? <Link key={i} href={a.href} style={{ textDecoration: 'none', color: 'inherit' }}>{row}</Link>
          : <div key={i}>{row}</div>
      })}
    </div>
  )
}

export type NextQuestionItem = { label: string; socialProof: string; onClick: () => void }

export function DrawerNextQuestions({ items }: { items: NextQuestionItem[] }) {
  if (items.length === 0) return <DrawerLeaf />
  return (
    <div>
      <div className="nj-drawer-section-label">다음으로 이어지는 질문</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, i) => (
          <Button
            key={i}
            variant="secondary"
            onClick={item.onClick}
            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 5 }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>{item.label}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{item.socialProof}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}

export function DrawerLeaf() {
  return <div className="nj-drawer-leaf">여기까지 따라오셨습니다 — 다른 곳도 눌러보세요</div>
}
