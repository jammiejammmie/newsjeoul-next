const conditionCells = [
  ['휴대전화', '폴드8 · SFC 2.0'],
  ['어댑터', '45W · USB PD · PPS'],
  ['케이블', 'USB-C to C · 3A 이상'],
  ['상태', '고속 충전 켜짐 · 온도 정상'],
]

const speedFactors = [
  ['잔량', '0% 출발 시험과 높은 잔량은 다름'],
  ['화면', '사용 중 소비 전력이 함께 생김'],
  ['온도', '기기와 주변 온도에 따라 달라짐'],
  ['연결', '허브·멀티포트·케이블 조건 확인'],
]

export default function Fold8ChargingInlineVisual({index}:{index:number}) {
  if (index === 1) return <figure className="article-visual"><div role="img" aria-label="폴드8 45W 충전에 필요한 휴대전화, 어댑터, 케이블, 설정 네 조건" style={{border:'1px solid #cddbd4',borderRadius:18,overflow:'hidden',background:'#fffdf7'}}><div style={{padding:'18px 20px',background:'#173b38',color:'white'}}><strong style={{fontSize:18}}>45W는 네 칸이 모두 맞아야 합니다</strong><p style={{margin:'5px 0 0',fontSize:13,opacity:.84}}>큰 숫자 하나보다 충전 규격의 조합을 확인하세요.</p></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))'}}>{conditionCells.map(([title,text],i)=><div key={title} style={{padding:18,borderRight:i<conditionCells.length-1?'1px solid #dce5df':'none',borderBottom:'1px solid #dce5df'}}><span style={{display:'block',fontSize:12,fontWeight:800,color:'#a74424',marginBottom:5}}>{String(i+1).padStart(2,'0')} · {title}</span><b style={{fontSize:14,lineHeight:1.55}}>{text}</b></div>)}</div><div style={{padding:'14px 18px',fontSize:13,lineHeight:1.65,color:'#42534d'}}>삼성 공식 30분 수치는 45W 어댑터·3A USB-C 케이블·0%·화면과 기능을 끈 조건입니다.</div></div><figcaption>폴드8의 충전 조건을 공식 자료에 따라 재구성한 자체 설명도입니다. 실제 전력 측정 화면이 아닙니다.</figcaption></figure>
  if (index === 3) return <figure className="decision-visual"><h3>같은 45W라도 결과가 달라지는 네 지점</h3><div className="decision-steps">{speedFactors.map(([title,text])=><div key={title}><strong>{title}</strong><p>{text}</p></div>)}</div><p className="decision-note">한 번에 충전기·케이블·설정을 모두 바꾸지 말고, 같은 잔량 구간에서 하나씩 교차 확인해야 원인을 구분할 수 있습니다.</p><figcaption>충전 결과에 영향을 주는 조건을 정리한 자체 도식입니다. 특정 제품의 실측 그래프가 아닙니다.</figcaption></figure>
  if (index === 5) return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:14,lineHeight:1.65}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>EP-TA845 판매 구성, 무엇을 다시 봐야 하나</caption><thead><tr>{['확인처','확인된 표기','주문 전 판단'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:12,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody><tr><th scope="row" style={{padding:12,textAlign:'left',background:'#edf2eb',borderBottom:'1px solid #cddbd4'}}>삼성 공식</th><td style={{padding:12,background:'#fffdf7',borderBottom:'1px solid #cddbd4'}}>45W · PD 3.0 PPS<br/>5A C-C · 1m</td><td style={{padding:12,background:'#f5f7f1',borderBottom:'1px solid #cddbd4'}}>어댑터 기본 패키지</td></tr><tr><th scope="row" style={{padding:12,textAlign:'left',background:'#edf2eb'}}>등록 판매 제목</th><td style={{padding:12,background:'#fffdf7'}}>EP-TA845<br/>C-C · 1.8m 포함</td><td style={{padding:12,background:'#f5f7f1'}}>별도 묶음인지 옵션 확인</td></tr></tbody></table><figcaption>삼성 공식 EP-TA845 사양과 등록 상품 제목을 대조했습니다. 판매 페이지를 직접 구매·개봉해 구성품을 확인한 결과가 아닙니다.</figcaption></figure>
  return null
}
