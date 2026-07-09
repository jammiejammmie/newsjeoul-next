// content_type 'comparison' → ItemList

export function generateItemListSchema(params: { name: string; items: { name: string; url: string }[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: params.name,
    itemListElement: params.items.map((item, i) => ({
      '@type': 'ListItem', position: i + 1, name: item.name, url: item.url,
    })),
  }
}
