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
  trackingNote: '제품 선택 가이드 · 과거 가격과 현재 판매 조건은 다를 수 있습니다',
  definition:
    '2025년에 출시된 iPhone 17 Pro의 카메라·충전·용량 선택을 정리합니다. 공식 사양의 4배 망원과 8배 광학 퀄리티를 구분하고, 현재 판매 조건은 구매 화면에서 확인하세요.',

  stats: [
    { label: '과거 참고가', value: '173만원', note: '쿠팡 기준 · 08.10' },
    { label: '용량', value: '256GB부터', note: '512GB·1TB 구성', emphasis: true },
    { label: '망원', value: '4배', note: '8배는 광학 퀄리티' },
    { label: '출시', value: '2025년', note: 'Apple 공식 사양 기준' },
  ],

  createdAt: '2026-08-10',
  updatedAtFallback: '2026-10-26',
  updateCountFallback: 1,

  newsKeywords: ['아이폰 17 프로', '아이폰17프로', 'iPhone 17 Pro', '아이폰 17'],
  newsExclude: ['아이폰 16', '아이폰16', '아이폰 15'],

  verdict:
    '카메라 배율만으로 교체를 결정하지 말고 기존 기기의 불편과 저장 공간·충전 환경을 먼저 비교하세요. 직접 사용한 성능 평가는 아닙니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        // 2026-08-12 롱테일 ★ 1건(docs/newsjeoul-hub-longtail-candidates.md).
        // 한국 사용자 특유의 물음이라 영어권 문서가 답하지 못한다 — 경쟁이 가장 얕은 자리다.
        {
          title: '안드로이드에서 메신저 대화 옮기기',
          slug: 'messenger-transfer',
          intent: '국내에서 쓰는 메신저 대화 이력을 안드로이드에서 아이폰으로 옮기는 문제만 다룬다. '
            + '앱마다 공식 지원 여부가 다르고 일부는 옮길 수 없다는 점을 분명히 하고, 백업 파일 위치와 '
            + '복원 절차를 확인처와 함께 안내해라. 사진·연락처 등 일반 데이터 이전은 다른 문서 소관이다.',
        },
        { title: '8배 줌을 실제로 쓸 만하게 찍는 법' },
        { title: '안드로이드에서 데이터 옮기는 순서' },
        { title: '배터리 하루 버티게 만드는 설정' },
        { title: '처음 켜고 해두면 편한 설정 8가지' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        // 2026-08-12 롱테일 ★ 2건. 둘 다 "되는가/안 되는가"가 핵심 물음이므로,
        // 확인되지 않은 기능을 된다고 단정하지 않도록 intent에 못 박았다.
        {
          title: '통화 녹음, 한국에서 되는 것과 안 되는 것',
          slug: 'call-recording-korea',
          intent: '국내에서 아이폰 통화 녹음이 어디까지 되는지를 다룬다. 기능 제공 여부는 iOS 버전과 '
            + '국가에 따라 달라지므로 단정하지 말고 "설정에서 어떻게 확인하는가"를 알려줘라. '
            + '되지 않는 경우의 대안(별도 기기·스피커폰 녹음 등)과 법적 유의점도 짧게 짚어라.',
        },
        {
          title: '교통카드(티머니·캐시비)를 애플페이로 쓸 수 있나',
          slug: 'transit-card-korea',
          intent: '국내 대중교통 결제가 아이폰에서 어디까지 되는지를 다룬다. 지원 카드사·교통카드 종류가 '
            + '수시로 바뀌므로 특정 시점의 가능 여부를 단정하지 말고 확인하는 방법과 현재 알려진 제약, '
            + '실물 카드·모바일 앱 같은 대안을 정리해라.',
        },
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
    { label: '저장 용량', value: '256GB / 512GB / 1TB' },
    { label: '후면 카메라', value: '48MP Fusion ×3 (메인·초광각·망원)' },
    { label: '망원', value: '48MP 4배 / 12MP 광학 퀄리티 8배' },
    { label: '전면 카메라', value: '18MP Center Stage' },
    { label: '무게', value: '204g' },
    { label: 'USB', value: 'USB 3 지원, 별도 규격 케이블 필요' },
  ],

  faq: [
    {
      q: '전작에서 넘어갈 만한가요?',
      a: '현재 기기의 어떤 기능이 부족한지부터 정하세요. 카메라·저장 공간·배터리 상태를 나누어 보고 수리와 교체의 총비용을 비교하는 편이 좋습니다.',
    },
    {
      q: '8배 광학 퀄리티는 무엇인가요?',
      a: 'Apple은 4배 망원과 8배 광학 퀄리티를 구분합니다. 별도 8배 광학 렌즈가 있다는 뜻으로 읽지 마세요. 촬영 환경과 원하는 구도로 선택하세요.',
    },
    {
      q: '안드로이드에서 넘어올 때 뭐가 걸리나요?',
      a: '메시지 이력과 일부 앱 데이터가 자동으로 옮겨지지 않습니다. 순서를 지키면 대부분 해결되므로 이전 절차를 단계별로 정리했습니다.',
    },
    {
      q: '배터리 숫자만으로 교체를 결정해도 되나요?',
      a: '사용 시간은 사용 환경에 따라 다릅니다. 현재 기기의 상태와 실제로 충전이 필요한 상황을 먼저 확인하세요. 공식 한국 사양에서 확인하지 않은 mAh 수치로 구매를 권하지 않습니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-10', text: '당시 자급제 참고가 173만원대' },
  ],

  affiliate: {
    allowed: true,
    slots: [
      { slot: 'ip17p-body', label: '아이폰 17 프로 자급제', network: 'coupang', kind: 'device', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9024167576&itemId=26462330287&vendorItemId=93437609640&traceid=V0-153-81d4af092486a31f&requestid=20260810170226738013566746&token=31850C%7CGM' },
      { slot: 'ip17p-charger', label: '맥세이프 충전기', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9372023164&itemId=27816926220&vendorItemId=94776684039&traceid=V0-153-fa533c05b5571aaf&requestid=20260926060402061168657286&token=31850C%7CGM&pt=0&slot=1' },
      { slot: 'ip17p-film', label: '아이폰 17 프로 보호필름', network: 'coupang', kind: 'accessory', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9530410963&itemId=28420119573&vendorItemId=95371174692&traceid=V0-153-b91b79064532c8e0&clickBeacon=8d0809d0-c42e-11f1-ab90-13711f8b706f%7E3&requestid=20261010071243735069303770&token=31850C%7CMIXED&pt=1&slot=3' },
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
    price: 1649000,
    currency: 'KRW',
  },
}
