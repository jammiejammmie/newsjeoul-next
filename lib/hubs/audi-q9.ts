import type { HubConfig } from './types'

// 파일럿 허브 2호 — 아우디 Q9 (설계서 §11 실행순서 3번)
//
// ★ 제휴 링크 금지 카테고리다(§8.3 "신차 — 없음 · 링크 금지").
//   신차는 온라인 판매 채널이 자체가 없어 제휴가 성립하지 않고, 억지로 붙이면 신뢰만 깎인다.
//   설계서 §13이 이 항목을 "링크 금지로 못 박음"으로 기록했다. 타입이 이를 강제한다
//   (affiliate.allowed:false면 슬롯을 넣을 수 없다).
//
// 데이터: articles에 실제 Q9 기사 2건 존재(2026-07-29 공개 보도). 뉴스 섹션이 실데이터로 채워진다.
//
// needsEditorVerification — 스펙·가격은 공개 사양 기준의 잠정값이다. 국내 인증·가격 공시 전
// 단계이므로 발행 전 에디터가 공식 자료로 검증·교체해야 한다.

export const audiQ9: HubConfig = {
  slug: 'audi-q9',
  kind: 'car',
  title: '아우디 Q9',
  breadcrumb: ['자동차·모빌리티', '신차'],
  category: '신차',
  trackingNote: '추적 중인 신차 · 출시 일정과 가격이 확정되면 갱신됩니다',
  definition:
    '아우디 최초의 풀사이즈 플래그십 SUV Q9의 공개 사양, 경쟁 모델 비교, 국내 출시 일정과 예상 가격을 한 페이지에 모았습니다. 공식 발표가 나오는 대로 이 페이지를 먼저 고칩니다.',

  stats: [
    { label: '국내 출시', value: '미정', note: '인증 절차 진행 중', emphasis: true },
    { label: '예상 가격대', value: '1.4억~', note: '해외 사양 환산 추정' },
    { label: '경쟁 모델', value: 'X7 · GLS', note: '동급 풀사이즈 SUV' },
    { label: '파워트레인', value: 'V6 · PHEV', note: '시장별 상이' },
  ],

  createdAt: '2026-07-29',
  updatedAtFallback: '2026-08-05',
  updateCountFallback: 2,

  newsKeywords: ['아우디 Q9', '아우디Q9', 'Audi Q9'],

  // 신차는 가격이 공시되지 않아 추이가 없다. 대신 verdict로 판단을 남긴다.
  verdict:
    '해외 공개 사양만 나온 단계로, 국내 가격·트림이 확정되기 전까지는 경쟁 모델과의 실구매 비교가 성립하지 않습니다. 지금 계약을 서두를 이유는 없습니다.',

  evergreen: {
    // 신차는 §3.3의 "제품" 열을 따르되, 구매 가이드가 시승·계약 절차로 바뀐다.
    howto: {
      label: '기능·옵션',
      items: [
        { title: 'Q9 트림별 기본·선택 옵션 정리' },
        { title: '2열 캡틴시트와 3열 거주성 실측' },
        { title: '에어 서스펜션 모드별 승차감 차이' },
        { title: '실내 디스플레이·소프트웨어 구성' },
      ],
    },
    troubleshoot: {
      label: '점검·유지비',
      items: [
        { title: '수입 풀사이즈 SUV 유지비 실계산' },
        { title: '보증 조건과 소모품 교체 주기' },
        { title: '국내 서비스망과 부품 수급 현황' },
        { title: 'PHEV 배터리 보증과 충전 환경' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: 'Q9 vs BMW X7, 무엇이 갈리나', badge: '표' },
        { title: 'Q9 vs 벤츠 GLS 실내 공간 비교', badge: '표' },
        { title: 'Q8과 Q9, 체급 차이가 값을 정당화하나' },
        { title: '동급 PHEV 실연비·전기 주행거리 비교' },
      ],
    },
    buying: {
      label: '구매 준비',
      items: [
        { title: '출시 전 사전계약, 지금 넣어야 하나' },
        { title: '수입차 취득·등록 비용 계산', badge: '계산' },
        { title: '시승 신청부터 인도까지 절차' },
        { title: '리스·렌트와 일시불 총액 비교' },
      ],
    },
  },

  specsTitle: '공개 사양',
  // needsEditorVerification — 해외 공개 자료 기준 잠정값.
  specs: [
    { label: '차급', value: '풀사이즈 SUV' },
    { label: '전장', value: '약 5,150mm' },
    { label: '시트', value: '6인승 / 7인승' },
    { label: '파워트레인', value: 'V6 가솔린 · PHEV' },
    { label: '구동', value: 'quattro 상시 4륜' },
    { label: '서스펜션', value: '어댑티브 에어' },
    { label: '경쟁 모델', value: 'BMW X7 · 벤츠 GLS' },
    { label: '국내 출시', value: '미정 (인증 진행)' },
  ],

  faq: [
    {
      q: '국내에는 언제 나오나요?',
      a: '아직 공식 일정이 공개되지 않았습니다. 인증 절차가 확인되는 대로 이 페이지의 핵심 수치와 타임라인을 갱신합니다. 확정 전 유통 채널의 "출시 임박" 안내는 근거가 없는 경우가 많습니다.',
    },
    {
      q: '가격은 얼마쯤 될까요?',
      a: '해외 사양을 환산한 추정치로 1억 4천만원대부터 시작할 것으로 보이지만, 국내 트림 구성과 세제에 따라 크게 달라집니다. 확정 가격이 공시되면 이 값을 교체합니다.',
    },
    {
      q: 'Q8과 무엇이 다른가요?',
      a: 'Q8은 5인승 쿠페형 SUV이고 Q9은 3열을 갖춘 풀사이즈입니다. 실내 공간과 견인 능력이 다르고, 경쟁 상대도 X7·GLS로 한 체급 위입니다.',
    },
    {
      q: '이 페이지에 구매 링크는 왜 없나요?',
      a: '신차는 온라인 판매 채널이 없어 제휴 링크가 성립하지 않습니다. 뉴스저울은 신차와 정책·지원금 카테고리에 제휴 링크를 넣지 않습니다.',
    },
  ],

  timelineTitle: '이 차가 지나온 일',
  timeline: [
    { date: '2026-07-29', text: '아우디 최초 풀사이즈 SUV Q9 공개 — X7·GLS 경쟁 구도' },
  ],

  // 설계서 §8.3 — 신차는 링크 금지. 타입상 슬롯을 넣을 수 없다.
  affiliate: {
    allowed: false,
    reason:
      '신차는 온라인 판매 채널이 없어 제휴 링크가 성립하지 않습니다. 뉴스저울은 신차 카테고리에 제휴 링크를 넣지 않습니다.',
  },

  editor: {
    name: '노정민',
    beat: '모바일·가전',
    years: '8년차',
    statement:
      '국내 인증·가격 공시가 나오기 전까지는 추정치임을 그대로 표기합니다. 확정되면 이 페이지를 먼저 고칩니다.',
    hubCount: 12,
    articleCount: 486,
  },

  related: [
    { title: '전기차 보조금', slug: 'ev-subsidy' },
    { title: 'BMW X7', slug: 'bmw-x7' },
    { title: '벤츠 GLS', slug: 'benz-gls' },
  ],

  tags: ['아우디Q9', '풀사이즈SUV', '신차출시', 'X7비교', 'GLS비교'],

  schema: {
    brand: 'Audi',
    // 가격이 공시되지 않았으므로 price를 넣지 않는다 — 추정치를 Offer로 내보내면
    // 검색엔진에 잘못된 정보를 구조화 데이터로 선언하는 셈이 된다.
  },
}
