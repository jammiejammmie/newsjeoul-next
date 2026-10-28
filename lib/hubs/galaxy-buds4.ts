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
  trackingNote: '제품 선택 가이드 · 과거 가격과 현재 판매 조건은 다를 수 있습니다',
  definition:
    '오픈형 버즈4와 커널형 버즈4 프로를 구분해 착용 방식·기기 호환·구매 조건을 정리합니다. 프로 전용 사양을 일반형의 사양으로 읽지 않도록 확인하세요.',

  stats: [
    { label: '과거 참고가', value: '25만원', note: '쿠팡 기준 · 08.10' },
    { label: '공개', value: '2월 25일', note: '갤럭시 언팩 2026' },
    { label: '일반형', value: '오픈형', note: '이어팁형 프로와 구분', emphasis: true },
    { label: '프로', value: '커널형', note: '실리콘 이어팁 사용' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-10-26',
  updateCountFallback: 1,

  newsKeywords: ['갤럭시 버즈4', '갤럭시버즈4', '버즈4', 'Galaxy Buds4'],
  newsExclude: ['버즈3', '버즈2'],

  verdict:
    '일반형과 프로는 착용 구조부터 다릅니다. 귀에 맞는 구조와 사용하는 휴대폰의 기능 지원을 먼저 확인하고 가격 차이를 비교하세요.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '지능형 ANC를 환경별로 길들이는 설정', slug: 'anc-settings' },
        { title: '핀치 컨트롤 제스처 바꿔 쓰는 법', slug: 'pinch-controls' },
        { title: '여러 기기 사이에서 자동 전환 설정', slug: 'auto-switch' },
        { title: '처음 연결하고 해두면 편한 설정', slug: 'first-setup' },
        // 2026-08-12 보강. 통화 중 주변 소리와 배터리 관리는 실사용에서 가장 자주
        // 되묻는 두 가지인데 문서가 없었다.
        { title: '통화 중 주변 소리를 조절하는 법', slug: 'call-ambient-sound' },
        { title: '배터리를 오래 쓰는 충전 습관과 설정', slug: 'battery-care' },
        // 2026-08-12 롱테일 ★ 1건(docs/newsjeoul-hub-longtail-candidates.md)
        { title: 'PC·노트북에 연결하고 마이크까지 쓰는 법', slug: 'pc-connect-mic' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        // 2026-08-12 롱테일 ★ 1건
        {
          title: '세탁기에 돌렸을 때 살릴 수 있나',
          slug: 'washed-in-laundry',
          intent: '물에 잠긴 직후의 대처 순서를 다룬다 — 전원을 켜지 말 것, 말리는 방법과 하면 안 되는 '
            + '건조법, 방수 등급이 세탁을 견딘다는 뜻이 아닌 이유, 살아난 뒤에도 남는 문제, 수리·교체 '
            + '문의 경로. 근거 없는 민간요법을 권하지 마라.',
        },
        { title: '한쪽만 소리가 안 날 때 확인 순서', slug: 'one-side-silent' },
        { title: '자동 연결이 자꾸 끊길 때', slug: 'connection-drops' },
        { title: '케이스에서 충전이 안 될 때', slug: 'case-not-charging' },
        { title: '통화 음질이 나쁘다는 말을 들었다면', slug: 'call-quality' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '버즈4와 버즈4 프로, 무엇이 다른가', slug: 'buds4-vs-buds4-pro' },
        { title: '버즈4 vs 버즈3, 넘어갈 만한가', slug: 'buds4-vs-buds3' },
        { title: '무선이어폰 ANC 성능 비교표', slug: 'anc-comparison-table', badge: '표' },
        { title: '아이폰과 함께 쓸 때의 제약', slug: 'with-iphone' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        // 2026-08-12 롱테일 ★ 1건
        {
          title: '한쪽을 잃어버렸을 때 한쪽만 사는 법',
          slug: 'single-bud-replacement',
          intent: '한쪽만 분실했을 때의 선택지를 다룬다 — 제조사 단품 구매가 가능한지, 값이 얼마쯤 하는지, '
            + '기존 케이스·반대쪽과 페어링이 되는지, 중고 단품을 살 때의 위험. 가격과 정책은 바뀌므로 '
            + '단정하지 말고 서비스센터 확인을 안내해라.',
        },
        { title: '일반형과 프로, 어느 쪽이 맞나', slug: 'standard-or-pro' },
        { title: '귀 모양에 맞는 이어팁 고르는 법', slug: 'eartip-fit' },
        { title: '보증과 배터리 교체 조건 확인하기', slug: 'warranty-and-battery' },
        { title: '케이스·이어팁 실제로 쓸 만한 것만', slug: 'case-and-eartip-picks' },
      ],
    },
  },

  specsTitle: '스펙',
  specs: [
    { label: '모델 구분', value: '일반형 SM-R540 / 프로 SM-R640' },
    { label: '착용 구조', value: '일반형 오픈형 / 프로 커널형' },
    { label: '조작', value: '메탈 블레이드 핀치 컨트롤' },
    { label: '크래들', value: '반투명 커버 디자인' },
    { label: '공개', value: '2026년 2월 25일 (갤럭시 언팩 2026)' },
  ],

  faq: [
    {
      q: '3세대 ANC는 전작과 뭐가 다른가요?',
      a: '삼성은 적응형 ANC를 안내합니다. 세부 기능은 일반형·프로와 연결 기기에 따라 구분해야 하며, 이 페이지는 차단 성능을 직접 측정한 결과가 아닙니다.',
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
      a: '이어팁 선택은 커널형인 프로에 해당합니다. 일반형은 오픈형입니다. 프로는 기본 팁부터 맞춰 보고, 교체품은 정확한 지원 모델을 확인하세요.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '당시 참고가 25만원대' },
    { date: '2026-02-25', text: '갤럭시 언팩 2026에서 버즈4 시리즈 공개' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'buds4-body', label: '갤럭시 버즈4', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9309807813&itemId=27585107825&vendorItemId=94548723294&traceid=V0-153-2e7cd668ebe88b03&requestid=20260810170229466062620058&token=31850C%7CGM' },
      { slot: 'buds4-case', label: '버즈4 케이스', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8141214014&itemId=27614948320&vendorItemId=94578018115&traceid=V0-153-9e19acc9681f1976&clickBeacon=429f3da0-b605-11f1-b575-0aa8ab57c21c%7E3&requestid=20260922064153293108693221&token=31850C%7CMIXED&pt=1&slot=1' },
      { slot: 'buds4-tips', label: '버즈4 이어팁', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9409824061&itemId=27958528997&vendorItemId=91427461138&traceid=V0-153-430ea1b89d1e19d7&requestid=20261008073919736239981207&token=31850C%7CGM&pt=0&slot=2' },
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
    price: 220150,
    currency: 'KRW',
  },
}
