import type { HubConfig } from './types'

// LG 그램 2026 — 2026-08-10 신규 허브.
//
// 갤럭시북5 프로와 함께 노트북 짝을 이루고, 엑셀 허브와도 연결된다(기기 → 작업).
// 스펙은 2026-01-01 공개 보도와 제조사 발표에서 확인된 항목만 넣었다. 가격은 쿠팡
// 실거래가(2026-08-10, 16형 Ryzen AI 400 구성)다.

export const lgGram2026: HubConfig = {
  slug: 'lg-gram-2026',
  kind: 'product',
  title: 'LG 그램 2026',
  breadcrumb: ['신제품·가전', '노트북'],
  category: '노트북',
  trackingNote: '추적 중인 제품 · 구성별 가격이 다릅니다',
  definition:
    '16형에서 1,199g이라는 무게가 이 제품의 이유입니다. 2026년형은 소재와 온디바이스 AI가 바뀌었는데, 그 변화가 실사용에서 무엇을 바꾸는지를 기준으로 정리했습니다.',

  stats: [
    { label: '16형 최저가', value: '225만원', note: 'Ryzen AI 400 · 08.10' },
    { label: '무게', value: '1,199g', note: '16형 프로 기준', emphasis: true },
    { label: '배터리', value: '77Wh', note: '최대 27시간' },
    { label: '고속충전', value: '30분', note: '9시간 이상 사용' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['LG 그램', 'LG그램', '그램 프로', '16Z90U', '16Z95U'],
  // '그램'은 단위(g)로도 쓰여 오탐이 많다. 무관한 기사를 걸러낸다.
  newsExclude: ['그램당', '킬로그램', '밀리그램'],

  verdict:
    '16형을 1.2kg 아래로 들고 다녀야 하는 사람에게는 대안이 많지 않습니다. 무게가 우선순위가 아니라면 같은 값에 더 단단한 성능을 주는 선택지가 있습니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '배터리 27시간에 가깝게 쓰는 설정' },
        { title: '엑사원 온디바이스 AI로 실제로 되는 것' },
        { title: '외부 모니터·독 연결 조합 정리' },
        { title: '처음 켜고 해두면 편한 설정 순서' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '충전이 되다 말 때 확인할 순서' },
        { title: '발열로 성능이 떨어질 때 확인할 설정' },
        { title: '무선 연결이 자주 끊긴다면' },
        { title: '키보드 일부 키가 안 먹을 때' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: 'LG 그램 2026 vs 갤럭시북5 프로' },
        { title: '인텔(16Z90U)과 AMD(16Z95U), 어느 쪽인가' },
        { title: '2026년형과 2025년형, 무엇이 달라졌나', badge: '표' },
        { title: '가벼운 16형 노트북 선택지 비교' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '구성별 가격 차이가 값어치를 하는 지점' },
        { title: 'RAM·SSD, 나중에 못 늘리는 것부터' },
        { title: '포트 구성 확인하고 허브 고르기' },
        { title: '키스킨·파우치 실제로 쓸 만한 것만' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '무게', value: '1,199g (16형 프로)' },
    { label: '배터리', value: '77Wh · 최대 27시간' },
    { label: '고속충전', value: '30분 충전으로 9시간 이상' },
    { label: '소재', value: '에어로미늄 (마그네슘·알루미늄 합금)' },
    { label: '내구성', value: '스크래치 저항 35% 이상 향상' },
    { label: '온디바이스 AI', value: 'EXAONE 3.5' },
    { label: '프로세서', value: 'Intel Core Ultra (16Z90U) / Ryzen AI 400 (16Z95U)' },
    { label: '공개', value: '2026년 1월' },
  ],

  faq: [
    {
      q: '인텔과 AMD 중 무엇을 고를까요?',
      a: '16Z90U는 인텔 Core Ultra, 16Z95U는 Ryzen AI 400 시리즈입니다. 구동하려는 프로그램의 최적화와 배터리 성향이 갈리므로, 주로 쓰는 작업 기준으로 비교 문서를 정리했습니다.',
    },
    {
      q: '에어로미늄이 실제로 튼튼한가요?',
      a: '마그네슘과 알루미늄 합금으로, 제조사 발표 기준 스크래치 저항이 35% 이상 개선됐습니다. 다만 가벼운 무게를 위해 얇게 만든 제품이므로 압력에는 여전히 주의가 필요합니다.',
    },
    {
      q: '배터리 27시간은 어떤 기준인가요?',
      a: '제조사 측정 기준이며 실사용과는 차이가 납니다. 화면 밝기와 작업 종류가 가장 큰 변수라, 실측에 가깝게 쓰는 설정을 따로 정리했습니다.',
    },
    {
      q: '엑셀 작업용으로 충분한가요?',
      a: '일반 문서·표 작업에는 충분합니다. 대용량 데이터를 다룬다면 프로세서보다 RAM 구성이 병목이 되는 경우가 많으니, 엑셀 허브의 관련 문서를 함께 보시길 권합니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '16형 Ryzen AI 400 구성 기준 최저가 225만원대' },
    { date: '2026-01-01', text: '2026년형 공개 — 에어로미늄 소재와 EXAONE 3.5 탑재' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'gram26-body', label: 'LG 그램 2026', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9483527655&itemId=28238360147&vendorItemId=95191969711&traceid=V0-153-716272b11e2f8a77&clickBeacon=57971f10-948c-11f1-a267-e84b8b06db78%7E3&requestid=20260810162310964027378787&token=31850C%7CMIXED' },
      { slot: 'gram26-hub', label: 'USB-C 멀티허브', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8717769363&itemId=25321005277&vendorItemId=82386732554&traceid=V0-153-95e924198631f388&clickBeacon=57eba7b0-948c-11f1-9056-a58ef4ea61d5%7E3&requestid=20260810162311621098362527&token=31850C%7CMIXED' },
      { slot: 'gram26-skin', label: '그램 키스킨', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9338585641&itemId=27671067576&vendorItemId=94633223774&traceid=V0-153-2f490e9e2844347b&clickBeacon=583c5fc0-948c-11f1-9c3f-7d864a6c83b7%7E3&requestid=20260810162312163319451643&token=31850C%7CMIXED' },
    ],
  },

  editor: {
    name: '임세라',
    beat: '노트북·PC',
    years: '7년차',
    statement:
      '노트북은 스펙표보다 오래 쓸 때 드러나는 것이 중요합니다. 실제로 며칠 들고 다니며 확인한 내용만 적습니다.',
    hubCount: 6,
    articleCount: 148,
  },

  related: [
    { title: '갤럭시북5 프로', slug: 'galaxy-book5-pro' },
    { title: '엑셀', slug: 'excel' },
  ],

  tags: ['LG그램2026', '그램가격', '가벼운노트북', '노트북비교', '16Z95U'],

  schema: {
    brand: 'LG',
    price: 2257830,
    currency: 'KRW',
  },
}
