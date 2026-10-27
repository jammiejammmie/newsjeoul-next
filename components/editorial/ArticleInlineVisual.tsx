import HumidifierInlineVisual from './HumidifierInlineVisual'
import CarbonMatInlineVisual from './CarbonMatInlineVisual'
import GramDualMonitorInlineVisual from './GramDualMonitorInlineVisual'
import Fold8ChargingInlineVisual from './Fold8ChargingInlineVisual'
import Flip8FilmInlineVisual from './Flip8FilmInlineVisual'
import BudsIphoneInlineVisual from './BudsIphoneInlineVisual'
import FlipWidgetInlineVisual from './FlipWidgetInlineVisual'
import SpenInlineVisual from './SpenInlineVisual'
import BudsRecoveryInlineVisual from './BudsRecoveryInlineVisual'
import EnergyVoucherInlineVisual from './EnergyVoucherInlineVisual'
import A210CInlineVisual from './A210CInlineVisual'
import Image from 'next/image'
import BudsOnInlineVisual from './BudsOnInlineVisual'
const figures: Record<number, {src:string;alt:string;caption:string}> = {
 1: {src:'/images/editorial/usb-c-port-roles.svg',alt:'노트북 HOST 연결, PD IN 전원 입력, 데이터와 영상 출력 포트를 구분하는 설명도',caption:'포트 역할을 구분한 자체 제작 개념도. 실제 포트 위치와 지원 기능은 모델 설명서로 확인하세요.'},
 2: {src:'/images/editorial/usb-c-power-budget.svg',alt:'Anker 10-in-1 Dual Display 허브의 최대 입력 100W 중 허브 소비 15W를 고려해 노트북에 최대 85W를 전달하는 예시',caption:'Anker 해당 제품 FAQ 기준의 정격 설명 예시. 실측값이나 아래 광고 상품의 사양이 아닙니다.'},
}
export default function ArticleInlineVisual({path,index}:{path:string;index:number}) {
 if(path==='/hub/carbon-heated-mat/buying-temperature-wash-cost')return <CarbonMatInlineVisual index={index}/>
 if(path==='/hub/lg-gram-2026/howto-d3qn0e')return <GramDualMonitorInlineVisual index={index}/>
 if(path==='/hub/galaxy-z-fold8/45w-charger-pps-cable')return <Fold8ChargingInlineVisual index={index}/>
 if(path==='/hub/galaxy-z-flip8/screen-film-warning')return <Flip8FilmInlineVisual index={index}/>
 if(path==='/hub/humidifier/winter-type-cleaning-running-cost')return <HumidifierInlineVisual index={index}/>
 if(path==='/hub/galaxy-buds4/with-iphone')return <BudsIphoneInlineVisual index={index}/>
 if(['/hub/galaxy-buds4/single-bud-replacement','/hub/galaxy-buds4/lost-charging-case-replacement'].includes(path))return <BudsRecoveryInlineVisual path={path} index={index}/>
 if(path==='/hub/galaxy-z-flip8/cover-widget-missing')return <FlipWidgetInlineVisual index={index}/>
 if(path==='/hub/galaxy-s25-ultra/s-1xzjlx')return <SpenInlineVisual index={index}/>
 if(path==='/hub/energy-voucher/winter-application-balance-2026')return <EnergyVoucherInlineVisual index={index}/>
 if(path==='/hub/galaxy-buds4/buds-on-library-leakage-buying')return <BudsOnInlineVisual index={index}/>
 if(path==='/hub/galaxy-book5-pro/anker-a210c-smart-display-hub')return <A210CInlineVisual index={index}/>
 const f=path==='/hub/galaxy-book5-pro/buying-ak231s'?figures[index]:undefined
 if(!f)return null
 return <figure className="article-visual"><Image src={f.src} alt={f.alt} width={600} height={880} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
