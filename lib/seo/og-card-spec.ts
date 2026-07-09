// og/route.tsx와 브랜드 키트 OG 스펙이 공유하는 카드 라벨 표.
// 새 카드 종류가 늘어도 이 표에 한 줄 추가하면 되고, og/route.tsx 코드는 안 건드린다.
export const OG_CARD_SPECS: Record<string, { label: string }> = {
  weight: { label: '오늘의 무게' },
  topic: { label: '오늘의 이슈' },
  connection: { label: '의외의 연결' },
  entity: { label: '관련 이슈' },
  guide: { label: '가이드' },
  review: { label: '리뷰' },
  comparison: { label: '비교' },
  shopping_pick: { label: '쇼핑' },
}

export const DEFAULT_OG_TYPE = 'topic'
