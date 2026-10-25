import Link from 'next/link'

// Only explicitly authored, same-site hub links. Text remains escaped by React.
export default function ArticleText({ text }: { text: string }) {
  const pattern = /\[([^\]\n]+)\]\((\/hub\/[a-z0-9-]+(?:\/[a-z0-9-]+)?)\)/g
  const parts: React.ReactNode[] = []
  let offset = 0
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(offset, match.index))
    parts.push(<Link key={match.index} href={match[2]} prefetch={false} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{match[1]}</Link>)
    offset = match.index! + match[0].length
  }
  parts.push(text.slice(offset))
  return <>{parts}</>
}
