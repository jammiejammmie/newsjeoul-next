import Link from 'next/link'
import type { QuickChoices } from '@/lib/hubs/editorial/quick-choices'
import './quick-choice.css'

export default function QuickChoice({guide, summary=false}:{guide:QuickChoices;summary?:boolean}) {
 const hasAd=guide.rows.some(row=>row.href.startsWith('/go/'))
 return <section className={`quick-choice${summary?' quick-choice-summary':''}`} aria-label={summary?'구매 전 선택 요약':'상황별 빠른 선택'}>
  <span className="quick-choice-kicker">{summary?'결정하기 전에':'내 상황부터 고르세요'}</span>
  <h2>{summary?'마지막으로, 무엇을 선택할까요?':'30초 빠른 선택'}</h2>
  {!summary&&<p className="quick-choice-intro">본문의 판단 기준을 상황별로 정리했습니다. 직접 사용한 후기나 판매 순위가 아닙니다.</p>}
  {guide.notice&&<p className="quick-choice-notice"><strong>모델 구분</strong> {guide.notice}</p>}
  {hasAd&&<p className="quick-choice-disclosure">광고 · 쿠팡 파트너스 링크를 통한 구매 시 일정액의 수수료를 제공받습니다.</p>}
  <div className="quick-choice-grid">{guide.rows.map((row,i)=>{
   const ad=row.href.startsWith('/go/'), external=row.href.startsWith('https:')
   const label=`${ad?'쿠팡 · ':external?'제조사 · ':''}${row.action} ↗`
   return <div className="quick-choice-item" key={row.condition}>
    <span className="quick-choice-condition">{String(i+1).padStart(2,'0')} · {row.condition}</span><h3>{row.option}</h3>
    <p><strong>선택 이유</strong>{row.benefit}</p>
    {!summary&&<p className="quick-choice-tradeoff"><strong>감수할 점</strong>{row.tradeoff}</p>}
    {ad||external?<a className={`quick-choice-link${ad?' quick-choice-ad':''}`} href={row.href} target="_blank" rel={ad?'sponsored nofollow noopener noreferrer':'noopener noreferrer'}>{label}</a>:<Link className="quick-choice-link" href={row.href} prefetch={false}>{label}</Link>}
   </div>
  })}</div>
 </section>
}
