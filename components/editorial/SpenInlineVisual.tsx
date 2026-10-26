import Image from 'next/image'
const figures:Record<number,{src:string;alt:string;caption:string;height:number}>={
 0:{src:'spen-s25-feature-split.svg',height:685,alt:'S25 울트라 기본 S펜의 화면 필기 오류와 미지원 BLE 원격 촬영 기능을 나누는 판단도',caption:'S25 울트라 기본 S펜 기능을 구분한 자체 설명도. 실제 제품 화면이나 시험 결과가 아닙니다.'},
 1:{src:'spen-magnet-comparison.svg',height:760,alt:'자석 액세서리 제거 전후 같은 메모 화면의 선 끊김 위치를 비교하는 방법의 예시',caption:'같은 조건에서 비교하기 위한 자체 설명도. 오른쪽의 정상 선은 비교 예시이며 액세서리 제거만으로 해결된다는 보장이 아닙니다.'},
}
export default function SpenInlineVisual({index}:{index:number}){
 const f=figures[index]
 if(index===3)return <div style={{margin:'22px 0'}}><table style={{width:'100%',tableLayout:'fixed',borderCollapse:'collapse',font:'500 13px/1.75 Pretendard'}}><caption style={{textAlign:'left',fontWeight:800,fontSize:16,marginBottom:10}}>증상별 다음 행동 · 고장 확정표가 아닙니다</caption><thead><tr>{['관측한 증상','먼저 할 행동','구매 판단'].map(x=><th key={x} style={{padding:10,textAlign:'left',background:'#173b38',color:'white'}}>{x}</th>)}</tr></thead><tbody>{[['필기 정상·원격만 불가','기본 S펜의 미지원 기능 확인','원격 기능을 위해 새 펜부터 사지 않기'],['자석 분리 후 정상','액세서리 조합을 다시 선택','펜 교체부터 할 필요 없음'],['한 앱에서만 실패','다른 메모 화면과 비교','앱 하나로 펜 고장 단정 금지'],['분리 후에도 실패·손상 있음','모델·앱·위치를 기록해 점검','점검 견적과 맞는 교체품 비교']].map(row=><tr key={row[0]}>{row.map(x=><td key={x} style={{padding:10,verticalAlign:'top',overflowWrap:'anywhere',borderBottom:'1px solid #ccd9d1',background:'#f2f6f0'}}>{x}</td>)}</tr>)}</tbody></table></div>
 if(!f)return null
 return <figure className="article-visual"><Image src={'/images/editorial/'+f.src} alt={f.alt} width={720} height={f.height} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
