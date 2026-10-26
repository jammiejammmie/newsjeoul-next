import Image from 'next/image'

const rows = [
 ['음악·일반 통화', 'Bluetooth 연결로 사용', '앱 설치와 별개'],
 ['ANC·주변 소리 전환', '블레이드 길게 누르기', 'iOS에서 조작 재지정은 미지원'],
 ['EQ·적응형 소음 제어', '지원 Android에서 먼저 설정', 'Wear 앱에서 켠 기능 유지 조건'],
 ['24bit/96kHz·360 Audio·통역', 'iOS 미지원', 'Galaxy 전용 조건과 구별'],
 ['펌웨어 업데이트·조작 설정', 'iOS 미지원', '구매 전 지원 기기·방법 확보'],
]

export default function BudsIphoneInlineVisual({index}:{index:number}) {
 if(index===1)return <div><table style={{width:'100%',tableLayout:'fixed',fontSize:14,lineHeight:1.75,borderCollapse:'collapse',margin:'24px 0 10px'}}><caption style={{textAlign:'left',fontWeight:800,fontSize:18,marginBottom:12}}>버즈4·버즈4 프로 × 아이폰: 기능별 판단표</caption><thead><tr>{['필요한 기능','아이폰에서의 조건과 구매 전 확인'].map(x=><th scope="col" key={x} style={{textAlign:'left',padding:10,width:x==='필요한 기능'?'34%':'66%',background:'#173b38',color:'white'}}>{x}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row[0]}><th scope="row" style={{textAlign:'left',padding:10,width:'34%',verticalAlign:'top',overflowWrap:'anywhere',background:'#edf2eb',borderBottom:'1px solid #cddbd4'}}>{row[0]}</th><td style={{padding:10,verticalAlign:'top',overflowWrap:'anywhere',background:'#f5f7f1',borderBottom:'1px solid #cddbd4'}}><strong>{row[1]}</strong><br/>{row[2]}</td></tr>)}</tbody></table><p style={{fontSize:12,lineHeight:1.7,color:'#53665d'}}>삼성 2026-03-03 기능표의 iOS 등 기타 Bluetooth 기기 열과 각주를 요약했습니다. Android 사전 설정은 iOS 앱 지원과 다릅니다. 모든 버전에서 직접 시험한 결과가 아닙니다.</p></div>
 if(index!==2)return null
 return <figure className="article-visual"><Image src="/images/editorial/buds4-iphone-pairing.svg" alt="양쪽 이어버드를 넣고 케이스를 연 뒤 후면 버튼을 3초 이상 눌러 아이폰 Bluetooth 목록에서 선택하고 음악·통화를 확인하는 순서" width={720} height={790} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>삼성전자서비스의 버즈4 수동 페어링과 Apple의 Bluetooth 안내를 연결한 자체 순서도. 실제 제품 외형·버튼 사진이나 아이폰 화면을 재현한 그림이 아닙니다.</figcaption></figure>
}
