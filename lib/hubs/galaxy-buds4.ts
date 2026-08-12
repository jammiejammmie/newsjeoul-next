import type { HubConfig } from './types'

// 갤럭시 버즈4 — 2026-08-10 신규 허브.
//
// 2026-02-25 언팩 공개. 스펙은 삼성 발표와 공식 스펙 페이지에서 확인된 항목만 넣었다.
// 배터리 지속시간처럼 이번 조사에서 수치를 확정하지 못한 항목은 적지 않았다.
// 가격은 쿠팡 실거래가(2026-08-10)다.

export const galaxyBuds4: HubConfig = {
  slug: 'galaxy-buds4',
  kind: 'product',
  title: '갤럭시 버즈4',
  breadcrumb: ['신제품·가전', '오디오'],
  category: '오디오',
  trackingNote: '추적 중인 제품 · 값이 바뀌면 갱신됩니다',
  definition:
    '노이즈캔슬링이 주변 소음 종류를 구분해 강도를 스스로 바꾸는 세대입니다. 지하철·카페처럼 실제로 쓰는 환경에서 무엇이 달라지는지를 기준으로 정리했습니다.',

  stats: [
    { label: '최저가', value: '25만원', note: '쿠팡 기준 · 08.10' },
    { label: '공개', value: '2월 25일', note: '갤럭시 언팩 2026' },
    { label: 'ANC', value: '3세대', note: '소음 유형 자동 감지', emphasis: true },
    { label: '우퍼', value: '유효면적 +20%', note: '베젤리스 최초 적용' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['갤럭시 버즈4', '갤럭시버즈4', '버즈4', 'Galaxy Buds4'],
  newsExclude: ['버즈3', '버즈2'],

  verdict:
    '소음 환경이 자주 바뀌는 사람에게 3세대 ANC의 자동 조절이 실질적인 차이를 만듭니다. 조용한 곳에서만 쓴다면 전작과의 체감 차이는 크지 않습니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '지능형 ANC를 환경별로 길들이는 설정' },
        { title: '핀치 컨트롤 제스처 바꿔 쓰는 법' },
        { title: '여러 기기 사이에서 자동 전환 설정' },
        { title: '처음 연결하고 해두면 편한 설정' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '한쪽만 소리가 안 날 때 확인 순서' },
        { title: '자동 연결이 자꾸 끊길 때' },
        { title: '케이스에서 충전이 안 될 때' },
        { title: '통화 음질이 나쁘다는 말을 들었다면' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '버즈4와 버즈4 프로, 무엇이 다른가' },
        { title: '버즈4 vs 버즈3, 넘어갈 만한가' },
        { title: '무선이어폰 ANC 성능 비교표', badge: '표' },
        { title: '아이폰과 함께 쓸 때의 제약' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '일반형과 프로, 어느 쪽이 맞나' },
        { title: '귀 모양에 맞는 이어팁 고르는 법' },
        { title: '보증과 배터리 교체 조건 확인하기' },
        { title: '케이스·이어팁 실제로 쓸 만한 것만' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '노이즈캔슬링', value: '3세대 지능형 ANC (소음 유형 실시간 감지)' },
    { label: '드라이버', value: '베젤리스 우퍼 · 유효면적 약 20% 확대' },
    { label: '조작', value: '메탈 블레이드 핀치 컨트롤' },
    { label: '크래들', value: '반투명 커버 디자인' },
    { label: '공개', value: '2026년 2월 25일 (갤럭시 언팩 2026)' },
  ],

  faq: [
    {
      q: '3세대 ANC는 전작과 뭐가 다른가요?',
      a: '주변 소음의 유형을 실시간으로 감지해 강도를 자동 조절합니다. 지하철 소음, 카페 소음, 바람 소리를 구분해 처리하는 방식이라, 환경이 자주 바뀔수록 차이가 드러납니다.',
    },
    {
      q: '버즈4와 버즈4 프로 중 무엇을 살까요?',
      a: '프로가 상위 모델로 음질과 기능에서 앞섭니다. 다만 값 차이가 있으므로 ANC 성능이 우선인지, 가격이 우선인지에 따라 갈립니다. 비교 문서를 따로 정리했습니다.',
    },
    {
      q: '아이폰에서도 쓸 수 있나요?',
      a: '블루투스 연결 자체는 됩니다. 다만 갤럭시 기기에서만 쓸 수 있는 기능이 있어 제약이 생기므로, 어떤 기능이 빠지는지 정리해 두었습니다.',
    },
    {
      q: '이어팁은 기본 제공되는 것만 써야 하나요?',
      a: '귀 모양에 맞지 않으면 차음이 떨어져 ANC 성능까지 손해를 봅니다. 크기와 재질을 바꿔 맞추는 편이 효과가 큽니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '최저가 25만원대' },
    { date: '2026-02-25', text: '갤럭시 언팩 2026에서 버즈4 시리즈 공개' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'buds4-body', label: '갤럭시 버즈4', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9309807813&itemId=27585107825&vendorItemId=94548723294&traceid=V0-153-2e7cd668ebe88b03&requestid=20260810170229466062620058&token=31850C%7CGM' },
      { slot: 'buds4-case', label: '버즈4 케이스', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9484024706&itemId=28240473712&vendorItemId=95136591663&traceid=V0-153-ddee0d5b9534bbe8&clickBeacon=b815dfb0-94ec-11f1-9e2c-e3d4debd1346%7E3&requestid=20260811035304606292659800&token=31850C%7CMIXED' },
      { slot: 'buds4-tips', label: '버즈4 이어팁', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9409824061&itemId=27958528997&vendorItemId=91427461138&traceid=V0-153-430ea1b89d1e19d7&requestid=20260810170230562255242943&token=31850C%7CGM' },
    ],
  },

  editor: {
    name: '노정민',
    beat: '모바일·가전',
    statement: '제조사 공식 스펙, 판매 데이터, 사용자 리뷰를 종합 분석합니다',
    hubCount: 7,
  },

  related: [
    { title: '갤럭시 Z 플립8', slug: 'galaxy-z-flip8' },
    { title: '갤럭시 S25 울트라', slug: 'galaxy-s25-ultra' },
    { title: '갤럭시 Z 폴드8', slug: 'galaxy-z-fold8' },
  ],

  tags: ['버즈4가격', '버즈4ANC', '무선이어폰비교', '버즈4프로', '이어팁'],

  schema: {
    brand: 'Samsung',
    price: 254840,
    currency: 'KRW',
  },
}
