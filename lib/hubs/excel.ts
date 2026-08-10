import type { HubConfig } from './types'

// 파일럿 허브 5호 — 엑셀 (설계서 §11 실행순서 3번의 마지막)
//
// 설계서 §9.2-F: "에버그린 순도가 가장 높다. 한 번 쓰면 2~3년 살아남는다.
//   에디터 진입장벽도 가장 낮다." 그래서 이 허브는 뉴스가 거의 없고 가이드가 본체다.
//
// 제휴: §9.2-F가 "제휴 거의 없음"으로 분류한다. 구독 상품 제휴가 이론상 가능하지만
//   검증된 링크가 없고, 사용법 문서에 구매 유도를 섞으면 문서의 목적이 흐려진다.
//   그래서 링크 없음으로 두되, 이는 §8.3의 금지 카테고리(신차·정책)와 달리 편집 판단이다 —
//   나중에 뒤집으려면 affiliate를 allowed:true로 바꾸면 된다.
//
// 뉴스 오탐 처리: '엑셀'은 짧아서 부분매칭 오탐이 난다. 실측으로
//   "메가존클라우드, 큐비스택과 손잡고 양자 시뮬레이터 '큐엑셀' 판매"가 잡혔다.
//   newsExclude로 걸러낸다 — 엑셀 사용법 허브에 양자 시뮬레이터 기사가 보이면 안 된다.

export const excel: HubConfig = {
  slug: 'excel',
  kind: 'program',
  title: '엑셀',
  breadcrumb: ['프로그램·서비스', '오피스'],
  category: '오피스',
  trackingNote: '추적 중인 프로그램 · 버전이 바뀌면 갱신됩니다',
  definition:
    '엑셀에서 실제로 막히는 것만 모았습니다. 함수·단축키 사용법부터 오류 코드별 해결, 대체 툴 비교와 요금제 선택까지 한 페이지에서 찾을 수 있습니다.',

  stats: [
    { label: '기준 버전', value: 'Microsoft 365', note: '데스크톱 · 웹' },
    { label: '가이드', value: '16편', note: '계속 추가' },
    { label: '오류 해결', value: '4편', note: '코드별 대처' },
    { label: '갱신 주기', value: '분기', note: '버전 배포 시 즉시', emphasis: true },
  ],

  createdAt: '2026-08-05',
  updatedAtFallback: '2026-08-05',
  updateCountFallback: 0,

  // 'Excel'은 영문 제품명·사명에 흔히 섞이므로 넣지 않는다. 한글 '엑셀'만 쓰고 오탐은 아래에서 제외.
  newsKeywords: ['엑셀'],
  // 실측 오탐: '큐엑셀'(양자 시뮬레이터 제품명). 부분매칭으로 잡히므로 제목에 있으면 버린다.
  newsExclude: ['큐엑셀', '엑셀러', '엑셀레이', '액셀'],

  // 프로그램은 가격·수치 추이가 의미 없다. verdict로 판단만 남긴다.
  verdict:
    '버전에 따라 되는 기능이 갈리는 것이 엑셀 문서의 가장 큰 함정입니다. 이 허브의 가이드는 모두 Microsoft 365 데스크톱 기준으로 확인하고, 구버전에서 안 되는 항목은 문서 안에 따로 표시합니다.',

  evergreen: {
    // §3.3의 "프로그램" 열을 그대로 따른다.
    howto: {
      label: '단축키·기능',
      items: [
        { title: 'VLOOKUP 대신 XLOOKUP 쓰는 법' },
        { title: '피벗테이블 처음부터 끝까지' },
        { title: '조건부 서식으로 중복·이상값 찾기' },
        { title: '자주 쓰는 단축키 40개 정리', badge: '표' },
      ],
    },
    troubleshoot: {
      label: '오류 코드별 해결',
      items: [
        { title: '#REF! 가 뜨는 원인과 되살리는 법' },
        { title: '#VALUE! — 숫자로 안 읽히는 셀 고치기' },
        { title: '순환 참조 경고가 사라지지 않을 때' },
        { title: '파일이 열리지 않거나 복구 모드로 뜰 때' },
      ],
    },
    compare: {
      label: '대체 툴 비교',
      items: [
        { title: '엑셀 vs 구글 시트, 무엇이 갈리나', badge: '표' },
        { title: '엑셀 웹 버전에서 안 되는 기능 목록' },
        { title: '대용량 데이터, 엑셀의 한계는 어디인가' },
        { title: '무료 대체 툴로 어디까지 되나' },
      ],
    },
    buying: {
      label: '요금제 선택',
      items: [
        { title: 'Microsoft 365 요금제별 차이', badge: '표' },
        { title: '영구 라이선스와 구독, 총액 비교', badge: '계산' },
        { title: '가정용·기업용 선택 기준' },
        { title: '학생·교직원 무료 사용 조건' },
      ],
    },
  },

  specsTitle: '기준 환경',
  specs: [
    { label: '기준 버전', value: 'Microsoft 365 (데스크톱)' },
    { label: '확인 환경', value: 'Windows 11 · macOS' },
    { label: '웹 버전', value: '기능 제한 있음(문서별 표기)' },
    { label: '구버전', value: '2019 / 2021 차이 문서 내 표기' },
    { label: '파일 형식', value: 'xlsx · xlsm · csv' },
    { label: '갱신 기준', value: '기능 변경 배포 시 즉시' },
  ],

  faq: [
    {
      q: 'XLOOKUP이 제 엑셀에는 없는데요?',
      a: 'XLOOKUP은 Microsoft 365와 2021 이상에서만 제공됩니다. 2019 이하에서는 VLOOKUP이나 INDEX·MATCH 조합을 써야 합니다. 각 가이드에 구버전 대안을 함께 적었습니다.',
    },
    {
      q: '#REF! 오류는 왜 생기나요?',
      a: '참조하던 셀이나 시트가 삭제되면 발생합니다. 실행 취소로 되돌릴 수 있는 단계라면 그게 가장 빠르고, 이미 저장했다면 참조를 다시 지정해야 합니다.',
    },
    {
      q: '엑셀과 구글 시트, 어느 쪽을 써야 하나요?',
      a: '혼자 대용량을 다루면 엑셀, 여러 명이 동시에 편집하면 구글 시트가 유리했습니다. 함수 호환은 대체로 되지만 배열 수식과 매크로에서 갈립니다.',
    },
    {
      q: '이 페이지에 구매 링크는 왜 없나요?',
      a: '사용법 문서에 구매 유도를 섞으면 문서의 목적이 흐려집니다. 요금제는 공식 채널에서 직접 확인하는 편이 정확합니다.',
    },
  ],

  timelineTitle: '이 프로그램이 바뀌어온 일',
  timeline: [
    { date: '2026-08-05', text: '허브 개설 — Microsoft 365 데스크톱 기준으로 가이드 정리 시작' },
  ],

  // §8.3의 금지 카테고리는 아니지만(§9.2-F "제휴 거의 없음"), 사용법 문서에 구매 유도를
  // 섞지 않는다는 편집 판단으로 링크 없음으로 둔다. 뒤집으려면 allowed:true로 바꾸면 된다.
  affiliate: {
    allowed: false,
    reason:
      '사용법 문서에는 제휴 링크를 넣지 않습니다. 구독 요금제는 공식 채널에서 직접 확인하는 편이 정확합니다.',
  },

  editor: {
    name: '한도윤',
    beat: '오피스·생산성 도구',
    years: '5년차',
    statement:
      '모든 가이드를 Microsoft 365 데스크톱에서 직접 실행해 확인합니다. 버전에 따라 안 되는 기능은 문서 안에 그대로 적습니다.',
    hubCount: 7,
    articleCount: 164,
  },

  // 2026-08-10: 노트북 허브 2종을 추가해 크로스링크를 양방향으로 만들었다.
  // 엑셀을 찾아온 사람의 다음 질문이 "어떤 기기에서 돌릴까"인 경우가 있고,
  // 반대로 노트북 허브에서도 "이걸로 무슨 작업을 하나"로 이어진다.
  related: [
    { title: '갤럭시북5 프로', slug: 'galaxy-book5-pro' },
    { title: 'LG 그램 2026', slug: 'lg-gram-2026' },
    { title: '구글 시트', slug: 'google-sheets' },
    { title: '파워포인트', slug: 'powerpoint' },
    { title: '홈택스', slug: 'hometax' },
  ],

  tags: ['엑셀함수', 'XLOOKUP', '피벗테이블', '엑셀오류', '엑셀단축키'],

  schema: {
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Windows, macOS, Web',
  },
}
