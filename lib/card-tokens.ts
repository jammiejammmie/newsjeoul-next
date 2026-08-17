// 카드뉴스 토큰 — 노차장 SPEC v1 §1 (확정 2026-08-17, 구현 2026-08-18)
//
// 카드뉴스는 인스타 피드·스레드 첨부에서 "활자와 단색 도형만으로" 시선을 멈추게 하는 것이
// 목표다(실제 인물 사진은 저작권 때문에 못 쓴다). 그래서 색이 적고 대비가 크다.
//
// SPEC §0의 원칙 4가지 — 바꾸지 말 것:
//   1. 그라데이션 금지. 형태가 없어 썸네일에서 회색 뭉텅이가 된다.
//   2. 한 장에 주인공 하나. 표지에 문장 3개면 0개와 같다.
//   3. 표지 헤드라인 최소 104px. 그 이하는 피드에서 안 읽힌다.
//   4. 3색 고정(ink/red/paper). 넷째 색은 연예 스킨의 형광 하나까지만.
//
// ink/paper/red는 lib/design-tokens.ts의 브랜드 값과 같다(대소문자만 다름). 카드뉴스는 그 위에
// 면 분할용 보조색(선·보조 텍스트·red 면 위 대비색)을 더 쓰기 때문에 별도 팔레트로 둔다.

export const cardColor = {
  ink: '#14171c',        // 기본 어두운 면, 본문 텍스트
  red: '#c8102e',        // 반대 논지 면, 강조 수치
  paper: '#fbfaf7',      // 밝은 면, 어두운 면 위 텍스트
  line: '#ddd8cd',       // 밝은 면 구분선
  inkLine: '#3d4148',    // 어두운 면 구분선
  muted: '#9a9385',      // 밝은 면 보조 텍스트
  mutedDark: '#7b7568',  // 어두운 면 보조 텍스트
  body: '#3d4148',       // 밝은 면 본문
  bodyDark: '#b9b3a6',   // 어두운 면 본문
  onRed: '#ffdde2',      // red 면 위 보조 텍스트
  onRedLine: '#e0546b',  // red 면 위 구분선
  flu: '#ff6b7d',        // 연예(ent) 스킨 전용 형광
} as const

// red 면 위 텍스트는 paper 또는 onRed만 쓴다. muted 계열을 red 위에 올리면 대비가 깨진다(SPEC §1.1).
export const ON_RED_ALLOWED: readonly string[] = [cardColor.paper, cardColor.onRed]

export const CANVAS = { W: 1080, H: 1350 } as const

// 스킨 — 같은 골격에 색·모양 비중만 바꾼다(SPEC §3, §6.3).
export type CardSkin = 'news' | 'ent' | 'guide'
export type CardType = 'T1' | 'T2' | 'T3' | 'T4'

export const SKIN_PAD = { news: 56, ent: 52, guide: 56 } as const

// ── 타이포 스케일 (SPEC §1.2) ──────────────────────────────────────────────
// satori는 CSS 단축 표기(font: 800 68px/1.24 …)를 못 읽는다. 개별 속성으로 풀어 쓴다.
export const type = {
  coverTitle:    { fontSize: 104, fontWeight: 800, letterSpacing: '-.05em',  lineHeight: 1.06 },
  coverTitleEnt: { fontSize: 128, fontWeight: 800, letterSpacing: '-.05em',  lineHeight: 1.02 },
  coverQuote:    { fontSize: 68,  fontWeight: 800, letterSpacing: '-.04em',  lineHeight: 1.24 },
  headline:      { fontSize: 90,  fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.18 },
  subhead:       { fontSize: 76,  fontWeight: 800, letterSpacing: '-.04em',  lineHeight: 1.2  },
  body:          { fontSize: 42,  fontWeight: 500, letterSpacing: '0',       lineHeight: 1.6  },
  kicker:        { fontSize: 30,  fontWeight: 700, letterSpacing: '.1em',    lineHeight: 1    },
  sectionLabel:  { fontSize: 34,  fontWeight: 700, letterSpacing: '.1em',    lineHeight: 1    },
  caption:       { fontSize: 32,  fontWeight: 600, letterSpacing: '0',       lineHeight: 1.35 },
  counter:       { fontSize: 28,  fontWeight: 700, letterSpacing: '0',       lineHeight: 1    },
  logo:          { fontSize: 32,  fontWeight: 800, letterSpacing: '-.02em',  lineHeight: 1    },
  logoLarge:     { fontSize: 46,  fontWeight: 800, letterSpacing: '-.02em',  lineHeight: 1    },
} as const

// ── 글자 수 → 폰트 크기 분기 (SPEC §4.6) ───────────────────────────────────
// satori에는 자동 축소가 없다. 넘치면 그냥 잘린다. 그래서 직접 계산한다.
// 한글은 코드포인트 단위로 세야 정확하다([...text] — 이모지·결합문자 방어).

/** 표지 메인 타이틀. 72 미만으로는 내리지 않는다 — 그 아래는 카피를 고칠 것(SPEC §4.6). */
export function titleSize(text: string): number {
  const n = [...(text || '')].length
  if (n <= 12) return 128
  if (n <= 18) return 104
  if (n <= 26) return 84
  return 72
}

/** 슬라이드 헤드라인(90px 기준) 3단 분기. */
export function headlineSize(text: string): number {
  const n = [...(text || '')].length
  if (n <= 14) return 90
  if (n <= 21) return 78
  return 68
}

/** 서브 헤드라인(76px 기준) 3단 분기. */
export function subheadSize(text: string): number {
  const n = [...(text || '')].length
  if (n <= 16) return 76
  if (n <= 24) return 66
  return 58
}

/** 표지 인용(68px 기준). 상·하 인용은 줄 수를 맞춰야 하므로 두 문장을 함께 보고 정한다. */
export function quoteSize(...texts: string[]): number {
  const n = Math.max(...texts.map((t) => [...(t || '')].length), 0)
  if (n <= 16) return 68
  if (n <= 22) return 58
  return 50
}

// ── 줄바꿈 (SPEC §4.7) ─────────────────────────────────────────────────────
// satori에서 <br>은 줄높이 계산이 어긋난다. 문장 배열을 flexDirection: column으로 쌓는다.
// 입력이 문자열 하나로 올 수도 있으므로(쿼리스트링) 개행/파이프로 나눠 배열로 만든다.
export function toLines(input: string | string[] | null | undefined, max = 3): string[] {
  if (!input) return []
  const arr = Array.isArray(input) ? input : String(input).split(/\n|\|/)
  return arr.map((s) => s.trim()).filter(Boolean).slice(0, max)
}

// ── 글자 수 상한 검증 (SPEC §4 + §Interactions) ────────────────────────────
// 넘치는 카피를 조용히 잘라내지 않는다. satori에 자동 축소가 없다는 것은 "넘치면 깨진다"는
// 뜻이고, 깨진 카드가 인스타에 올라가는 것보다 500이 낫다 — SPEC이 "조용히 잘린 이미지를
// 내보내지 말 것"으로 못박은 지점이다. 어떤 슬롯이 몇 자인지까지 본문에 적어 돌려준다.
//
// 상한은 카피를 고치라는 신호다. 여기서 자동으로 줄이면 편집자가 문제를 영영 모른다.
export type LimitEntry = [slot: string, value: string, max: number]

export function checkLimits(entries: LimitEntry[]): string | null {
  const bad = entries
    .filter(([, v, max]) => [...(v || '')].length > max)
    .map(([slot, v, max]) => `${slot} ${[...v].length}자(상한 ${max}자): "${v}"`)
  return bad.length ? `카피 상한 초과 — ${bad.join(' / ')}` : null
}
