// content_type → 카드 컴포넌트 이름 / SEO 스키마 타입 매핑 단일 소스.
// 새 콘텐츠 장르 추가 = 이 표에 한 줄 + 카드 컴포넌트 1개. 그리드/드로어/사이트맵/OG 로직은 안 건드림.
// (나중에 "담당 편집국" 컬럼을 추가하는 것이 디지털 편집국과의 연결점 — 지금은 추가하지 않음)
//
// Feature/Weight/Timeline 카드는 홈페이지가 직접 조립하는 큐레이션 슬롯이라 이 표에 없음
// (v5 디자인 소스도 동일한 구조 — heaviestTopic/weight-card/timeline-card는 별도로 push됨)

export const CONTENT_TYPES = {
  topic: { label: '이슈', card: 'NodeCard', schema: 'NewsArticle' },
  connection: { label: '의외의 연결', card: 'ConnectionCard', schema: 'NewsArticle' },
  guide: { label: '가이드', card: 'GuideCard', schema: 'HowTo' },
  review: { label: '리뷰', card: 'ReviewCard', schema: 'Product+Review' },
  comparison: { label: '비교', card: 'ComparisonCard', schema: 'ItemList' },
  shopping_pick: { label: '쇼핑', card: 'ShoppingCard', schema: 'Product' },
} as const

export type ContentType = keyof typeof CONTENT_TYPES
