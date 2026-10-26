import Image from 'next/image'
import BudsOnInlineVisual from './BudsOnInlineVisual'
const figures: Record<number, {src:string;alt:string;caption:string}> = {
 1: {src:'/images/editorial/usb-c-port-roles.svg',alt:'노트북 HOST 연결, PD IN 전원 입력, 데이터와 영상 출력 포트를 구분하는 설명도',caption:'포트 역할을 구분한 자체 제작 개념도. 실제 포트 위치와 지원 기능은 모델 설명서로 확인하세요.'},
 2: {src:'/images/editorial/usb-c-power-budget.svg',alt:'Anker 10-in-1 Dual Display 허브의 최대 입력 100W 중 허브 소비 15W를 고려해 노트북에 최대 85W를 전달하는 예시',caption:'Anker 해당 제품 FAQ 기준의 정격 설명 예시. 실측값이나 아래 광고 상품의 사양이 아닙니다.'},
}
export default function ArticleInlineVisual({path,index}:{path:string;index:number}) {
 if(path==='/hub/galaxy-buds4/buds-on-library-leakage-buying')return <BudsOnInlineVisual index={index}/>
 const discovery=path==='/hub/galaxy-book5-pro/anker-a210c-smart-display-hub'
 const extra: Record<number,{src:string;alt:string;caption:string}>={1:{src:'/images/editorial/a210c-display-meaning.svg',alt:'A210C 본체 상태 화면과 외부 모니터 주사율, 맥 두 화면 제약을 구분하는 설명도',caption:'한국·미국 공식 A210C 안내를 정리한 자체 설명도. 실제 제품 외관이나 UI 재현이 아닙니다.'},5:{src:'/images/editorial/a210c-total-cost.svg',alt:'허브 본체 가격에 필요한 충전기와 케이블 비용을 더하고 현재 기기 유지와 비교하는 선택 도식',caption:'비용 비교를 위한 편집 도식. 가격·성능 실측이나 할인 안내가 아닙니다.'}}
 const f=discovery?extra[index]:path==='/hub/galaxy-book5-pro/buying-ak231s'?figures[index]:undefined
 if(!f)return null
 return <figure className="article-visual"><Image src={f.src} alt={f.alt} width={600} height={discovery?650:880} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
