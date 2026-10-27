const screenRows = [
  ['내부 메인 화면', '접히는 큰 화면', '직접 제거·덧붙임 금지', '센터 상담'],
  ['외부 커버 화면', '접었을 때 쓰는 화면', '전용 제품 선택 가능', '호환 확인 후 부착'],
]

const symptomRows = [
  ['내부 필름 들뜸·기포', '센터에 모델·증상·재고·비용 문의'],
  ['외부 별도 필름 기포', '필름 제거 후 화면 확인, 필요할 때 재부착'],
  ['검은 줄·번짐·터치 불량', '구매 중단, 디스플레이 점검'],
]

export default function Flip8FilmInlineVisual({index}:{index:number}) {
  if (index === 0) return <figure className="article-visual"><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',fontSize:13.5,lineHeight:1.6}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>플립8의 두 화면, 필름 판단은 반대입니다</caption><thead><tr>{['구분','어디인가','필름 원칙','다음 행동'].map(x=><th key={x} scope="col" style={{background:'#173b38',color:'white',padding:11,textAlign:'left'}}>{x}</th>)}</tr></thead><tbody>{screenRows.map((row,i)=><tr key={row[0]}>{row.map((cell,j)=><td key={cell} style={{padding:11,verticalAlign:'top',fontWeight:j===0?800:500,background:i%2?'#f5f7f1':'#fffdf7',borderBottom:'1px solid #cddbd4'}}>{cell}</td>)}</tr>)}</tbody></table><figcaption>내부 접이식 화면과 외부 커버 화면을 삼성 공식 안내에 따라 나눈 자체 비교표입니다. 제품 단면이나 실측 사진이 아닙니다.</figcaption></figure>
  if (index === 1) return <figure className="decision-visual"><h3>증상부터 고르면, 살지 맡길지가 갈립니다</h3><div className="decision-steps">{symptomRows.map(([title,text])=><div key={title}><strong>{title}</strong><p>{text}</p></div>)}</div><p className="decision-note">필름 아래에도 줄·번짐·터치 문제가 남으면 액세서리 구매로 해결하지 않습니다.</p><figcaption>삼성전자서비스의 보호필름 안내를 바탕으로 정리한 자체 결정도입니다.</figcaption></figure>
  if (index === 5) return <figure className="article-visual"><div role="img" aria-label="외부 필름 구매 비용과 내부 필름 서비스 비용을 따로 계산하는 방법" style={{border:'1px solid #cddbd4',borderRadius:18,overflow:'hidden',background:'#fffdf7'}}><div style={{padding:'18px 20px',background:'#173b38',color:'white'}}><strong style={{fontSize:18}}>같은 ‘필름 비용’으로 더하지 마세요</strong><p style={{margin:'5px 0 0',fontSize:13,opacity:.84}}>외부는 상품 선택, 내부는 서비스 확인입니다.</p></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))'}}><div style={{padding:18,borderRight:'1px solid #dce5df'}}><span style={{display:'block',fontSize:12,fontWeight:800,color:'#a74424',marginBottom:6}}>외부 커버 화면</span><b style={{display:'block',lineHeight:1.55}}>결제금액 + 배송비 + 실패 여분</b><p style={{fontSize:13,lineHeight:1.65,margin:'8px 0 0'}}>케이스 간섭과 불필요한 렌즈 필름 구성도 함께 봅니다.</p></div><div style={{padding:18}}><span style={{display:'block',fontSize:12,fontWeight:800,color:'#a74424',marginBottom:6}}>내부 메인 화면</span><b style={{display:'block',lineHeight:1.55}}>센터 비용 + 이동 시간 + 재고</b><p style={{fontSize:13,lineHeight:1.65,margin:'8px 0 0'}}>플립8의 현재 국내 비용·무상 조건은 센터에 확인합니다.</p></div></div></div><figcaption>현재 가격을 표시하지 않은 자체 비용 비교도입니다. 센터 정책과 판매 조건은 바뀔 수 있습니다.</figcaption></figure>
  return null
}
