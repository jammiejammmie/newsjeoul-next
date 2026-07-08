type TagProps = {
  category?: string
  value: string
}

// "카테고리 · 값" 형식 — 드로어 본문 하단 엔티티 태그 칩 (디자인 시스템 가이드 기준)
export default function Tag({ category, value }: TagProps) {
  return (
    <span className="nj-tag-chip">
      {category ? `${category} · ${value}` : value}
    </span>
  )
}
