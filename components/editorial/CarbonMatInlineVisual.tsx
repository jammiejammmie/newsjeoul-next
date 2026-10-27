const cells = [
  ['최대 표면온도', '39~64℃', '높을수록 좋은 순위가 아니라 취향·용도 차이'],
  ['위치별 온도편차', '0.4~10.5℃', '몸 한쪽만 뜨거운지 보는 균일성 기준'],
  ['20→35℃ 예열', '12~49분', '비싼 제품이 항상 더 빠른 것은 아님'],
]

export default function CarbonMatInlineVisual({index}:{index:number}) {
  if (index === 1) return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:14,lineHeight:1.7}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>2025년 소비자원 시험: 같은 ‘탄소매트’ 안에서도 벌어진 차이</caption><thead><tr>{['비교 항목','10개 제품 범위','구매할 때 읽는 법'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:12,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody>{cells.map(([name,range,meaning])=><tr key={name}><th scope="row" style={{padding:12,textAlign:'left',background:'#edf2eb',borderBottom:'1px solid #cddbd4'}}>{name}</th><td style={{padding:12,fontWeight:800,background:'#fffdf7',borderBottom:'1px solid #cddbd4'}}>{range}</td><td style={{padding:12,background:'#f5f7f1',borderBottom:'1px solid #cddbd4',overflowWrap:'anywhere'}}>{meaning}</td></tr>)}</tbody></table><figcaption>한국소비자원 탄소전기매트 10개 제품 시험을 재구성했습니다. 2025년 시험 모델의 최대 설정 조건이며 현재 판매 순위나 모든 제품의 범위가 아닙니다.</figcaption></figure>
  if (index === 4) return <figure className="decision-visual"><h3>첫겨울 총비용을 적는 순서</h3><div className="decision-steps"><div><strong>1. 결제 전</strong><p>본체 실제 결제금액<br/>+ 배송비</p></div><div><strong>2. 설치 전</strong><p>별도 패드·커버<br/>+ 보관 비용</p></div><div><strong>3. 사용 중</strong><p>정격 W × 시간<br/>÷ 1,000 = kWh</p></div><div><strong>4. 마지막 비교</strong><p>세탁 조건과 보증<br/>+ 교체 가능성</p></div></div><p className="decision-note">150W를 하루 8시간씩 30일 계속 최대 출력으로 쓴 단순 상한은 36kWh입니다. 온도조절 작동과 가정 요금 조건에 따라 실제 청구액은 달라집니다.</p><figcaption>구매가와 사용비를 한 장에 적기 위한 자체 계산 도식입니다. 특정 상품의 실측 전력이나 현재 요금표가 아닙니다.</figcaption></figure>
  return null
}
