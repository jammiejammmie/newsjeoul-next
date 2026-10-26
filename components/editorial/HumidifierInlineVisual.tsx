import Image from 'next/image'
const rows = [
 ['쿠쿠 CH-GS301FW · 초음파식', '198mL/h · 8시간 161Wh', '전기 4,640원 + 필터 없음 = 4,640원'],
 ['한일 GHSP-3300RR · 가열식', '450mL/h · 8시간 3,046Wh', '전기 87,730원 + 필터 없음 = 87,730원'],
 ['샤오미 CJSJSQ02XYKR · 기화식', '433mL/h · 8시간 51Wh', '전기 1,470원 + 필터 25,800원 = 27,270원'],
]
export default function HumidifierInlineVisual({index}:{index:number}) {
 if(index===2)return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:14,lineHeight:1.85}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>2025년 소비자원 시험값: 전기만 비교하면 빠지는 비용</caption><thead><tr>{['당시 시험 모델·성능','6개월 사용 가정의 연간 유지관리비'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:12,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody>{rows.map(([name,performance,cost])=><tr key={name}><th scope="row" style={{width:'45%',padding:12,textAlign:'left',verticalAlign:'top',overflowWrap:'anywhere',background:'#edf2eb',borderBottom:'1px solid #cddbd4'}}>{name}<br/><span style={{fontWeight:500,fontSize:12}}>{performance}</span></th><td style={{padding:12,verticalAlign:'top',overflowWrap:'anywhere',background:'#f5f7f1',borderBottom:'1px solid #cddbd4'}}>{cost}</td></tr>)}</tbody></table><figcaption>한국소비자원 2025년 시험·종합평가표를 재구성했습니다. 하루 8시간·월 30일·6개월·160원/kWh 기준. 현재 판매가·요금·필터 가격이 아니며 가습량도 서로 다릅니다. 표의 ‘필터 없음’은 당시 산정에 교체 필터비가 포함되지 않았다는 뜻입니다.</figcaption></figure>
 const data=index===1?{src:'humidifier-methods.svg',height:1020,alt:'초음파 진동, 물 끓임, 젖은 필터와 바람, 복합 모드의 네 가지 가습 원리를 물의 이동 순서로 비교한 설명도',caption:'가습 원리와 관리 항목을 연결한 자체 도식입니다. 특정 제품의 실제 내부 구조·분무 입자 크기를 재현한 그림이 아닙니다.'}:index===3?{src:'humidifier-power-cost.svg',height:710,alt:'9W와 가상의 300W를 하루 8시간씩 30일 사용할 때 전력량 2.16kWh와 72kWh를 계산하고 첫겨울 비용에 필터와 배송비를 더하는 도식',caption:'자체 계산 도식. 9W는 Xiaomi 해당 국내 모델의 정격이며 300W는 계산용 가상값입니다. 동일 가습 성능의 제품 비교나 실제 전기요금 측정 결과가 아닙니다.'}:null
 if(!data)return null
 return <figure className="article-visual"><Image src={`/images/editorial/${data.src}`} alt={data.alt} width={720} height={data.height} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{data.caption}</figcaption></figure>
}
