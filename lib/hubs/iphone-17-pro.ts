import type { HubConfig } from './types'

// 아이폰 17 프로 — 2026-08-10 신규 허브.
//
// 스펙은 Apple 공식 발표와 스펙 DB에서 확인된 항목만 넣었다. 국내 출고가는 이번 조사에서
// 프로 모델 값을 확정하지 못해 적지 않고, 대신 쿠팡 실거래가(2026-08-10)를 쓴다 —
// 확인 못한 값을 "출고가"로 적는 것보다 확인된 값을 출처와 함께 적는 편이 정확하다.

export const iphone17Pro: HubConfig = {
  slug: 'iphone-17-pro',
  kind: 'product',
  title: '아이폰 17 프로',
  breadcrumb: ['신제품·가전', '모바일'],
  category: '모바일',
  trackingNote: '추적 중인 제품 · 값이 바뀌면 갱신됩니다',
  definition:
    '망원 카메라가 새로 들어가고 램이 12GB로 올라간 세대입니다. 가격·구성 조건부터 안드로이드에서 넘어올 때 걸리는 것까지, 아이폰 17 프로에 관해 검색되는 것을 모았습니다.',

  stats: [
    { label: '자급제 최저가', value: '173만원', note: '쿠팡 기준 · 08.10' },
    { label: '메모리', value: '12GB', note: '아이폰 최초', emphasis: true },
    { label: '광학 줌', value: '8배', note: '역대 최장' },
    { label: '배터리', value: '3,998mAh', note: '6.3형 기준' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['아이폰 17 프로', '아이폰17프로', 'iPhone 17 Pro', '아이폰 17'],
  newsExclude: ['아이폰 16', '아이폰16', '아이폰 15'],

  verdict:
    '망원과 램 증가가 이번 세대의 실질적인 변화입니다. 카메라를 많이 쓰지 않는다면 전작과의 체감 차이는 성능 수치만큼 크지 않습니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '8배 줌을 실제로 쓸 만하게 찍는 법' },
        { title: '안드로이드에서 데이터 옮기는 순서' },
        { title: '배터리 하루 버티게 만드는 설정' },
        { title: '처음 켜고 해두면 편한 설정 8가지' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '맥세이프 충전이 안 붙을 때' },
        { title: '발열로 카메라가 제한될 때' },
        { title: '배터리가 갑자기 빨리 닳는다면' },
        { title: 'A/S 접수 전에 확인할 자가진단 순서' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '17 프로 vs 17 프로 맥스, 무엇을 기준으로' },
        { title: '아이폰 17 프로 vs 갤럭시 S25 울트라' },
        { title: '전작 대비 실제로 달라진 것 비교표', badge: '표' },
        { title: '중고 시세와 보상판매, 뭐가 이득인가' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '자급제와 통신사, 24개월 총액 비교' },
        { title: '저장용량, 어느 구성이 맞나' },
        { title: '맥세이프 액세서리 고를 때 확인할 것' },
        { title: '필름·케이스 실제로 쓸 만한 것만' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '디스플레이', value: '6.3"' },
    { label: '칩', value: 'A19 Pro · CPU 6코어 / GPU 6코어 / NPU 16코어' },
    { label: '메모리', value: '12GB (아이폰 최초)' },
    { label: '후면 카메라', value: '48MP Fusion ×3 (메인·초광각·망원)' },
    { label: '광학 줌', value: '8배 (역대 최장)' },
    { label: '전면 카메라', value: '18MP Center Stage' },
    { label: '배터리', value: '3,998mAh' },
    { label: '성능', value: '프로 라인 기준 40% 향상' },
  ],

  faq: [
    {
      q: '전작에서 넘어갈 만한가요?',
      a: '망원 카메라 추가와 12GB 램이 가장 큰 변화입니다. 사진·영상 작업이 잦다면 체감이 크고, 그렇지 않다면 전작으로도 충분한 경우가 많습니다.',
    },
    {
      q: '8배 광학 줌은 실제로 쓸 만한가요?',
      a: '아이폰에 들어간 광학 줌 중 가장 긴 배율입니다. 다만 조도가 낮으면 화질 저하가 뚜렷하므로, 실제로 쓸 만하게 찍는 조건을 문서로 정리했습니다.',
    },
    {
      q: '안드로이드에서 넘어올 때 뭐가 걸리나요?',
      a: '메시지 이력과 일부 앱 데이터가 자동으로 옮겨지지 않습니다. 순서를 지키면 대부분 해결되므로 이전 절차를 단계별로 정리했습니다.',
    },
    {
      q: '배터리 3,998mAh면 부족하지 않나요?',
      a: '용량 숫자만으로는 비교가 어렵습니다. 칩 효율이 함께 올라갔기 때문인데, 실사용에서 소모가 커지는 설정들을 따로 정리했습니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '자급제 최저가 173만원대' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'ip17p-body', label: '아이폰 17 프로 자급제', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9024167576&itemId=26462330287&vendorItemId=93437609640&traceid=V0-153-81d4af092486a31f&requestid=20260810170226738013566746&token=31850C%7CGM' },
      { slot: 'ip17p-charger', label: '맥세이프 충전기', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=6328450053&itemId=13223580088&vendorItemId=87574774410&traceid=V0-153-3ee979b49ae9d58f&clickBeacon=d3f9faa0-9491-11f1-b4ab-9a86ba641646%7E3&requestid=20260810170227251322765272&token=31850C%7CMIXED' },
      { slot: 'ip17p-film', label: '아이폰 17 프로 보호필름', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8309398022&itemId=26492355344&vendorItemId=93467212937&traceid=V0-153-864ded0bb2d85844&requestid=20260810170228943098363685&token=31850C%7CGM' },
    ],
  },

  editor: {
    name: '노정민',
    beat: '모바일·가전',
    statement: '제조사 공식 스펙, 판매 데이터, 사용자 리뷰를 종합 분석합니다',
    hubCount: 7,
  },

  related: [
    { title: '갤럭시 S25 울트라', slug: 'galaxy-s25-ultra' },
    { title: '갤럭시 Z 폴드8', slug: 'galaxy-z-fold8' },
    { title: '갤럭시 Z 플립8', slug: 'galaxy-z-flip8' },
  ],

  tags: ['아이폰17프로가격', '아이폰17프로카메라', '아이폰비교', '자급제', '맥세이프'],

  schema: {
    brand: 'Apple',
    price: 1730000,
    currency: 'KRW',
  },
}
