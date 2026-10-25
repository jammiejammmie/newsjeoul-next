import type { Metadata } from 'next'
import Link from 'next/link'
import { EDITORIAL_DOCUMENTS } from '@/lib/hubs/editorial'
import GuideExplorer from './GuideExplorer'
import CostCompare from './CostCompare'
import './editorial.css'
export const metadata: Metadata = {
  title: '뉴스저울 — 알고 고르면, 달라집니다',
  description: '고장 해결부터 수리·교체 비교까지. 공식 자료로 확인하고, 필요한 지출을 판단하는 생활·디지털 가이드.',
  alternates: { canonical: 'https://newsjeoul.co.kr/' },
  openGraph: { title: '뉴스저울 — 알고 고르면, 달라집니다', description: '고장 해결부터 수리·교체 비교까지. 필요한 선택을 돕는 가이드.', url: 'https://newsjeoul.co.kr/', type: 'website' },
}
const format: Record<string,string> = { buying:'구매 판단',troubleshoot:'문제 해결',howto:'사용법',compare:'비교' }
export default function EditorialHome() {
 const guides=Object.entries(EDITORIAL_DOCUMENTS).flatMap(([hub,docs])=>docs.map(d=>({href:`/hub/${hub}/${d.slug}`,title:d.title,lead:d.lead??'',category:({'galaxy-buds4':'이어폰·오디오','galaxy-book5-pro':'노트북·주변기기','robot-vacuum-2026':'생활가전','melon-streaming':'구독 생활'} as Record<string,string>)[hub]??'스마트폰',format:format[d.format]??'가이드'})))
 return <div className="editorial-home">
  <div className="editorial-mast"><span>THE EVERYDAY DECISION JOURNAL</span><span>문제를 풀고, 선택을 가볍게.</span></div>
  <section className="editorial-hero"><div className="hero-copy"><span className="eyebrow">뉴스저울 생활 가이드</span><h1>알고 고르면,<br/><em>달라집니다.</em></h1><p>잘 쓰는 방법부터 다시 살 때의 기준까지.<br/>궁금한 순간에 꺼내 보는 실용적인 답.</p><a href="#guides" className="editorial-button">나에게 필요한 가이드 <span aria-hidden="true">↗</span></a></div><Link href="/hub/galaxy-buds4/single-bud-replacement" className="hero-feature"><div className="feature-art" aria-hidden="true"><svg viewBox="0 0 400 260"><ellipse cx="200" cy="225" rx="122" ry="10" fill="#243d36" opacity=".14"/><rect x="100" y="121" width="200" height="98" rx="42" fill="#f9f7ef" stroke="#c3d0c4" strokeWidth="2"/><path d="M102 156H298" stroke="#c3d0c4" strokeWidth="2"/><rect x="189" y="182" width="22" height="4" rx="2" fill="#447361"/><g transform="translate(145 42) rotate(-16)"><rect width="32" height="75" rx="16" fill="#fffef8"/><ellipse cx="10" cy="14" rx="29" ry="20" fill="#f4f1e7"/><ellipse cx="-4" cy="12" rx="8" ry="10" fill="#254c40"/></g><g transform="translate(245 50) rotate(16)" fill="none" stroke="#759485" strokeWidth="2" strokeDasharray="5 5"><rect width="30" height="68" rx="15"/><ellipse cx="10" cy="10" rx="27" ry="19"/></g></svg><span>선택을 설명하는 개념 일러스트</span></div><div className="feature-body"><span className="eyebrow">이어폰 / 구매 판단</span><h2>한쪽을 잃었는데,<br/>둘 다 다시 사야 할까?</h2><p>단품 견적부터 새 세트 비교까지.<br/>버즈4 한쪽 분실 후 확인할 순서.</p><span className="feature-arrow" aria-hidden="true">↗</span></div></Link></section>
  <div className="editorial-values"><span><b>01</b> 사기 전에 해결부터</span><span><b>02</b> 공식 자료와 판단을 구분</span><span><b>03</b> 가격보다 내 조건에 맞게</span></div>
  <GuideExplorer guides={guides}/><CostCompare/>
  <section className="editorial-more"><div><span className="eyebrow">EXPLORE MORE</span><h2>관심 분야를 더 깊게.</h2><p>기존 가이드와 뉴스도 계속 찾아볼 수 있습니다.</p></div><div className="editorial-hubs">{[{label:'노트북',href:'/hub/galaxy-book5-pro'},{label:'생활가전',href:'/hub/robot-vacuum-2026'},{label:'구독 생활',href:'/hub/melon-streaming'},{label:'지원 제도',href:'/hub/youth-savings-account'},{label:'뉴스·이슈',href:'/topic'}].map(x=><Link key={x.href} href={x.href}>{x.label}<span aria-hidden="true">↗</span></Link>)}</div></section>
  <aside className="editorial-note"><h2>읽는 사람의 선택이 먼저입니다.</h2><p>공식 자료를 바탕으로 AI가 작성한 가이드입니다. 직접 사용·시험한 후기와 구분하며, 확인하지 않은 가격이나 최저가를 약속하지 않습니다. 일부 글에는 쿠팡 파트너스 링크가 있으며, 이를 통해 구매하면 일정액의 수수료를 제공받습니다.</p></aside>
 </div>
}
