import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { EDITORIAL_DOCUMENTS } from '@/lib/hubs/editorial'
import { DISCOVERY_ROUTES, DISCOVERY_CARDS } from '@/lib/hubs/editorial/discoveries'
import '../../components/editorial/editorial.css'
export const metadata: Metadata = {
 title:'신박한 발견 — 신기함 다음의 구매 판단 | 뉴스저울',
 description:'눈길을 끄는 제품의 작동 조건, 국내 사용 가능 여부, 추가 비용과 안 사도 되는 경우까지 확인합니다.',
 alternates:{canonical:'https://newsjeoul.co.kr/discoveries'},
}
export default function Discoveries() {
 const entries=Object.entries(EDITORIAL_DOCUMENTS).flatMap(([hub,docs])=>docs.map(d=>({...d,href:`/hub/${hub}/${d.slug}`}))).filter(d=>DISCOVERY_ROUTES.includes(d.href))
 return <main className="editorial-home"><p><Link href="/">← 뉴스저울 홈</Link></p><header><span className="eyebrow">신박한 발견</span><h1>신기한데,<br/>내게도 필요할까?</h1><p>작동 원리와 실제로 쓸 조건, 추가 지출까지.<br/>눈길을 끈 제품을 한 번 더 따져봅니다.</p></header><section className="guide-section" aria-label="신박한 발견 글 목록"><div className="guide-grid">{entries.map(d=><Link href={d.href} key={d.href} className="guide-card"><span>{DISCOVERY_CARDS[d.href].label}</span><Image src={DISCOVERY_CARDS[d.href].src} alt={DISCOVERY_CARDS[d.href].alt} width={DISCOVERY_CARDS[d.href].width} height={DISCOVERY_CARDS[d.href].height} unoptimized style={{width:'100%',height:'auto'}}/><h2>{d.title}</h2><p>{d.lead}</p><span className="guide-read">조건과 비용 확인 →</span></Link>)}</div></section><aside className="editorial-note"><h2>신기함과 추천은 구분합니다.</h2><p>공식 자료를 확인한 구매 판단 글입니다. 직접 사용한 후기나 인기 순위가 아닙니다. 확인한 날짜와 제약을 본문에 밝히며, 광고 링크는 별도로 표시합니다.</p></aside></main>
}
