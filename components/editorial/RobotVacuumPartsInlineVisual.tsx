const partRows = [
  ['메인·사이드 브러시', '본체', '정확한 본체 모델, 결합부'],
  ['필터·물걸레', '본체', '모델명, 형태·수량, 세척 가능 여부'],
  ['먼지봉투', '도크', '도크 형식, 입구·밀폐 규격'],
  ['세척 브러시·거름망', '도크', '일반형·급배수형, 도크 모델'],
]

const decisions = [
  ['오염만 있음', '설명서가 허용한 방법으로 청소·완전 건조'],
  ['찢김·변형·결합 불량', '정확한 모델용 부품으로 교체 검토'],
  ['모델 또는 도크 불명', '구매 중단 → 라벨·구매 내역 확인'],
]

export default function RobotVacuumPartsInlineVisual({index}:{index:number}) {
  if (index === 0) return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:13.5,lineHeight:1.6}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>부품마다 대조할 모델이 다릅니다</caption><thead><tr>{['소모품','기준','구매 전 확인'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:11,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody>{partRows.map((row,i)=><tr key={row[0]}>{row.map((cell,j)=><td key={cell} style={{padding:11,verticalAlign:'top',fontWeight:j===0?800:500,background:i%2?'#f5f7f1':'#fffdf7',borderBottom:'1px solid #cddbd4'}}>{cell}</td>)}</tr>)}</tbody></table><figcaption>본체용과 도크용 부품을 나눈 자체 확인표입니다. 실제 부품 형상이나 호환을 측정한 도면이 아닙니다.</figcaption></figure>
  if (index === 3) return <figure className="decision-visual"><h3>장바구니보다 먼저: 청소·교체 결정</h3><div className="decision-steps">{decisions.map(([title,text])=><div key={title}><strong>{title}</strong><p>{text}</p></div>)}</div><p className="decision-note">모양이 같아 보여도 모델이 확인되지 않으면 결제하지 않습니다.</p><figcaption>설명서 우선 원칙과 손상 상태를 연결한 자체 결정도입니다.</figcaption></figure>
  if (index === 5) return <figure className="article-visual"><div role="img" aria-label="로봇청소기 소모품 세트의 실제 사용 단가 계산식" style={{border:'1px solid #cddbd4',borderRadius:18,overflow:'hidden',background:'#fffdf7'}}><div style={{padding:'18px 20px',background:'#173b38',color:'white'}}><strong style={{fontSize:18}}>세트 가격보다 실제 사용 단가</strong><p style={{margin:'5px 0 0',fontSize:13,opacity:.84}}>남는 부품과 호환 실패 비용까지 포함합니다.</p></div><div style={{padding:20,textAlign:'center'}}><b style={{display:'block',fontSize:17,lineHeight:1.6}}>(결제금액 + 배송비 + 반품 불가 위험)</b><span style={{display:'block',fontSize:21,fontWeight:900,color:'#a74424',margin:'4px 0'}}>÷</span><b style={{display:'block',fontSize:17,lineHeight:1.6}}>실제로 쓸 수 있는 호환 부품 수</b><p style={{fontSize:13,lineHeight:1.65,margin:'12px 0 0'}}>“1년 세트”와 총 개수는 사용 기간이나 경제성을 보증하지 않습니다.</p></div></div><figcaption>현재 판매가를 쓰지 않은 자체 비용 계산도입니다. 선택 옵션의 결제 조건은 판매 페이지에서 확인하세요.</figcaption></figure>
  return null
}
