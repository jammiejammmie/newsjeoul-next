import { DISCOVERY_ROUTES } from '@/lib/hubs/editorial/discoveries'
import Image from 'next/image'
import './visuals.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EDITORIAL_DOCUMENTS } from '@/lib/hubs/editorial'
import GuideExplorer from './GuideExplorer'
import CostCompare from './CostCompare'
import AffiliatePanel from './AffiliatePanel'
import AffiliateFrame from './AffiliateFrame'
import './editorial.css'
export const metadata: Metadata = {
  title: '뉴스저울 — 알고 고르면, 달라집니다',
  description: '고장 해결부터 수리·교체 비교까지. 공식 자료로 확인하고, 필요한 지출을 판단하는 생활·디지털 가이드.',
  alternates: { canonical: 'https://newsjeoul.co.kr/' },
  openGraph: { title: '뉴스저울 — 알고 고르면, 달라집니다', description: '고장 해결부터 수리·교체 비교까지. 필요한 선택을 돕는 가이드.', url: 'https://newsjeoul.co.kr/', type: 'website' },
}
const format: Record<string,string> = { buying:'구매 판단',troubleshoot:'문제 해결',howto:'사용법',compare:'비교' }
export default function EditorialHome() {
 const guides=Object.entries(EDITORIAL_DOCUMENTS).flatMap(([hub,docs])=>docs.map(d=>({href:`/hub/${hub}/${d.slug}`,title:d.title,lead:d.lead??'',category:DISCOVERY_ROUTES.includes(`/hub/${hub}/${d.slug}`)?'신박한 발견':({'energy-voucher':'생활·지원 제도','galaxy-buds4':'이어폰·오디오','galaxy-book5-pro':'노트북·주변기기','lg-gram-2026':'노트북·주변기기','robot-vacuum-2026':'생활가전','humidifier':'생활가전','carbon-heated-mat':'생활가전','melon-streaming':'구독 생활'} as Record<string,string>)[hub]??'스마트폰',format:format[d.format]??'가이드'})))
 const shopping = { slots: ['gram26-body','rv26-roborock','fold8-body'], context: '뉴스저울에서 다룬 제품의 판매 옵션을 비교하세요. 가격·재고·구성은 판매 페이지에서 확인할 수 있습니다.' }
 return <AffiliateFrame home placement={{ ...shopping, slots: ['book5-hub','buds4-case'] }}><div className="editorial-home">
  <div className="editorial-mast"><span>THE EVERYDAY DECISION JOURNAL</span><span>문제를 풀고, 선택을 가볍게.</span></div>
  <section className="editorial-hero"><div className="hero-copy"><span className="eyebrow">뉴스저울 생활 가이드</span><h1>알고 고르면,<br/><em>달라집니다.</em></h1><p>잘 쓰는 방법부터 다시 살 때의 기준까지.<br/>궁금한 순간에 꺼내 보는 실용적인 답.</p><a href="#guides" className="editorial-button">나에게 필요한 가이드 <span aria-hidden="true">↗</span></a></div><Link href="/hub/galaxy-buds4/single-bud-replacement" className="hero-feature"><div className="feature-art" aria-hidden="true"><Image src="/images/editorial/buds.webp" alt="" width={1200} height={800} unoptimized loading="eager" /><span>AI 제작 · 이어폰 개념 일러스트</span></div><div className="feature-body"><span className="eyebrow">이어폰 / 구매 판단</span><h2>한쪽을 잃었는데,<br/>둘 다 다시 사야 할까?</h2><p>단품 견적부터 새 세트 비교까지.<br/>버즈4 한쪽 분실 후 확인할 순서.</p><span className="feature-arrow" aria-hidden="true">↗</span></div></Link></section>
  <div className="editorial-values"><span><b>01</b> 사기 전에 해결부터</span><span><b>02</b> 공식 자료와 판단을 구분</span><span><b>03</b> 가격보다 내 조건에 맞게</span></div>
  <AffiliatePanel placement={shopping} title="관심 제품, 쿠팡에서 바로 비교" position="home-top" />
  <section className="editorial-note"><span className="eyebrow">신박한 발견</span><h2>신기한 기능, 내게도 필요할까요?</h2><p>화면 달린 허브부터 귀에 거는 이어폰까지. 신기함 다음의 사용 조건과 추가 비용을 확인합니다.</p><Link href="/discoveries" className="editorial-button">신박한 발견 둘러보기 →</Link></section><GuideExplorer guides={guides}/><AffiliatePanel placement={{ ...shopping, slots: ['flip8-body','rv26-dreame'] }} title="읽고 비교했다면, 판매 옵션 확인" position="home-bottom" /><CostCompare/>
  <section className="editorial-more"><div><span className="eyebrow">EXPLORE MORE</span><h2>관심 분야를 더 깊게.</h2><p>기존 가이드와 뉴스도 계속 찾아볼 수 있습니다.</p></div><div className="editorial-hubs">{[{label:'노트북',href:'/hub/galaxy-book5-pro'},{label:'생활가전',href:'/hub/robot-vacuum-2026'},{label:'겨울 가습기',href:'/hub/humidifier'},{label:'겨울 탄소매트',href:'/hub/carbon-heated-mat'},{label:'구독 생활',href:'/hub/melon-streaming'},{label:'지원 제도',href:'/hub/youth-savings-account'}].map(x=><Link key={x.href} href={x.href}>{x.label}<span aria-hidden="true">↗</span></Link>)}</div></section>
  <aside className="editorial-note"><h2>읽는 사람의 선택이 먼저입니다.</h2><p>공식 자료를 바탕으로 AI가 작성한 가이드입니다. 직접 사용·시험한 후기와 구분하며, 확인하지 않은 가격이나 최저가를 약속하지 않습니다. 일부 글에는 쿠팡 파트너스 링크가 있으며, 이를 통해 구매하면 일정액의 수수료를 제공받습니다.</p></aside>
 </div></AffiliateFrame>
}
