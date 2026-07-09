// content_type 'topic' → NewsArticle, content_type 'entity' → Thing 하위타입
// (Entity는 뉴스 기사 자체가 아니라 대상이라 Article이 아닌 Thing류가 더 정확함)

export function generateArticleSchema(params: {
  headline: string
  description?: string | null
  url: string
  dateModified?: string | null
  datePublished?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: params.headline,
    description: params.description || undefined,
    mainEntityOfPage: params.url,
    dateModified: params.dateModified || undefined,
    datePublished: params.datePublished || params.dateModified || undefined,
  }
}

const ENTITY_TYPE_SCHEMA: Record<string, string> = {
  person: 'Person',
  company: 'Organization',
  organization: 'Organization',
  country: 'Country',
  product: 'Product',
}

export function generateEntitySchema(params: {
  name: string
  entityType: string
  description?: string | null
  url: string
  dateModified?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': ENTITY_TYPE_SCHEMA[params.entityType] || 'Thing',
    name: params.name,
    description: params.description || undefined,
    mainEntityOfPage: params.url,
    dateModified: params.dateModified || undefined,
  }
}
