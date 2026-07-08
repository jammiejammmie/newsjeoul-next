// 뉴스저울 디자인 토큰 — v5(궁금증의 흐름) 확정 브랜드 키트 + 디자인 시스템 가이드 기준
// 토큰 변경 시 app/globals.css의 :root 값도 함께 수정할 것.

export const colors = {
  ink: '#0B0B0D',     // Ink Black — 배경
  bone: '#F3EFE6',    // Bone White — 본문
  amber: '#D9A441',   // Weight Amber — 액센트
  blue: '#7C8CFF',    // World Blue — 보조
  stone: '#8B887E',   // Muted Stone — 설명/캡션
  violet: '#B98CFF',  // Connection Violet — 연결
  teal: '#7CC2B8',    // Rising Teal — 상승 ▲
  rose: '#E0777A',    // Falling Rose — 하락 ▼
} as const

// 도메인(카테고리)별 지정색 — 디자인 시스템 가이드 "도메인 컬러·아이콘" 표
export const domainColors: Record<string, string> = {
  AI: '#D9A441', 자동차: '#7C8CFF', 테크: '#7CC2B8', 명품: '#E0A96D',
  반도체: '#7C8CFF', 금융: '#D9A441', 건강: '#7CC2B8', 스포츠: '#E07C7C',
  영화: '#B98CFF', 국제: '#7C8CFF',
}

export const domainIcons: Record<string, string> = {
  AI: '🤖', 자동차: '🚗', 테크: '📱', 명품: '👜',
  반도체: '💾', 금융: '💰', 건강: '🩺', 스포츠: '⚾',
  영화: '🎬', 국제: '🌐',
}

// 배지 색상 — 디자인 시스템 가이드 "배지·태그" 표 (badgeColors.falling은 팔레트의
// Falling Rose #E0777A와 별개로, 가이드에 명시된 하락 배지 전용 값 #E0996B을 그대로 사용)
export const badgeColors = {
  rising: '#7CC2B8',     // ▲ 가장 무거워진 이야기
  falling: '#E0996B',    // ▼ 가장 가벼워진 이야기
  surging: '#D9A441',    // ↗ 급확산
  popular: '#D9A441',    // 🔥 인기
  new: '#7C8CFF',        // ⚡ NEW
  connection: '#B98CFF', // 🧩 의외의 연결
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
