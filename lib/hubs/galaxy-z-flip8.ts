import type { HubConfig } from './types'

// 갤럭시 Z 플립8 — 2026-08-10 신규 허브.
//
// 값의 출처:
//  · 스펙·출시일은 삼성 공식 스펙 페이지와 언팩 보도를 조사해 넣었다(2026-07-22 런던 언팩,
//    2026-08-07 국내 출시). 확인되지 않은 항목은 아예 적지 않는다 — 폴드8 허브가 시안 값을
//    쓰면서 needsEditorVerification 주석을 달아야 했던 상황을 반복하지 않기 위해서다.
//  · 가격은 쿠팡 파트너스 검색 API로 조회한 실제 판매가다(수집 시점 2026-08-10). 출고가가
//    아니라 "지금 이 값에 살 수 있다"는 뜻이므로 stats 라벨에 그대로 적었다.
//  · trend(가격 추이)는 넣지 않았다. 시계열 데이터가 없는데 추이 그래프를 그리면 없는 것을
//    지어내는 셈이다. 수집이 쌓이면 그때 추가한다.
//
// 제휴: 레이어1 본체 / 레이어2 주변기기 / 레이어3 소모품·보호. targetUrl은
// scripts/update-coupang-slots.js가 쿠팡 검색 API 결과로 채운다(수동 입력 금지).

export const galaxyZFlip8: HubConfig = {
  slug: 'galaxy-z-flip8',
  kind: 'product',
  title: '갤럭시 Z 플립8',
  breadcrumb: ['신제품·가전', '모바일'],
  category: '모바일',
  trackingNote: '추적 중인 제품 · 값이 바뀌면 갱신됩니다',
  definition:
    '커버 화면이 4.1인치로 커지면서 폴더블을 접은 채로 쓰는 시간이 길어졌습니다. 가격·물량 조건부터 실제 사용 설정과 자주 나는 오류까지, 플립8에 관해 검색되는 것을 이 페이지에 모았습니다.',

  stats: [
    { label: '자급제 최저가', value: '158만원', note: '쿠팡 기준 · 08.10' },
    { label: '국내 출시', value: '8월 7일', note: '언팩 7월 22일' },
    { label: '커버 화면', value: '4.1형', note: '전작 대비 확대', emphasis: true },
    { label: '배터리', value: '4,300mAh', note: '25W 유선 충전' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-08-10',
  updateCountFallback: 1,

  newsKeywords: ['갤럭시 Z 플립8', '갤럭시Z플립8', '플립8', 'Z플립8', '갤플립8'],

  verdict:
    '접은 채로 쓸 수 있는 범위가 넓어진 것이 이번 세대의 핵심입니다. 커버 화면 활용이 적은 사용자라면 전작 대비 인상분만큼의 값어치는 크지 않습니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '커버 화면에서 앱 전체를 실행하는 설정' },
        { title: '플렉스 모드에서 쓸 만한 앱과 각도 조합' },
        { title: '배터리 하루 버티게 만드는 설정 7가지' },
        { title: '전작에서 데이터 통째로 옮기는 순서' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '접힌 부분 터치가 늦게 먹을 때 확인할 것' },
        { title: '무선 충전이 갑자기 끊기는 3가지 원인' },
        { title: '커버 화면 위젯이 사라졌을 때' },
        { title: 'A/S 접수 전에 확인할 자가진단 순서' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '플립8 vs 플립7, 19.8만원 더 낼 가치가 있나' },
        { title: '플립8 vs 폴드8, 무엇을 기준으로 고를까' },
        { title: '폴더블 커버 화면 크기 비교표', badge: '표' },
        { title: '중고 시세와 보상판매, 뭐가 이득인가' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '자급제와 통신사, 24개월 총액 비교' },
        { title: '사전예약 혜택이 실제로 남는지 계산하기' },
        { title: '케이스·필름 실제로 쓸 만한 것만' },
        { title: '개통 첫날 해두면 편한 8가지' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '메인 디스플레이', value: '6.9" 다이내믹 AMOLED 2X · 2520×1080' },
    { label: '커버 디스플레이', value: '4.1" Super AMOLED · 1048×948 · 120Hz' },
    { label: '메모리', value: '12GB RAM' },
    { label: '저장용량', value: '256GB / 512GB (UFS 4.0)' },
    { label: '배터리', value: '4,300mAh 듀얼 셀' },
    { label: '충전', value: '유선 25W · 무선 15W · 역무선 4.5W' },
    { label: '운영체제', value: '안드로이드 17 (최초 탑재)' },
    { label: '출시일', value: '2026년 8월 7일' },
  ],

  faq: [
    {
      q: '전작보다 얼마나 비싸졌나요?',
      a: '플립7 대비 198,000원 일괄 인상됐습니다. 커버 화면 확대와 안드로이드 17 최초 탑재가 인상 근거로 제시됐습니다.',
    },
    {
      q: '커버 화면만으로 어디까지 되나요?',
      a: '4.1인치로 커지면서 접은 상태에서 다룰 수 있는 범위가 넓어졌습니다. 다만 앱마다 커버 화면 지원 정도가 달라, 자주 쓰는 앱 기준으로 확인하는 편이 실용적입니다.',
    },
    {
      q: '배터리는 하루 버티나요?',
      a: '4,300mAh 듀얼 셀입니다. 커버 화면을 자주 켜는 사용 패턴에서는 소모가 빨라지므로, 상시 표시와 새로고침 주기를 조정하는 설정을 따로 정리했습니다.',
    },
    {
      q: '지금 사야 하나요, 기다려야 하나요?',
      a: '출시 직후라 가격 변동 폭이 아직 크지 않습니다. 급하지 않다면 첫 인하 시점을 확인하는 편을 권합니다. 이 페이지의 가격은 계속 갱신됩니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-07', text: '국내 정식 출시' },
    { date: '2026-07-22', text: '런던 갤럭시 언팩에서 공개 · 안드로이드 17 최초 탑재 발표' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'flip8-body', label: '갤럭시 Z 플립8 자급제', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9640170465&itemId=28803753685&vendorItemId=95739034399&traceid=V0-153-4c2c221c4459f682&requestid=20260810170215842083220599&token=31850C%7CGM' },
      { slot: 'flip8-case', label: '플립8 전용 케이스', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9653622109&itemId=28855127456&vendorItemId=95665785987&traceid=V0-153-ff90db421e8a8d1e&requestid=20260810170216419214931357&token=31850C%7CGM' },
      { slot: 'flip8-film', label: '플립8 보호필름', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9670420932&itemId=28913582834&vendorItemId=95845423378&traceid=V0-153-9f7a957aed0ad48b&requestid=20260810170217131019175403&token=31850C%7CGM' },
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
    { title: '갤럭시 S25 울트라', slug: 'galaxy-s25-ultra' },
    { title: '갤럭시 버즈4', slug: 'galaxy-buds4' },
    { title: '아이폰 17 프로', slug: 'iphone-17-pro' },
  ],

  tags: ['플립8가격', '플립8사용법', '플립8오류', '폴더블비교', '자급제', '커버화면'],

  schema: {
    brand: 'Samsung',
    price: 1582000,
    currency: 'KRW',
    releaseDate: '2026-08-07',
  },
}
