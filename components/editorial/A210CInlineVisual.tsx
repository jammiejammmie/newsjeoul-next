import Image from 'next/image'

const figures: Record<number,{src:string;alt:string;caption:string}> = {
  1:{src:'/images/editorial/a210c-screen-output-v2.svg',alt:'허브 본체의 상태 화면과 HDMI 또는 DisplayPort로 연결하는 외부 모니터를 구분한 연결도',caption:'상태 화면과 영상 출력을 분리한 자체 개념도입니다. 실제 제품 외관·화면 UI를 재현한 사진이 아닙니다. 최대 주사율은 본문의 해상도·기기 조건을 함께 확인하세요.'},
  2:{src:'/images/editorial/a210c-os-screens-v2.svg',alt:'A210C에 연결한 외부 모니터 두 대가 macOS에서는 같은 A 화면, Windows 지원 조건에서는 서로 다른 A와 B 화면을 표시하는 비교도',caption:'Anker 미국 A210C 안내에 따른 외부 두 화면 구성 예시입니다. 노트북 자체 화면 수나 모든 독·운영체제의 일반적인 제한을 뜻하지 않습니다.'},
  3:{src:'/images/editorial/a210c-power-flow-v2.svg',alt:'100W PD 입력에서 허브가 20W를 확보하고 노트북에 최대 80W를 전달하는 A210C 전력 흐름도',caption:'동일 모델 미국 공식 FAQ의 정격 조건입니다. 실제 충전 속도 측정이 아니며 아래 다른 모델 광고 상품의 사양이 아닙니다. 충전기는 별도입니다.'},
}
export default function A210CInlineVisual({index}:{index:number}) {
  const f=figures[index]
  if(!f)return null
  return <figure className="article-visual"><Image src={f.src} alt={f.alt} width={720} height={660} unoptimized loading="lazy" style={{width:'100%',height:'auto'}}/><figcaption>{f.caption}</figcaption></figure>
}
