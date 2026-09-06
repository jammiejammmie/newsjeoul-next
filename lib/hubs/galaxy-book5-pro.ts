import type { HubConfig } from './types'

// 갤럭시북5 프로 — 2026-08-10 신규 허브.
//
// 노트북 허브는 엑셀 허브(/hub/excel)와 짝이 된다. 기기를 찾아온 사람의 다음 질문이
// "이걸로 무슨 작업을 어떻게 하나"이기 때문이다 — related에 excel을 넣은 이유다.
// 가격은 쿠팡 실거래가(2026-08-10, 16형 Core Ultra 7 구성 기준)다. 구성마다 값이 크게
// 달라지므로 stats 라벨에 어떤 구성인지 함께 적었다.

export const galaxyBook5Pro: HubConfig = {
  slug: 'galaxy-book5-pro',
  kind: 'product',
  title: '갤럭시북5 프로',
  breadcrumb: ['신제품·가전', '노트북'],
  category: '노트북',
  trackingNote: '추적 중인 제품 · 구성별 가격이 다릅니다',
  definition:
    '아몰레드 화면과 가벼운 무게를 우선하는 사람에게 맞는 노트북입니다. 구성에 따라 값 차이가 큰 제품이라, 어떤 구성이 어떤 작업에 맞는지부터 정리했습니다.',

  stats: [
    { label: '16형 최저가', value: '295만원', note: 'Ultra 7 구성 · 08.10' },
    { label: '무게', value: '1.23kg', note: '14형 기준' },
    { label: '배터리', value: '63.1Wh', note: '영상재생 최대 21시간' },
    { label: '화면', value: '2880×1800', note: 'AMOLED 2X 반사방지' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['갤럭시북5', '갤럭시북 5', '갤럭시북5 프로', 'NT960XHA', 'NT940XHA'],
  // '갤럭시북'만 쓰면 이전 세대 기사가 대량으로 딸려온다.
  newsExclude: ['갤럭시북4', '갤럭시북3', '갤럭시북2'],

  verdict:
    '화면과 무게가 선택 이유인 제품입니다. 같은 값에 더 높은 연산 성능을 주는 노트북이 있으므로, 아몰레드 화면이 필요한 작업인지부터 따져보는 편이 낫습니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        // 2026-08-12 롱테일 ★ 2건(docs/newsjeoul-hub-longtail-candidates.md)
        { title: '윈도우 클린 설치 후 삼성 드라이버 되살리기', slug: 'clean-install-drivers' },
        { title: '소음·발열 잡는 전원 모드 설정', slug: 'power-mode-thermal' },
        { title: '배터리를 아끼는 아몰레드 화면 설정' },
        { title: 'Copilot+ 기능 중 실제로 쓰게 되는 것' },
        { title: '갤럭시 폰과 연결해서 쓰는 조합 정리' },
        { title: '처음 켜고 해두면 편한 설정 순서' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        // 2026-08-12 롱테일 ★ 1건
        { title: '절전 모드에서 안 깨어날 때', slug: 'sleep-wake-failure' },
        { title: '충전이 되다 말 때 확인할 순서' },
        { title: '외부 모니터가 인식되지 않을 때' },
        { title: '팬 소음이 갑자기 커졌다면' },
        { title: '화면 번인이 걱정될 때 확인할 설정' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '갤럭시북5 프로 vs LG 그램 2026' },
        { title: '14형과 16형, 무게 0.33kg 차이의 의미' },
        { title: '아몰레드와 IPS, 작업별 유불리 비교표', badge: '표' },
        { title: '같은 값의 다른 선택지들' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '구성별 가격 차이가 값어치를 하는 지점' },
        { title: 'RAM·SSD, 나중에 못 늘리는 것부터' },
        { title: '멀티허브가 필요한 포트 구성인지 확인하기' },
        { title: '파우치·거치대 실제로 쓸 만한 것만' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '디스플레이', value: '2880×1800 AMOLED 2X · 반사방지' },
    { label: '무게', value: '14형 1.23kg / 16형 1.56kg' },
    { label: '배터리', value: '63.1Wh · 영상재생 최대 21시간' },
    { label: '프로세서', value: 'Intel Core Ultra 7' },
    { label: '분류', value: 'Copilot+ PC' },
    { label: '모델명', value: 'NT960XHA (16형) / NT940XHA (14형)' },
  ],

  faq: [
    {
      q: '14형과 16형 중 무엇을 고를까요?',
      a: '들고 다니는 빈도가 기준입니다. 14형은 1.23kg, 16형은 1.56kg으로 0.33kg 차이가 납니다. 매일 이동한다면 14형, 화면을 크게 쓰는 작업이 많다면 16형이 맞습니다.',
    },
    {
      q: '배터리가 실제로 21시간 가나요?',
      a: '21시간은 영상 재생 기준입니다. 화면 밝기와 작업 종류에 따라 달라지며, 문서 작업과 웹 사용 위주라면 그보다 짧습니다. 배터리를 아끼는 화면 설정을 따로 정리했습니다.',
    },
    {
      q: '아몰레드 화면은 번인이 생기지 않나요?',
      a: '고정된 화면 요소를 장시간 띄우는 사용에서 위험이 커집니다. 작업표시줄 자동 숨김과 화면 보호기 주기 설정으로 줄일 수 있어, 관련 설정을 문서로 정리했습니다.',
    },
    {
      q: '엑셀 같은 문서 작업에 충분한가요?',
      a: '일반적인 문서·표 작업에는 충분합니다. 대용량 데이터나 복잡한 수식을 다룬다면 RAM 구성이 더 중요하므로, 엑셀 허브의 성능 관련 문서를 함께 보시길 권합니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '16형 Ultra 7 구성 기준 최저가 295만원대' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'book5-body', label: '갤럭시북5 프로', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9652772281&itemId=28852384165&vendorItemId=95786145441&traceid=V0-153-8dcb02b99aa92e08&clickBeacon=408b7e90-aa2d-11f1-8210-b75855c9aa4e%7E3&requestid=20260907045755771223140289&token=31850C%7CMIXED&pt=1&slot=1' },
      { slot: 'book5-hub', label: 'USB-C 멀티허브', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8223019655&itemId=23640678087&vendorItemId=90680537967&traceid=V0-153-fdac903e3a3e117f&clickBeacon=eddf8f00-a7d5-11f1-92be-627069561053%7E3&requestid=20260904052748522101950501&token=31850C%7CMIXED&pt=1&slot=1' },
      { slot: 'book5-pouch', label: '노트북 파우치', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=6589286352&itemId=25533390046&vendorItemId=82101374510&traceid=V0-153-10f05df9ca1954a2&clickBeacon=bafcf8f0-967f-11f1-a3fb-fe222daf1a48%7E3&requestid=20260813035756564288748691&token=31850C%7CMIXED' },
    ],
  },

  editor: {
    name: '임세라',
    beat: '노트북·PC',
    statement: '제조사 공식 스펙, 판매 데이터, 사용자 리뷰를 종합 분석합니다',
    hubCount: 2,
  },

  related: [
    { title: 'LG 그램 2026', slug: 'lg-gram-2026' },
    { title: '엑셀', slug: 'excel' },
    { title: '갤럭시 Z 폴드8', slug: 'galaxy-z-fold8' },
  ],

  tags: ['갤럭시북5가격', '갤럭시북5프로', '노트북비교', '아몰레드노트북', 'Copilot+PC'],

  schema: {
    brand: 'Samsung',
    price: 2429000,
    currency: 'KRW',
  },
}
