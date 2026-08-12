import type { HubConfig } from './types'

// 갤럭시 S25 울트라 — 2026-08-10 신규 허브.
//
// 스펙은 삼성 공식 스펙 페이지에서 확인된 항목만 넣었다. 화면 크기·칩셋처럼 널리 알려진
// 값이라도 이번 조사에서 직접 확인하지 못한 것은 적지 않는다 — 허브의 신뢰는 "여기 적힌 건
// 확인된 것"이라는 데서 나온다. 가격은 쿠팡 실거래가(2026-08-10 수집)다.

export const galaxyS25Ultra: HubConfig = {
  slug: 'galaxy-s25-ultra',
  kind: 'product',
  title: '갤럭시 S25 울트라',
  breadcrumb: ['신제품·가전', '모바일'],
  category: '모바일',
  trackingNote: '추적 중인 제품 · 값이 바뀌면 갱신됩니다',
  definition:
    'S펜을 계속 쓰는 사람에게 사실상 유일한 선택지로 남은 모델입니다. 출시 후 시간이 지나며 가격이 내려온 지금, 무엇을 기준으로 사고 어떻게 쓰는지를 이 페이지에 모았습니다.',

  stats: [
    { label: '자급제 최저가', value: '114만원', note: '쿠팡 기준 · 08.10', emphasis: true },
    { label: '무게', value: '218g', note: '티타늄 프레임' },
    { label: '메인 카메라', value: '2억 화소', note: '초광각 5천만' },
    { label: '배터리', value: '4,855mAh', note: '정격 용량' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['갤럭시 S25 울트라', '갤럭시S25울트라', 'S25 울트라', 'S25울트라', '갤s25울트라'],

  verdict:
    '신제품이 아니라 가격이 내려온 플래그십을 찾는 경우에 맞습니다. S펜을 쓰지 않는다면 같은 값에 고를 수 있는 선택지가 여럿이라, S펜 사용 여부가 사실상 판단 기준입니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: 'S펜으로 실제로 자주 쓰게 되는 기능만' },
        { title: '2억 화소 모드를 언제 켜고 언제 끌까' },
        { title: '배터리 하루 버티게 만드는 설정' },
        { title: '전작에서 데이터 통째로 옮기는 순서' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: 'S펜이 인식되지 않을 때 확인 순서' },
        { title: '발열로 카메라가 제한될 때' },
        { title: '충전 속도가 갑자기 느려졌다면' },
        { title: 'A/S 접수 전에 확인할 자가진단 순서' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: 'S25 울트라 vs S25 엣지, 무엇이 다른가' },
        { title: 'S펜 쓰는 사람의 대안이 있나' },
        { title: '플래그십 카메라 스펙 비교표', badge: '표' },
        { title: '중고 시세와 보상판매, 뭐가 이득인가' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '지금 사도 되는 시점인지 판단하는 법' },
        { title: '자급제와 통신사, 24개월 총액 비교' },
        { title: '256GB와 512GB, 어느 쪽이 맞나' },
        { title: '필름·케이스 실제로 쓸 만한 것만' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '무게', value: '218g' },
    { label: '프레임', value: '티타늄' },
    { label: '메인 카메라', value: '2억 화소 광각' },
    { label: '초광각 카메라', value: '5천만 화소' },
    { label: '배터리', value: '4,855mAh (정격)' },
    { label: 'S펜', value: '지원' },
  ],

  faq: [
    {
      q: 'S펜은 본체에 수납되나요?',
      a: 'S25 울트라는 S펜을 지원합니다. 필기와 캡처 등 실제로 손이 자주 가는 기능만 따로 정리해 두었습니다.',
    },
    {
      q: '2억 화소는 항상 켜두는 게 좋나요?',
      a: '용량과 처리 시간이 늘어나므로 상황에 따라 다릅니다. 크게 인화하거나 크롭할 계획이 있을 때 유리하고, 일상 촬영에서는 기본 모드가 더 실용적입니다.',
    },
    {
      q: '지금 사기에 늦지 않았나요?',
      a: '출시 후 시간이 지나 자급제 기준 114만원대까지 내려왔습니다. 최신 세대가 필요하지 않다면 오히려 지금이 가격 대비 조건은 낫습니다.',
    },
    {
      q: '티타늄 프레임이 체감되나요?',
      a: '218g으로 가벼운 편은 아니지만, 같은 크기의 알루미늄 프레임 대비 내구성에서 이점이 있습니다. 무게 자체가 부담이라면 더 작은 모델을 권합니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '자급제 최저가 114만원대 — 출시가 대비 하락' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 's25u-body', label: 'S25 울트라 자급제', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9675221276&itemId=28929490970&vendorItemId=95043219842&traceid=V0-153-89e833b6f6344ff5&requestid=20260810170217771319886865&token=31850C%7CGM' },
      { slot: 's25u-spen', label: 'S25 울트라 호환 S펜', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8591417691&itemId=24910467565&vendorItemId=92278391556&traceid=V0-153-461e2dc210908a0b&requestid=20260810170218368288598070&token=31850C%7CGM' },
      { slot: 's25u-film', label: 'S25 울트라 보호필름', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8709735623&itemId=25295825491&vendorItemId=92291143984&traceid=V0-153-4a7d2f9433f8df88&clickBeacon=b2afbb90-94ec-11f1-a87b-269eee1ffae1%7E3&requestid=20260811035255499073372513&token=31850C%7CMIXED' },
    ],
  },

  editor: {
    name: '노정민',
    beat: '모바일·가전',
    statement: '제조사 공식 스펙, 판매 데이터, 사용자 리뷰를 종합 분석합니다',
    hubCount: 7,
  },

  related: [
    { title: '갤럭시 Z 폴드8', slug: 'galaxy-z-fold8' },
    { title: '갤럭시 Z 플립8', slug: 'galaxy-z-flip8' },
    { title: '아이폰 17 프로', slug: 'iphone-17-pro' },
    { title: '갤럭시 버즈4', slug: 'galaxy-buds4' },
  ],

  tags: ['S25울트라가격', 'S펜', 'S25울트라카메라', '플래그십비교', '자급제'],

  schema: {
    brand: 'Samsung',
    price: 1142670,
    currency: 'KRW',
  },
}
