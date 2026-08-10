import type { HubConfig } from './types'

// 파일럿 허브 1호 — 갤럭시 Z 폴드8 (설계서 §11 실행순서 3번의 5개 중 첫 번째)
//
// 콘텐츠 출처와 그 표기 원칙:
//  · 스펙·출시일·가격대는 노차장 시안(뉴스저울 홈.dc.html §4a)의 값을 그대로 옮겼다.
//    시안은 설계 검증용으로 만든 것이므로, 실제 발행 전에 에디터가 공식 발표 기준으로
//    검증·교체해야 한다. 아래 needsEditorVerification 주석이 붙은 필드가 그 대상이다.
//  · 최신 소식은 시안의 더미가 아니라 articles 테이블을 실시간 조회한다(newsKeywords).
//    실측 결과 이 키워드로 실제 기사 7건이 잡힌다.
//  · 제휴 슬롯은 2026-08-10에 연결됐다. targetUrl은 손으로 적지 않고
//    scripts/update-coupang-slots.js가 쿠팡 검색 API 결과로 채운다 — 검증되지 않은 추적
//    URL을 임의로 만들어 넣지 않는다는 원칙(§8.1)은 그대로다. 링크를 갱신할 때도 스크립트를
//    다시 돌린다.
//
// 에버그린 가이드 목록의 href는 아직 문서를 쓰지 않았으므로 비워뒀다. 링크 없이 제목만
// 노출된다 — 존재하지 않는 URL로 보내면 404가 쌓이고 색인 품질이 떨어진다.
// 설계서 §3.3 기준 허브 1개당 최소 8편이 목표이고, 지금은 골격(16개 제목)만 세운 상태다.

export const galaxyZFold8: HubConfig = {
  slug: 'galaxy-z-fold8',
  kind: 'product',
  title: '갤럭시 Z 폴드8',
  breadcrumb: ['신제품·가전', '모바일'],
  category: '모바일',
  trackingNote: '추적 중인 제품 · 값이 바뀌면 갱신됩니다',
  definition:
    '가격·물량·통신사 조건부터 실제 사용 설정법과 자주 나는 오류까지, 폴드8에 관해 검색되는 것을 이 한 페이지에 모았습니다. 에디터가 직접 사용하며 갱신합니다.',

  // needsEditorVerification — 아래 3개는 아직 시안 값이다. 실제 발행 전 공식 발표 기준으로
  // 검증·교체해야 한다. 첫 항목만 2026-08-10에 쿠팡 실거래가로 교체했다(제휴 슬롯에 연결된
  // 상품과 같은 값이라, 링크를 눌렀을 때 보이는 값과 페이지 표기가 어긋나지 않는다).
  stats: [
    { label: '자급제 최저가', value: '238만원', note: '쿠팡 기준 · 08.10' },
    { label: '3차 완판까지', value: '12분', note: '역대 최단', emphasis: true },
    { label: '4차 물량 오픈', value: '8월 11일', note: 'D-7', emphasis: true },
    { label: '최대 지원금', value: '27만원', note: '통신사별 상이' },
  ],

  createdAt: '2026-07-18',
  updatedAtFallback: '2026-08-04',
  updateCountFallback: 14,

  // 실측으로 검증한 키워드 조합(articles 제목 기준 7건 매칭).
  // 'Z8'은 시리즈 통칭으로 기사에 자주 쓰이므로 함께 넣는다.
  newsKeywords: ['갤럭시 Z 폴드8', '갤럭시Z폴드8', '갤럭시 Z8', '폴드8', 'Z폴드8', '갤폴드8'],

  trend: {
    title: '가격 추이',
    label: '자급제 512GB',
    unit: '만원',
    cadence: '매일 09:00 수집 예정',
    // needsEditorVerification — 시안 값. 가격 수집 파이프라인 붙기 전까지 설정값.
    points: [
      { date: '2026-06-30', value: 254 },
      { date: '2026-07-07', value: 251 },
      { date: '2026-07-14', value: 246 },
      { date: '2026-07-21', value: 243 },
      { date: '2026-07-28', value: 241 },
      { date: '2026-08-04', value: 238 },
    ],
  },
  verdict:
    '6주간 16만원 내렸고, 4차 물량 오픈 직후 추가 인하가 있었던 전작 패턴을 감안하면 8월 11일 이후를 기다리는 편이 유리합니다.',

  evergreen: {
    howto: {
      label: '사용법·설정',
      items: [
        { title: '폴드8 멀티윈도우 3분할 설정하는 법', updatedAt: '2026-08-02' },
        { title: 'S펜 없이 필기 앱 쓰는 최적 조합', updatedAt: '2026-07-29' },
        { title: '배터리 하루 버티게 만드는 설정 7가지', updatedAt: '2026-07-26' },
        { title: '전작에서 데이터 통째로 옮기는 순서' },
      ],
    },
    troubleshoot: {
      label: '오류 해결',
      items: [
        { title: '화면 중앙 주름에 터치가 안 될 때', updatedAt: '2026-08-03' },
        { title: '무선 충전이 갑자기 끊기는 3가지 원인' },
        { title: '앱이 접힌 화면에서 강제 종료될 때' },
        { title: 'A/S 접수 전에 확인할 자가진단 순서' },
      ],
    },
    compare: {
      label: '비교',
      items: [
        { title: '폴드8 vs 폴드7, 더 낼 가치가 있나', updatedAt: '2026-08-01' },
        { title: '폴더블 3사 스펙 비교표', badge: '표' },
        { title: '통신사 3사 실구매가 계산기', badge: '계산' },
        { title: '중고 시세와 보상판매, 뭐가 이득인가' },
      ],
    },
    buying: {
      label: '구매 가이드',
      items: [
        { title: '4차 물량 오픈, 실패 안 하는 준비 순서' },
        { title: '지원금 vs 선택약정, 24개월 총액 비교' },
        { title: '케이스·필름 실제로 쓸 만한 것만' },
        { title: '개통 첫날 해두면 편한 8가지' },
      ],
    },
  },

  specsTitle: '스펙',
  // needsEditorVerification — 시안 값. 공식 발표 기준으로 검증 필요.
  specs: [
    { label: '디스플레이', value: '내부 8.0" / 외부 6.5"' },
    { label: '무게', value: '229g' },
    { label: '칩셋', value: '스냅드래곤 8 Elite 2' },
    { label: '배터리', value: '4,600mAh · 45W' },
    { label: '카메라', value: '200MP + 12MP + 10MP' },
    { label: '방수·방진', value: 'IP48' },
    { label: '저장용량', value: '256GB / 512GB / 1TB' },
    { label: '출시일', value: '2026년 7월 18일' },
  ],

  faq: [
    {
      q: '4차 물량은 언제, 어디서 열리나요?',
      a: '8월 11일 오전 10시, 제조사 공식몰과 통신사 온라인몰에서 동시에 열립니다. 3차 때는 공식몰 물량이 4분 만에 소진됐고 통신사몰이 12분까지 버텄습니다.',
    },
    {
      q: '자급제와 통신사 개통, 어느 쪽이 싸나요?',
      a: '24개월 총액으로 보면 요금제에 따라 갈립니다. 8만원대 이상 요금제면 지원금, 그 아래면 자급제와 선택약정이 유리했습니다.',
    },
    {
      q: '지금 사야 하나요, 기다려야 하나요?',
      a: '6주간 16만원 내렸습니다. 급하지 않다면 4차 오픈 직후 가격을 확인하는 편을 권합니다.',
    },
    {
      q: '화면 주름은 실제로 신경 쓰이나요?',
      a: '3주 사용 기준, 영상 시청에서는 거의 인식되지 않고 필기할 때 걸리는 느낌이 남습니다. 터치 불량은 별개 문제로 해결법을 따로 정리했습니다.',
    },
  ],

  timelineTitle: '이 제품이 지나온 일',
  timeline: [
    { date: '2026-08-04', text: '3차 물량 12분 만에 소진, 4차 일정 8월 11일로 공지' },
    { date: '2026-08-02', text: 'One UI 8.5 배포 시작 — 멀티윈도우 동작 변경' },
    { date: '2026-07-29', text: '힌지 내구성 논란에 제조사 공식 답변' },
    { date: '2026-07-24', text: '2차 물량 오픈, 온라인 최저가 246만원까지 하락' },
    { date: '2026-07-18', text: '국내 정식 출시 · 출고가 254만원' },
    { date: '2026-07-09', text: '글로벌 언팩 공개, 국내 인증 통과' },
  ],

  // 가전·모바일은 종합몰 제휴 허용 카테고리(§8.3).
  // 2026-08-10 슬롯 재정의. 이전에는 4개 슬롯이 전부 targetUrl 없이 비어 있었고
  // (/go/fold8-*이 전부 404 안내를 반환하고 있었다), 그중 'fold8-spen'은 채울 수가 없었다 —
  // 쿠팡에 폴드8 전용 S펜이 없다(실측: 검색 결과가 전부 폴드3~7 호환품이다). 없는 상품을
  // "폴드8 전용"이라는 라벨로 걸면 독자를 속이는 셈이라, 실재하는 보호필름으로 바꿨다.
  // 나머지 신규 허브와 같은 레이어 구성이 된다: 본체 / 주변기기 / 소모품·보호.
  // targetUrl은 scripts/update-coupang-slots.js가 채운다(수동 입력 금지).
  affiliate: {
    allowed: true,
    slots: [
      { slot: 'fold8-body', label: '갤럭시 Z 폴드8 자급제', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9640170508&itemId=28803754031&vendorItemId=95739034503&traceid=V0-153-cc91bad335e9984e&requestid=20260810170212442322761167&token=31850C%7CGM' },
      { slot: 'fold8-case', label: '폴드8 힌지보호 케이스', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9637191727&itemId=28792525304&vendorItemId=95728144186&traceid=V0-153-e66bf11605b886d5&requestid=20260810170213142083229828&token=31850C%7CGM' },
      { slot: 'fold8-charger', label: '45W 고속 충전기', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9285126975&itemId=27494113843&vendorItemId=94459222401&traceid=V0-153-0164a948cdea8e28&requestid=20260810170214602247159694&token=31850C%7CGM' },
      { slot: 'fold8-film', label: '폴드8 보호필름', network: 'coupang', targetUrl: 'https://link.coupang.com/re/AFFSDP?lptag=AF3904190&pageKey=9681559984&itemId=28950791631&vendorItemId=95881401776&traceid=V0-153-faae20ff97365d43&requestid=20260810170215166009569110&token=31850C%7CGM' },
    ],
  },

  editor: {
    name: '노정민',
    beat: '모바일·가전',
    years: '8년차',
    statement:
      '폴드8을 개통 첫날부터 메인 기기로 사용 중입니다. 바뀐 게 있으면 이 페이지를 먼저 고칩니다.',
    hubCount: 12,
    articleCount: 486,
  },

  // 2026-08-10: 플립8·S25 울트라·아이폰 17 프로·버즈4 허브가 실제로 생겨 링크가 살아났다.
  // 아직 없는 허브(워치8·One UI·요금제)는 그대로 둔다 — 화면에서 '준비 중'으로 표시되고
  // 링크는 걸리지 않으므로 404가 생기지 않는다.
  related: [
    { title: '갤럭시 Z 플립8', slug: 'galaxy-z-flip8' },
    { title: '갤럭시 S25 울트라', slug: 'galaxy-s25-ultra' },
    { title: '아이폰 17 프로', slug: 'iphone-17-pro' },
    { title: '갤럭시 버즈4', slug: 'galaxy-buds4' },
    { title: '갤럭시 워치8', slug: 'galaxy-watch8', guideCount: 9 },
    { title: '통신사 요금제', slug: 'mobile-plans', guideCount: 26 },
  ],

  tags: ['폴드8가격', '폴드8사용법', '폴드8오류', '폴더블비교', '자급제', '지원금'],

  schema: {
    brand: 'Samsung',
    price: 2379200,
    currency: 'KRW',
    releaseDate: '2026-07-18',
  },
}
