import type { HubConfig } from './types'

// 로봇청소기 추천 2026 — 2026-08-10 신규 허브.
//
// 다른 허브와 달리 단일 제품이 아니라 카테고리를 다룬다. 그래서 몇 가지를 다르게 뒀다:
//  · specs는 개별 제품 스펙이 아니라 "2026년 기준으로 무엇을 보고 골라야 하는가"의 기준표다.
//  · schema.price는 이 페이지에서 대표로 다루는 모델(로보락 S10 MaxV Slim)의 쿠팡 실거래가다.
//    허브 전체의 값이 아니라 대표 모델의 값이라는 점을 definition과 stats 라벨에 적었다 —
//    가격 표기가 무엇을 가리키는지 모호하면 그 자체가 잘못된 정보가 된다.
//  · 제휴 슬롯도 본체 두 종(가격대가 다른 두 선택지)과 소모품으로 구성했다. 이 카테고리는
//    소모품이 계속 드는 제품이라 그쪽 수요가 실제로 크다.

export const robotVacuum2026: HubConfig = {
  slug: 'robot-vacuum-2026',
  kind: 'product',
  title: '로봇청소기 추천 2026',
  breadcrumb: ['신제품·가전', '생활가전'],
  category: '생활가전',
  trackingNote: '추적 중인 카테고리 · 모델과 값이 바뀌면 갱신됩니다',
  definition:
    '2026년 플래그십은 물걸레 자동세척과 고온 건조가 기본이 됐습니다. 값이 두 배 차이 나는 모델들이 실제로 무엇이 다른지, 어디까지가 필요한 기능인지를 기준으로 정리했습니다. 아래 가격은 대표 모델(로보락 S10 MaxV Slim) 기준입니다.',

  stats: [
    { label: '대표 모델', value: '169만원', note: '로보락 S10 MaxV Slim · 08.10' },
    { label: '보급 선택지', value: '99만원', note: '드리미 매트릭스10 울트라' },
    { label: '물걸레 세척', value: '100℃', note: '고온 세척 · 55℃ 온풍건조', emphasis: true },
    { label: '프리미엄 기준', value: '50만원~', note: '클린스테이션 포함 여부' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['로봇청소기', '로보락', '드리미 로봇청소기', '비스포크 로봇청소기'],

  verdict:
    '50만원을 넘기면 클린스테이션과 물걸레 자동세척이 들어오고, 거기서부터 손이 가는 일이 확연히 줄어듭니다. 그 위로는 고온 세척·온풍 건조 같은 관리 편의가 붙는 구간이라, 물걸레를 얼마나 자주 쓰는지가 판단 기준입니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '첫 매핑을 제대로 잡는 순서' },
        { title: '금지구역·가상벽 실제로 쓸모 있게 긋는 법' },
        { title: '물걸레 물 양과 주기 설정 기준' },
        { title: '카펫 자동 인식이 헛도는 집에서의 설정' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '문턱을 못 넘을 때 확인할 것' },
        { title: '먼지통 자동비움이 작동하지 않을 때' },
        { title: '물걸레에서 냄새가 날 때' },
        { title: '충전 스테이션으로 복귀하지 못할 때' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '로보락·삼성·LG·드리미 무엇이 다른가' },
        { title: '국산과 중국산, AS까지 포함한 총비용', badge: '표' },
        { title: '100만원대와 200만원대의 실제 차이' },
        { title: '물걸레 전용과 흡입 겸용, 집 구조별 선택' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '우리 집에 클린스테이션이 들어갈 자리가 있나' },
        { title: '소모품 연간 비용까지 계산하기' },
        { title: '반려동물 있는 집에서 확인할 조건' },
        { title: '설치 전에 치워둬야 하는 것들' },
      ],
    },
  },

  specsTitle: '2026년 선택 기준',
  specs: [
    { label: '클린스테이션', value: '먼지통 자동비움 — 50만원대부터 기본' },
    { label: '물걸레 관리', value: '자동세척 + 건조 (고온 세척 100℃ / 온풍 55℃)' },
    { label: '리프팅', value: '물걸레·브러시 들어올림 — 카펫 구간 대응' },
    { label: '주요 플래그십', value: 'LG 홈봇 AI 로니 · 삼성 Bespoke AI 스팀 울트라 · 로보락 S10 MaxV' },
    { label: '국산 브랜드', value: '전국 AS망 · 스팀 살균 특화 · 가격대 높음' },
    { label: '중국 브랜드', value: '성능·가성비 우위 · AS 접근성 낮음' },
    { label: '대만 브랜드', value: '에코백스 — 초슬림 · 중간 가격대' },
  ],

  faq: [
    {
      q: '얼마짜리부터 사야 후회가 없나요?',
      a: '먼지통 자동비움(클린스테이션)과 물걸레 자동세척이 들어오는 50만원대가 첫 기준선입니다. 그 아래는 사람이 손대는 일이 꽤 남습니다.',
    },
    {
      q: '국산과 중국산, 어느 쪽이 낫나요?',
      a: '성능과 가격만 보면 중국 브랜드가 앞서는 경우가 많고, AS 접근성과 스팀 살균 같은 기능은 국산이 강합니다. 고장 시 대응까지 총비용으로 따지는 비교표를 정리했습니다.',
    },
    {
      q: '물걸레 고온 세척이 꼭 필요한가요?',
      a: '물걸레를 자주 쓸수록 값어치를 합니다. 100℃ 세척과 온풍 건조는 냄새와 세균 문제를 줄이는 기능이라, 주 1회 이하로 쓴다면 우선순위가 낮습니다.',
    },
    {
      q: '소모품 비용은 얼마나 드나요?',
      a: '필터·물걸레·먼지봉투가 주기적으로 듭니다. 모델별로 규격이 달라 연간 비용 차이가 나므로, 본체 값만 보고 고르면 총비용에서 뒤집히는 경우가 있습니다.',
    },
  ],

  timelineTitle: '이 카테고리에서 있었던 일',
  timeline: [
    { date: '2026-08-10', text: '대표 모델 로보락 S10 MaxV Slim 169만원대 · 드리미 매트릭스10 울트라 99만원대' },
    { date: '2026-01-01', text: '2026년형 플래그십 라인업 공개 — 고온 세척·온풍 건조 확산' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'rv26-roborock', label: '로보락 S10 MaxV Slim', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9360875400&itemId=27775039726&vendorItemId=94735440608&traceid=V0-153-0e576ee32b6beae5&clickBeacon=b92ea2b0-94ec-11f1-b768-cc06b838f07c%7E3&requestid=20260811035306504242776274&token=31850C%7CMIXED' },
      { slot: 'rv26-dreame', label: '드리미 매트릭스10 울트라', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9194703078&itemId=27138592690&vendorItemId=95665090922&traceid=V0-153-3380ad30841d8318&requestid=20260810170233104241939480&token=31850C%7CMIXED' },
      { slot: 'rv26-parts', label: '로봇청소기 소모품', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8793343491&itemId=25573445092&vendorItemId=92564527350&traceid=V0-153-28888bbed5dd0e1b&clickBeacon=d7d0cc30-9491-11f1-b500-53e1e2e49d97%7E3&requestid=20260810170233686319880893&token=31850C%7CMIXED' },
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
    { title: '갤럭시북5 프로', slug: 'galaxy-book5-pro' },
  ],

  tags: ['로봇청소기추천', '로보락', '드리미', '물걸레로봇청소기', '클린스테이션', '소모품'],

  schema: {
    price: 1687800,
    currency: 'KRW',
  },
}
