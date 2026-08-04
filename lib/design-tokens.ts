// 뉴스저울 디자인 토큰 — v6(라이트 종이 톤, 2026-08-05) 기준
// 토큰 변경 시 app/globals.css의 :root 값도 함께 수정할 것.
//
// v5는 다크(Ink Black) 전용이었고 보조색이 밝은 파스텔(#7C8CFF 등)이었다. 배경이 종이 톤으로
// 바뀌면서 그 파스텔들은 흰 배경에서 대비가 부족해 텍스트로 쓸 수 없다. 색상 이름과 역할은
// 유지하고 값만 어둡게 조정했다 — 이름을 바꾸면 참조하는 전 화면을 동시에 고쳐야 한다.
export const colors = {
  ink: '#14171C',     // Ink — 본문 텍스트(v5에선 배경이었다)
  paper: '#FBFAF7',   // Paper — 배경
  red: '#C8102E',     // News Red — 액센트
  link: '#1B4BA0',    // Link Blue — 본문 링크
  blue: '#3F5BD9',    // 보조
  stone: '#7B7568',   // 설명/캡션
  violet: '#7A4FD6',  // 연결
  teal: '#2E8B7F',    // 상승 ▲
  rose: '#C8102E',    // 하락 ▼
  /** @deprecated v5 잔재. 새 코드에서 쓰지 말 것 — red/paper/ink를 쓴다. */
  bone: '#FBFAF7',
  /** @deprecated v5 Weight Amber. 데이터 시각화용 어두운 금색으로만 남긴다. */
  amber: '#A8791F',
} as const

// 도메인(카테고리)별 지정색 — 디자인 시스템 가이드 "도메인 컬러·아이콘" 표
// v6: 밝은 배경에서 텍스트로도 읽히도록 명도를 낮췄다.
// 홈 hero 카드는 이 색을 아주 옅은 틴트(14% 알파)로 쓰므로 어두워도 카드가 탁해지지 않는다.
export const domainColors: Record<string, string> = {
  AI: '#A8791F', 자동차: '#3F5BD9', 테크: '#2E8B7F', 명품: '#B4603F',
  반도체: '#3F5BD9', 금융: '#A8791F', 건강: '#2E8B7F', 스포츠: '#C8102E',
  영화: '#7A4FD6', 국제: '#3F5BD9',
  // 실제 데이터의 영문 카테고리 — 이 값들이 없어서 홈 카드가 전부 중립 스톤으로 폴백되고 있었다.
  Technology: '#2E8B7F', Economy: '#A8791F', Society: '#3F5B8B', Science: '#2E8B7F',
  Business: '#B4603F', Health: '#2E8B7F', Entertainment: '#7A4FD6', Automobile: '#3F5BD9',
  Lifestyle: '#7A4FD6', Crypto: '#A8791F',
}

export const domainIcons: Record<string, string> = {
  AI: '🤖', 자동차: '🚗', 테크: '📱', 명품: '👜',
  반도체: '💾', 금융: '💰', 건강: '🩺', 스포츠: '⚾',
  영화: '🎬', 국제: '🌐',
}

// 배지 색상 — 디자인 시스템 가이드 "배지·태그" 표 (badgeColors.falling은 팔레트의
// Falling Rose #E0777A와 별개로, 가이드에 명시된 하락 배지 전용 값 #E0996B을 그대로 사용)
export const badgeColors = {
  rising: '#2E8B7F',     // ▲ 가장 무거워진 이야기
  falling: '#B4603F',    // ▼ 가장 가벼워진 이야기
  surging: '#C8102E',    // ↗ 급확산
  popular: '#C8102E',    // 🔥 인기
  new: '#3F5BD9',        // ⚡ NEW
  connection: '#7A4FD6', // 🧩 의외의 연결
} as const

// 타이포그래피 스케일 — 디자인 시스템 가이드 "타이포그래피 스케일" 표
export const typeScale = {
  display: {
    fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
    fontSize: 'clamp(30px, 4.6vw, 58px)', fontWeight: 400,
    lineHeight: 1.18, letterSpacing: '-0.02em',
  },
  h1: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: 'clamp(30px, 4.6vw, 58px)', fontWeight: 800,
    lineHeight: 1.18, letterSpacing: '-0.02em',
  },
  h2: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: 'clamp(21px, 1.7vw, 27px)', fontWeight: 800,
    lineHeight: 1.35, letterSpacing: '-0.01em',
  },
  h3: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: '16.5px', fontWeight: 800,
    lineHeight: 1.42, letterSpacing: '-0.01em',
  },
  h3Drawer: {
    fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
    fontSize: 'clamp(21px, 3vw, 28px)', fontWeight: 400,
    lineHeight: 1.4, letterSpacing: '-0.01em',
  },
  body: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: '14.5px', fontWeight: 500,
    lineHeight: 1.75, letterSpacing: 'normal',
  },
  caption: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: '11px', fontWeight: 700,
    lineHeight: 1.4, letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  micro: {
    fontFamily: "'Pretendard', -apple-system, sans-serif",
    fontSize: '11px', fontWeight: 600,
    lineHeight: 1.4, letterSpacing: 'normal',
  },
} as const

// 반응형 브레이크포인트 — 디자인 시스템 가이드 "반응형 기준표"
export const breakpoints = {
  desktop: 1025, // 1025px 이상, 6컬럼, 드로어 우측 슬라이드 520px 고정
  tablet: 761,   // 761–1024px, 4컬럼, 드로어 우측 슬라이드 440px
  // 760px 이하는 mobile: 1컬럼, 드로어는 하단 바텀시트(88vh, 상단 라운드 22px)
} as const

// Hover/Motion 타이밍 — "0.2s=반응, 0.3s=등장, 1s+=상태변화" 원칙
export const motion = {
  microHover: { duration: '0.2s', easing: 'ease' },       // 버튼/아이콘/배지
  cardHover: { duration: '0.26s', easing: 'ease' },        // 그리드 카드 hover (0.25–0.28s)
  enter: { duration: '0.32s', easing: 'cubic-bezier(.16,1,.3,1)' },       // 콘텐츠 진입/리빌
  slidePanel: { duration: '0.32s', easing: 'cubic-bezier(.16,1,.3,1)' },  // 드로어 슬라이드/바텀시트
  beamTilt: { duration: '1.4s', easing: 'cubic-bezier(.22,1,.36,1)' },    // 저울대 기울기 (상태 변화 시에만)
  ambient: { duration: '5s-18s', easing: 'ease-in-out infinite' },       // 배경 드리프트/브리딩 — 화면당 1개만
} as const
