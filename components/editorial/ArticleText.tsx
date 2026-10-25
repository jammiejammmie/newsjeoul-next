import Link from 'next/link'
import { findAffiliateSlot } from '@/lib/hubs'

// Only authored hub links and registered affiliate slots. React escapes the remaining text.
export default function ArticleText({ text }: { text: string }) {
  const pattern = /\[([^\]\n]+)\]\((\/(?:hub\/[a-z0-9-]+(?:\/[a-z0-9-]+)?|go\/[a-z0-9-]+))\)/g
  const parts: React.ReactNode[] = []
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(offset, match.index))
    const affiliate = match[2].startsWith('/go/')
    if (affiliate && !findAffiliateSlot(match[2].slice(4))?.entry.targetUrl) { parts.push(match[0]); offset = match.index! + match[0].length; continue }
    parts.push(<Link rel={affiliate ? 'sponsored nofollow' : undefined} key={match.index} href={match[2]} prefetch={false} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{match[1]}</Link>)
    offset = match.index! + match[0].length
  }
  parts.push(text.slice(offset))
  return <>{parts}</>
}
