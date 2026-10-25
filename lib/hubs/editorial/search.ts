import { EDITORIAL_DOCUMENTS } from './index'
import type { SearchResult } from '@/lib/search'

/** Local source-checked documents remain searchable without a database connection. */
export function searchEditorialDocuments(query: string, limit = 20): SearchResult[] {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return Object.entries(EDITORIAL_DOCUMENTS).flatMap(([hub,docs]) => docs
    .filter(doc => {
      const text = `${hub} ${doc.title} ${doc.lead ?? ''} ${doc.blocks.map(b => `${b.heading} ${b.content}`).join(' ')}`.normalize('NFKC').toLocaleLowerCase()
      return words.every(word => text.includes(word))
    })
    .map(doc => ({ type: 'guide' as const, slug: `${hub}/${doc.slug}`, name: doc.title, summary: doc.lead, brief: false })))
    .slice(0,Math.max(0,limit))
}
