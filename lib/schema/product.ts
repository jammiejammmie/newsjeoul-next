// content_type 'review'/'shopping_pick' → Product (+ Review/AggregateRating)

export function generateProductSchema(params: {
  name: string
  description?: string | null
  image?: string
  ratingValue?: number
  reviewCount?: number
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    description: params.description || undefined,
    image: params.image || undefined,
    aggregateRating: params.ratingValue
      ? { '@type': 'AggregateRating', ratingValue: params.ratingValue, reviewCount: params.reviewCount || 1 }
      : undefined,
  }
}
