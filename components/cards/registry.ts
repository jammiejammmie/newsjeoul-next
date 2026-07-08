import { CONTENT_TYPES, type ContentType } from '@/lib/content-types'
import NodeCard from './variants/NodeCard'
import ConnectionCard from './variants/ConnectionCard'
import GuideCard from './variants/GuideCard'
import ReviewCard from './variants/ReviewCard'
import ComparisonCard from './variants/ComparisonCard'
import ShoppingCard from './variants/ShoppingCard'

// content_type → 실제 카드 컴포넌트. lib/content-types.ts(데이터 전용, React 의존 없음)와
// 분리해서, sitemap/schema 같은 서버 전용 코드가 컴포넌트를 끌어오지 않아도 되게 한다.
export const CARD_COMPONENTS = {
  topic: NodeCard,
  connection: ConnectionCard,
  guide: GuideCard,
  review: ReviewCard,
  comparison: ComparisonCard,
  shopping_pick: ShoppingCard,
} satisfies Record<ContentType, unknown>

export { CONTENT_TYPES }
export type { ContentType }
