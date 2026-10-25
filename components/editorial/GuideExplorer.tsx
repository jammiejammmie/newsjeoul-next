'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { editorialVisual } from '@/lib/hubs/editorial/visuals'
export type GuideCard = { href: string; title: string; lead: string; category: string; format: string }
export default function GuideExplorer({ guides }: { guides: GuideCard[] }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const categories = ['전체', ...new Set(guides.map(g => g.category))]
  const visible = guides.filter(g => (category === '전체' || g.category === category) && `${g.title} ${g.lead}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const seenImages = new Set(['/images/editorial/buds.webp']) // Featured story already uses this image.
  const thumbnails = new Map<string,string>()
  for (const guide of visible) { const image=editorialVisual(guide.href); if(image&&!seenImages.has(image.src)){thumbnails.set(guide.href,image.src);seenImages.add(image.src)} }
  return <section id="guides" className="guide-section">
    <div className="guide-heading"><div><span className="eyebrow">THE PRACTICAL EDIT</span><h2>지금 필요한 답을 찾으세요.</h2></div><label className="guide-search"><span className="sr-only">가이드 검색</span><input type="search" placeholder="충전, 케이블, 한쪽 분실…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    <div className="guide-filters" aria-label="분야 선택">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</div>
    <p className="guide-count" aria-live="polite">{visible.length}개의 가이드</p>
    <div className="guide-grid">{visible.map((g,i) => <Link key={g.href} href={g.href} className="guide-card"><div className="guide-card-top"><span>{g.category} / {g.format}</span><span aria-hidden="true">↗</span></div>{thumbnails.has(g.href) ? <Image className="guide-thumbnail" src={editorialVisual(g.href)!.src} alt={editorialVisual(g.href)!.alt} width={1200} height={800} unoptimized loading="lazy" /> : <div className="guide-number" aria-hidden="true">{String(i+1).padStart(2,'0')}</div>}<h3>{g.title}</h3><p>{g.lead}</p><span className="guide-read">확인 순서 읽기 <span aria-hidden="true">→</span></span></Link>)}</div>
    {!visible.length && <div className="guide-empty">일치하는 가이드가 없습니다. 검색어를 줄이거나 다른 분야를 선택하세요.</div>}
  </section>
}
