// BreadcrumbList — Google은 각 ListItem에 item(URL)을 요구한다.
//
// 2026-08-07: Search Console "탐색경로(심각) — itemListElement의 item 필드 누락"을 고치며
// url이 비어 있는 항목을 아예 빼도록 바꿨다. name만 있는 ListItem을 내보내면 항목 전체가
// 무효 처리된다. 빼는 대신 없는 URL을 지어내지 않는 이유는, 404로 가는 URL을 구조화
// 데이터로 선언하는 쪽이 누락보다 나쁘기 때문이다(실측: /category/신제품·가전 → 404).
export function generateBreadcrumbSchema(items: { name: string; url?: string }[]) {
  const linked = items.filter((item) => Boolean(item.url))
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: linked.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, item: item.url,
    })),
  }
}
