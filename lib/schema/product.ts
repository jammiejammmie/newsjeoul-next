// Product 스키마 — 평점·리뷰가 실재할 때만 쓴다.
//
// 2026-08-07 Search Console "제품 스니펫 — review, aggregateRating 누락" 대응.
// 이전에는 shop/review 페이지가 name·description만 담은 Product를 발행했다. Google은
// Product를 제품 스니펫 후보로 잡고 review 또는 aggregateRating을 요구하는데, 뉴스저울의
// 콘텐츠 모델(GenericContentItem)에는 평점 컬럼이 없다 — 넣을 값이 없으니 매번 경고가 났다.
//
// 없는 평점을 지어내는 것은 허위 마크업이라 수동 조치 대상이다. 그래서 호출부를 Article로
// 옮기고, 이 함수는 평점이 없으면 null을 반환하도록 바꿨다. 평점 모델이 실제로 생기면
// ratingValue를 넘겨 다시 쓰면 된다 — 그때까지 빈 Product가 새어 나가지 않게 하는 가드다.
export function generateProductSchema(params: {
  name: string
  description?: string | null
  image?: string
  ratingValue?: number
  reviewCount?: number
}) {
  if (typeof params.ratingValue !== 'number') return null

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    description: params.description || undefined,
    image: params.image || undefined,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: params.ratingValue,
      reviewCount: params.reviewCount || 1,
    },
  }
}
