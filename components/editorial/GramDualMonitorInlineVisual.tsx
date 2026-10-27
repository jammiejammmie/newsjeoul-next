const routes = [
  ['직결 구성', 'HDMI → 모니터 1', 'USB-C 영상 → 모니터 2', '충전기는 별도 연결'],
  ['독 구성', 'USB-C → 독 1개', '독의 HDMI·DP → 화면', 'PD·USB를 한 번에'],
]

export default function GramDualMonitorInlineVisual({index}:{index:number}) {
  if (index === 1) return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:14,lineHeight:1.65}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>2026 그램 모델명을 먼저 확인해야 하는 이유</caption><thead><tr>{['확인 모델','LG 공식 USB-C 표기','같이 있는 포트'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:12,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody><tr><th scope="row" style={{padding:12,textAlign:'left',background:'#edf2eb',borderBottom:'1px solid #cddbd4'}}>16Z95U-GS5WK<br/><small>AMD</small></th><td style={{padding:12,background:'#fffdf7',borderBottom:'1px solid #cddbd4'}}>USB4 Gen 3x2<br/>USB PD</td><td style={{padding:12,background:'#f5f7f1',borderBottom:'1px solid #cddbd4'}}>HDMI 1<br/>USB-A 2</td></tr><tr><th scope="row" style={{padding:12,textAlign:'left',background:'#edf2eb'}}>16Z90U-GS5WK<br/><small>Intel</small></th><td style={{padding:12,background:'#fffdf7'}}>USB4 Gen 3x2<br/>USB PD<br/>Thunderbolt 4</td><td style={{padding:12,background:'#f5f7f1'}}>HDMI 1<br/>USB-A 2</td></tr></tbody></table><figcaption>LG전자 두 모델의 공식 포트 표기를 재구성했습니다. 같은 2026 그램 Pro라도 Thunderbolt 4 표기가 다르므로 판매 옵션의 전체 모델 코드를 대조하세요.</figcaption></figure>
  if (index === 3) return <figure className="decision-visual"><h3>직결과 독, 비용이 생기는 위치</h3><div className="decision-steps">{routes.map(([title,a,b,c])=><div key={title}><strong>{title}</strong><p>{a}<br/>{b}<br/>{c}</p></div>)}</div><p className="decision-note">직결이 되면 허브 비용이 0원입니다. 독을 고를 때는 본체 가격에 충전기·케이블·어댑터가 포함되는지까지 더하세요.</p><figcaption>실제 제품 포트 배치가 아닌 연결·비용 판단용 자체 도식입니다. 지원 해상도와 주사율은 모델·케이블·모니터 조합에서 확인해야 합니다.</figcaption></figure>
  return null
}
