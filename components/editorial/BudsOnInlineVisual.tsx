import Image from 'next/image'

const figures: Record<number, { src: string; alt: string; caption: string; width: number; height: number }> = {
  0: { src: '/images/editorial/buds-on-wearing-official.jpg', alt: '귀에 버즈 온을 걸쳐 착용하고 손을 귀 가까이에 둔 삼성전자 모델', caption: '삼성전자 뉴스룸 배포 사진. 클립형 착용 모습을 보여주며 직접 사용 후기나 제휴 상품 추천 사진이 아닙니다.', width: 1000, height: 750 },
  1: { src: '/images/editorial/buds-on-audio-directions.svg', alt: '누음 저감은 내 음악이 밖으로 새는 방향, 외부 소음 제어는 주변에서 귀로 들어오는 방향을 다룬다는 개념도', caption: '소리의 방향을 구분한 자체 설명도. 버즈 온의 차음량·누음량을 측정한 결과가 아닙니다.', width: 600, height: 620 },
  4: { src: '/images/editorial/buds-on-coupon-dates.svg', alt: '버즈 온 케이스 쿠폰은 구매·발급 10월27일부터11월30일, 사용은12월20일까지로 기간이 다르다는 일정도', caption: '2026-10-26 공식 행사 안내 기준의 자체 일정도. 본체 할인 쿠폰이 아니며 실제 신청 전 대상·변경 여부를 확인하세요.', width: 600, height: 620 },
}

export default function BudsOnInlineVisual({ index }: { index: number }) {
  const f = figures[index]
  if (!f) return null
  return <figure className="article-visual"><Image src={f.src} alt={f.alt} width={f.width} height={f.height} unoptimized loading={index === 0 ? 'eager' : 'lazy'} style={{ width: '100%', height: 'auto', borderRadius: index === 0 ? 0 : undefined }}/><figcaption>{f.caption}</figcaption></figure>
}
