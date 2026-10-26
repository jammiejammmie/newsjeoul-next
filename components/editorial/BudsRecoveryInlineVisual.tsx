import Image from 'next/image'
const base='/hub/galaxy-buds4/'
const figures: Record<string,Record<number,{src:string;alt:string;caption:string;height:number}>>={
 'single-bud-replacement':{
  1:{src:'buds-replacement-parts.svg',height:670,alt:'새 왼쪽 이어버드와 남은 오른쪽 이어버드를 같은 모델의 케이스에 넣는 조합도',caption:'자체 제작 부품 관계 설명도. L 분실을 예로 들었으며 실제 제품 형상이나 부품 호환 보증 도면이 아닙니다.'},
  4:{src:'buds-coupling-sequence.svg',height:730,alt:'버즈4 두 이어버드 수납 후 뚜껑을 열고 뒷면 버튼을 7초 눌러 파란 점멸 후 소등과 빨간 점멸 지속을 구분하는 순서도',caption:'삼성 공식 버즈4·프로 커플링 안내를 풀어 그린 자체 순서도. 휴대폰 화면이나 직접 시험한 결과가 아닙니다.'},
 },
 'lost-charging-case-replacement':{
  0:{src:'buds-lost-case-flow.svg',height:705,alt:'빈 케이스만 분실한 경우와 이어버드까지 함께 분실한 경우의 찾기·공급 문의 경로를 나누는 흐름도',caption:'공식 찾기 기능 제한에 근거한 자체 판단 흐름도. 찾기 성공이나 부품 판매를 보장하지 않습니다.'},
  1:{src:'buds-case-vs-cover.svg',height:715,alt:'배터리와 충전 접점이 있는 케이스 본체와 그 바깥을 감싸는 보호 커버의 역할 비교도',caption:'충전 본체와 보호 커버의 역할을 구분한 자체 개념도. 실제 모델 외관·내부 설계·실측을 나타내지 않습니다.'},
 },
}
export default function BudsRecoveryInlineVisual({path,index}:{path:string;index:number}) {
 const slug=path.startsWith(base)?path.slice(base.length):''
 const f=figures[slug]?.[index]
 const costIndex=slug==='single-bud-replacement'?2:slug==='lost-charging-case-replacement'?3:-1
 if(index===costIndex)return <div style={{margin:'22px 0'}}><table style={{width:'100%',borderCollapse:'collapse',font:'500 13px/1.7 Pretendard',tableLayout:'fixed'}}><caption style={{textAlign:'left',fontWeight:800,fontSize:16,marginBottom:10}}>견적을 받은 뒤 채우는 총비용 비교표</caption><thead><tr>{['선택','합계에 넣을 항목','금액 외 확인'].map(t=><th key={t} style={{padding:10,textAlign:'left',background:'#173b38',color:'white'}}>{t}</th>)}</tr></thead><tbody>{[['단품 복구','필요 부품 + 추가 처리비 + 배송비','남은 부품 상태·호환·수령일'],['새 세트','실제 적용 할인 후 결제액 + 배송비','모델·구성·반품 조건'],['구매 보류','추가 결제 없음','다른 보유 이어폰으로 대체 가능한지']].map(row=><tr key={row[0]}>{row.map(t=><td key={t} style={{padding:10,verticalAlign:'top',borderBottom:'1px solid #ccd9d1',background:'#f2f6f0',overflowWrap:'anywhere'}}>{t}</td>)}</tr>)}</tbody></table><p style={{fontSize:12,lineHeight:1.7,color:'#5d6b69'}}>특정 판매가를 가정하지 않은 편집용 비교 틀입니다. 실제 견적과 결제 화면의 금액을 적어 비교하세요.</p></div>
 if(!f)return null
 return <figure className="article-visual"><Image src={'/images/editorial/'+f.src} alt={f.alt} width={720} height={f.height} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
