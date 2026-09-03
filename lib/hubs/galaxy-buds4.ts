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
      { slot: 'buds4-case', label: '버즈4 케이스', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=8141214014&itemId=27614948323&vendorItemId=95769028087&traceid=V0-153-9e19acc9681f1976&clickBeacon=0f71d080-9749-11f1-be88-d189b0db0fd2%7E3&requestid=20260814035907177150758235&token=31850C%7CMIXED' },
      { slot: 'buds4-tips', label: '버즈4 이어팁', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9458911792&itemId=28144558930&vendorItemId=95100006696&traceid=V0-153-448a9a2719fe80a1&clickBeacon=f291f380-a7d5-11f1-b683-c5f19009e0a2%7E3&requestid=20260904052756420079649292&token=31850C%7CMIXED&pt=1&slot=2' },
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
    price: 233100,
    currency: 'KRW',
  },
}
