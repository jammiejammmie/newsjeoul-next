import Image from 'next/image'
import { energyVoucher } from '@/lib/hubs/energy-voucher'

const figures: Record<number,{src:string;alt:string;caption:string;height:number}> = {
  0:{src:'/images/editorial/energy-eligibility.svg',alt:'소득 기준과 세대원 특성을 모두 확인하고 제외·중복 제한 심사로 이어지는 자격 판단 흐름도',caption:'두 가지 기준은 선택 조건이 아니라 함께 충족해야 하는 조건입니다. 자체 제작 설명도이며 개인별 승인 결과가 아닙니다.',height:610},
  1:{src:'/images/editorial/energy-deadlines.svg',alt:'2026년 12월 31일 신청 마감과 2027년 5월 31일 사용 종료를 구분한 달력 도식',caption:'신청 기한과 사용 기한을 나눈 자체 일정도. 시간축은 월 단위로 단순화했으며 연말 신청 일시 중단일은 별도 확인이 필요합니다.',height:560},
  3:{src:'/images/editorial/energy-payment-choice.svg',alt:'전기·가스·지역난방 고지서의 요금차감과 등유·LPG 등 가맹점 국민행복카드 결제를 구분하는 선택 흐름',caption:'난방비 납부 방식별 자체 선택도. 카드결제 가능 여부는 공급사·가맹점에서 확인해야 합니다.',height:710},
}
export default function EnergyVoucherInlineVisual({index}:{index:number}) {
  if(index===4)return <aside style={{padding:18,margin:'18px 0',background:'#edf4ed',borderRadius:12}}><a href="https://www.bokjiro.go.kr/" style={{fontWeight:700,textDecoration:'underline'}}>공식 복지로에서 신청·접수 확인 →</a><p style={{margin:'8px 0 0',fontSize:13}}>복지로에서 에너지바우처를 검색하세요. 이 사이트는 신청을 대행하거나 개인 인증정보를 받지 않습니다.</p></aside>
  if(index===2)return <div style={{overflowX:'auto',margin:'20px 0'}}><table style={{width:'100%',borderCollapse:'collapse',textAlign:'center',font:'500 14px/1.7 Pretendard'}}><caption style={{textAlign:'left',fontWeight:700,marginBottom:8}}>2026년도 일반 바우처 · 세대별 연간 총액</caption><thead><tr>{['1인','2인','3인','4인 이상'].map(x=><th key={x} style={{padding:'12px 4px',background:'#185c4c',color:'white'}}>{x}</th>)}</tr></thead><tbody><tr>{['295,200원','407,500원','532,700원','701,300원'].map(x=><td key={x} style={{padding:'12px 4px',background:'#edf4ed',whiteSpace:'nowrap'}}>{x}</td>)}</tr></tbody></table></div>
  if(index===8)return <nav aria-label="관련 정책 키워드" style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:20}}>{energyVoucher.tags.map(tag=><span key={tag} style={{font:'500 12px/1.6 Pretendard',padding:'4px 8px',background:'#edf4ed',borderRadius:12}}>#{tag}</span>)}</nav>
  const f=figures[index]
  if(!f)return null
  return <figure className="article-visual"><Image src={f.src} alt={f.alt} width={600} height={f.height} unoptimized loading={index===0?'eager':'lazy'} style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
