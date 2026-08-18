import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { colors, domainColors } from '@/lib/design-tokens'
import { cardColor, SKIN_PAD, titleSize as coverTitleSize, quoteSize, subheadSize, toLines, checkLimits } from '@/lib/card-tokens'
import type { LimitEntry, CardSkin } from '@/lib/card-tokens'

// ── 인스타그램 카드뉴스 이미지 생성 (2026-08-17, PM 지시) ───────────────────
// Instagram Graph API는 바이너리 업로드를 받지 않는다 — 반드시 "공개 URL"로 호스팅된 이미지를
// image_url로 넘겨야 한다. 그래서 카드뉴스를 파일로 만들어 어딘가 올리는 대신, 이 라우트가
// 그 공개 URL 자체가 된다: https://newsjeoul.co.kr/card?slide=cover&title=...
//
// app/og/route.tsx와 같은 next/og(satori) 기반이고 브랜드 토큰(colors/domainColors)을 그대로 쓴다.
// 다른 점은 캔버스 규격뿐이다: OG는 1200×630(가로), 카드뉴스는 1080×1350(세로 4:5).
// 4:5는 인스타 피드에서 세로 공간을 가장 크게 먹는 비율이라 카드뉴스 표준으로 쓴다.
//
// 슬라이드 3종:
//   cover — 표지(카테고리 뱃지 + 큰 제목 + 로고)
//   body  — 본문(작은 제목 + 문단, 여러 장 가능)
//   end   — 마무리(브랜드 + 유도 문구)
//
// ※ 릴스(REELS)는 동영상만 받는다. 이 라우트가 만드는 것은 이미지이므로 피드 단일 이미지 또는
//   캐러셀(최대 10장)로 올린다. 릴스로 올리려면 이미지를 MP4로 렌더하는 단계가 따로 필요하다.

export const runtime = 'edge'

const W = 1080
const H = 1350

// CDN 캐싱 금지 — 2026-08-17 실측 사고(아래 GET 말미 주석 참고). Netlify Edge가 쿼리스트링을
// 무시하고 경로만으로 캐시 키를 잡아서 서로 다른 5장이 전부 같은 이미지로 돌아왔다.
const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0',
  'Netlify-CDN-Cache-Control': 'no-store',
}

async function loadFont(allText: string, weight: 400 | 700 | 900) {
  const chars = [...new Set(allText.replace(/\s/g, ''))].join('')
  if (!chars) return null

  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(chars)}&display=swap`,
    {
      // 구형 안드로이드 UA로 요청해야 Google Fonts가 WOFF2 대신 TTF를 준다.
      // satori는 WOFF2를 못 읽는다(og/route.tsx와 동일한 이유 — 고치지 말 것).
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; U; Android 2.2; en-us; DROID2 GLOBAL Build/S273) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
      },
    }
  ).then(r => r.text())

  const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?(truetype|opentype|woff)['"]?\)/)?.[1]
  if (!url) return null
  return fetch(url).then(r => r.arrayBuffer())
}

// ── Pretendard 로더 (노차장 SPEC §1.2 / README "작업 순서" 1번) ──────────────
// 카드뉴스 개편안은 전부 Pretendard 800/700/600/500 4웨이트를 쓴다. satori는 폰트를
// ArrayBuffer로만 받고, 못 받은 웨이트는 조용히 400으로 떨어뜨린다(SPEC이 "가장 흔한 사고"로
// 지목한 실패 모드). 그래서 4개를 다 싣고, 하나라도 못 실으면 렌더를 포기한다 — 웨이트가
// 무너진 카드가 나가는 것보다 500이 낫다.
//
// 배치 결정: public/fonts/*.otf(4개, 합 6.1MB)에 두고 **자기 오리진에서 fetch**한다.
//   · 왜 번들 임포트가 아닌가 — 이 라우트는 edge 런타임이다. 6.1MB를 함수 번들에 넣으면
//     배포 크기 제한에 걸린다. public/은 정적 자산이라 번들에 안 들어간다.
//   · 왜 CDN이 아닌가 — SPEC의 "CDN 런타임 로드 금지"를 지킨다. 외부 CDN이 죽으면 카드가
//     통째로 멈추고, 폰트 파일이 말없이 바뀔 수도 있다. 자기 오리진이면 배포에 고정된다.
//   · 왜 모듈 스코프 캐시인가 — 요청마다 6.1MB를 받으면 응답이 수 초로 늘어난다(SPEC §Interactions).
//     아래 Map은 워커가 살아있는 동안 유지되고, 실패한 Promise는 지워서 다음 요청이 다시 시도한다.
type PretendardSet = { name: string; data: ArrayBuffer; weight: 800 | 700 | 600 | 500; style: 'normal' }[]
const PRETENDARD_WEIGHTS = [
  { file: 'Pretendard-ExtraBold.otf', weight: 800 as const },
  { file: 'Pretendard-Bold.otf', weight: 700 as const },
  { file: 'Pretendard-SemiBold.otf', weight: 600 as const },
  { file: 'Pretendard-Medium.otf', weight: 500 as const },
]
const pretendardCache = new Map<string, Promise<PretendardSet>>()

function loadPretendard(origin: string): Promise<PretendardSet> {
  const hit = pretendardCache.get(origin)
  if (hit) return hit

  const task = Promise.all(
    PRETENDARD_WEIGHTS.map(async ({ file, weight }) => {
      const res = await fetch(`${origin}/fonts/${file}`)
      if (!res.ok) throw new Error(`폰트 로드 실패 ${file}: HTTP ${res.status}`)
      const data = await res.arrayBuffer()
      // 404 HTML이 200으로 올 수도 있으므로 OTF 시그니처(OTTO)를 확인한다. 이걸 안 보면
      // satori가 "폰트 있음"으로 알고 전 웨이트를 400으로 렌더한다 — 조용히 망가지는 경로다.
      const sig = new Uint8Array(data.slice(0, 4))
      const isOTTO = sig[0] === 0x4f && sig[1] === 0x54 && sig[2] === 0x54 && sig[3] === 0x4f
      if (!isOTTO) throw new Error(`폰트 형식 오류 ${file}: OTF(OTTO)가 아니다`)
      return { name: 'Pretendard', data, weight, style: 'normal' as const }
    })
  )

  task.catch(() => pretendardCache.delete(origin))
  pretendardCache.set(origin, task)
  return task
}

function trunc(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`
}

// 제목 길이에 따라 글자 크기를 줄인다 — satori에는 자동 축소가 없어서 직접 계산해야
// 긴 제목이 카드 밖으로 흘러나가지 않는다.
function titleSize(text: string) {
  const n = text.length
  if (n <= 18) return 92
  if (n <= 28) return 78
  if (n <= 40) return 66
  if (n <= 55) return 56
  return 48
}

function Logo({ size = 1, tone = colors.paper }: { size?: number; tone?: string }) {
  const w = 120 * size
  const h = 90 * size
  return (
    <svg width={w} height={h} viewBox="0 0 120 90" style={{ flexShrink: 0 }}>
      <line x1="60" y1="8" x2="60" y2="30" stroke={colors.amber} strokeWidth="3" />
      <circle cx="60" cy="6" r="5" fill={tone} />
      <line x1="14" y1="30" x2="106" y2="30" stroke={hexToRgba(tone, 0.6)} strokeWidth="3" />
      <circle cx="14" cy="30" r="16" fill="none" stroke={colors.blue} strokeWidth="4" />
      <circle cx="106" cy="30" r="16" fill="none" stroke={colors.amber} strokeWidth="4" />
    </svg>
  )
}

// ── 표지 ────────────────────────────────────────────────────────────────────
// 2026-08-17 전면 개편(PM 지시): "선비 수준으로 점잖아서 인스타 피드에서 스크롤을 멈추게 못함".
// 바꾼 것 — ① 단색 잉크 배경 → 카테고리별 강렬한 그라데이션 ② 제목 최대 92px → 훅 최대 150px
// ③ 이모지 1개 ④ 숫자를 화면 중앙에 독립적으로 크게 ⑤ 하단 브랜드 고정.
//
// 이모지를 1개만 쓰는 이유: 🔥💥⚡를 한꺼번에 붙이면 스팸 계정처럼 보여 오히려 신뢰를 깎는다.
// 세기를 올리는 것과 싸구려로 보이는 것은 다르다 — 크기·대비로 세게 만들고, 이모지는 악센트로만.
const COVER_GRADIENTS: Record<string, [string, string]> = {
  Society: ['#C8102E', '#4A0D1A'],
  Economy: ['#A8791F', '#3A2606'],
  Business: ['#B4603F', '#3A1A0E'],
  Crypto: ['#A8791F', '#2A1C04'],
  Technology: ['#2E8B7F', '#06231F'],
  Science: ['#2E8B7F', '#052622'],
  Sports: ['#C8102E', '#2A0509'],
  Entertainment: ['#7A4FD6', '#1E0C3D'],
  Health: ['#2E8B7F', '#05231D'],
  Automobile: ['#3F5BD9', '#0A1440'],
  Lifestyle: ['#B4603F', '#33150A'],
}
const DEFAULT_GRADIENT: [string, string] = ['#C8102E', '#2A0509']

// 훅 줄 수·길이에 따라 폰트를 정한다. satori에는 자동 축소가 없어 직접 계산해야
// 긴 훅이 카드 밖으로 흘러나가지 않는다. 목표는 "최대한 크게".
function hookSize(lines: string[]) {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
  const n = lines.length
  if (longest <= 6) return n <= 2 ? 150 : 118
  if (longest <= 9) return n <= 2 ? 120 : 100
  if (longest <= 12) return n <= 2 ? 100 : 86
  if (longest <= 16) return 82
  return 68
}

// 2026-08-18: 노차장 SPEC의 3밴드 표지(CoverNews)로 교체 중이다. 이 컴포넌트는 새 표지에
// 필요한 데이터(대립 인용 2개·무게 비중)를 만들어주는 콘텐츠 단계가 붙기 전까지 남겨두는
// 폴백이다. 지금 지우면 30분마다 도는 인스타/스레드 게시가 그 즉시 빈 카드를 올린다.
// 새 표지가 전 카테고리에서 확인되면 이 함수와 COVER_GRADIENTS를 함께 지운다.
function LegacyCover({
  title, category, badge, hook, sub, emoji, stat,
}: {
  title: string; category: string; badge: string
  hook: string; sub: string; emoji: string; stat: string
}) {
  const [g1, g2] = COVER_GRADIENTS[category] || DEFAULT_GRADIENT
  // hook이 없으면(구버전 호출) 기존 title을 훅으로 쓴다 — 하위호환.
  const hookText = (hook || title || '뉴스저울').trim()
  const lines = hookText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3)
  const size = hookSize(lines)

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        width: '100%', height: '100%',
        background: `linear-gradient(150deg, ${g1} 0%, ${g2} 62%, #0B0D10 100%)`,
        padding: '76px 68px', position: 'relative', fontFamily: 'NotoSansKR',
      }}
    >
      {/* 상단 광원 — 그라데이션만으로는 평평해 보여 초점을 하나 만든다 */}
      <div
        style={{
          display: 'flex', position: 'absolute', top: -260, right: -200,
          width: 800, height: 800, borderRadius: 400,
          background: `radial-gradient(circle, ${hexToRgba('#FFFFFF', 0.16)}, transparent 68%)`,
        }}
      />

      {/* 상단: 카테고리 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex', fontSize: 32, fontWeight: 900, color: '#FFFFFF',
            background: hexToRgba('#000000', 0.32), border: `3px solid ${hexToRgba('#FFFFFF', 0.5)}`,
            padding: '12px 30px', borderRadius: 999, letterSpacing: '0.04em',
          }}
        >
          {emoji ? `${emoji} ` : ''}{trunc(badge, 12)}
        </div>
      </div>

      {/* 중앙: 훅. stat이 있으면 그 줄만 더 크고 노란색으로 뽑아 시선을 먼저 잡는다 */}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: -20 }}>
        {lines.map((line, i) => {
          const isStatLine = Boolean(stat) && line.includes(stat)
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                fontSize: isStatLine ? Math.round(size * 1.12) : size,
                fontWeight: 900,
                lineHeight: 1.12,
                color: isStatLine ? '#FFE24A' : '#FFFFFF',
                letterSpacing: '-0.045em',
                wordBreak: 'keep-all',
                textShadow: '0 6px 28px rgba(0,0,0,0.45)',
              }}
            >
              {line}
            </div>
          )
        })}

        {/* 구분선 + 소제목 */}
        <div style={{ display: 'flex', width: 150, height: 8, background: '#FFE24A', marginTop: 44, marginBottom: 26 }} />
        <div
          style={{
            display: 'flex', fontSize: 40, fontWeight: 700,
            color: hexToRgba('#FFFFFF', 0.9), letterSpacing: '-0.02em', wordBreak: 'keep-all',
          }}
        >
          {trunc(sub || '이 이슈 이면에 뭐가 있나', 24)}
        </div>
      </div>

      {/* 하단: 브랜드 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <Logo size={0.7} tone="#FFFFFF" />
        <div style={{ display: 'flex', fontSize: 36, fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
          뉴스저울
        </div>
      </div>
    </div>
  )
}

// ── 본문 ────────────────────────────────────────────────────────────────────
function Body({ heading, text, index, total, category }: {
  heading: string; text: string; index: number; total: number; category: string
}) {
  const accent = domainColors[category] || colors.amber
  const size = text.length <= 90 ? 46 : text.length <= 150 ? 40 : 34
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        width: '100%', height: '100%', background: colors.paper,
        padding: '84px 76px', fontFamily: 'NotoSansKR',
      }}
    >
      {/* 본문은 위로 붙이지 않고 세로 가운데에 둔다 — 짧은 문단일 때 아래가 텅 비어 보이던 문제. */}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
        {heading ? (
          <div
            style={{
              display: 'flex', alignSelf: 'flex-start', fontSize: 30, fontWeight: 900,
              color: colors.paper, background: accent, padding: '10px 24px',
              borderRadius: 10, marginBottom: 44,
            }}
          >
            {trunc(heading, 20)}
          </div>
        ) : null}
        <div
          style={{
            display: 'flex', fontSize: size, fontWeight: 700, lineHeight: 1.62,
            color: colors.ink, letterSpacing: '-0.02em', wordBreak: 'keep-all',
          }}
        >
          {trunc(text, 260)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: colors.stone }}>뉴스저울</div>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 900, color: accent }}>
          {index} / {total}
        </div>
      </div>
    </div>
  )
}

// ── 마무리 ──────────────────────────────────────────────────────────────────
function End({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', background: colors.ink, gap: 40,
        padding: '84px 76px', fontFamily: 'NotoSansKR',
      }}
    >
      <Logo size={1.4} />
      <div style={{ display: 'flex', fontSize: 54, fontWeight: 900, color: colors.paper, letterSpacing: '-0.02em' }}>
        뉴스저울
      </div>
      <div
        style={{
          display: 'flex', fontSize: 34, fontWeight: 700, color: colors.stone,
          textAlign: 'center', lineHeight: 1.5, maxWidth: 760, wordBreak: 'keep-all',
        }}
      >
        {trunc(text, 60)}
      </div>
      <div style={{ display: 'flex', width: 96, height: 5, background: colors.amber }} />
    </div>
  )
}

// ── 새 표지: 골격 8B "저울 스플릿" 3밴드 (SPEC §2.1) ────────────────────────
// 이 안의 핵심. 스레드는 캐러셀이 없어서 이 한 장이 전부이므로, 표지 한 장만 봐도 논쟁이
// 성립해야 한다. 위(ink) 인용 A ↔ 아래(red) 인용 B가 반드시 대립해야 하고(SPEC §4.1),
// 가운데 무게 바가 그 비중을 보여준다 — 사이트 이름(저울)이 그대로 레이아웃이 된다.
//
// 수치는 전부 시안(뉴스저울 홈.dc.html #8b) 확정값이다. 밴드 470+410+470 = 1350.
// 법무(SPEC §8): 인용이 실제 발언이 아니면 큰따옴표를 붙이지 않는다 — 따옴표는 호출부가
// 붙여 보내고 이 컴포넌트는 받은 문자열을 그대로 그린다.
function CoverNews({
  quoteA, kicker, titleLines, quoteB, weightA, labelA, labelB, badge, index, total, cta, note,
}: {
  quoteA: string[]; kicker: string; titleLines: string[]; quoteB: string[]
  weightA: number | null; labelA: string; labelB: string
  badge: string; index: number; total: number; cta: string; note: string
}) {
  const PAD = SKIN_PAD.news
  // 상·하 인용은 줄 수와 크기를 맞춰야 대칭이 산다(SPEC §2.4). 두 문장을 함께 보고 크기를 정한다.
  const qSize = quoteSize(quoteA.join(''), quoteB.join(''))
  // titleSize()의 128px 분기는 연예(8D) 스킨 전용이다(SPEC §3 표: news 104 / ent 128).
  // news에서 128을 쓰면 중단 밴드 410px를 넘겨 무게 바와 라벨이 잘린다(실측 확인).
  const tSize = Math.min(coverTitleSize(titleLines.join('')), 104)
  const hasWeight = weightA != null && weightA >= 0 && weightA <= 100
  const wA = hasWeight ? Math.round(weightA as number) : 0
  const wB = 100 - wA

  const quoteStyle = {
    display: 'flex' as const,
    fontSize: qSize,
    fontWeight: 800,
    letterSpacing: '-.04em',
    lineHeight: 1.24,
    color: cardColor.paper,
  }

  return (
    <div
      style={{
        width: W,
        height: H,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Pretendard',
      }}
    >
      {/* 상단 ink 밴드 470px — 로고·배지 / 인용 A */}
      <div
        style={{
          height: 470,
          background: cardColor.ink,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `52px ${PAD}px`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: cardColor.paper }}>
            뉴스저울
          </span>
          {badge ? (
            <span
              style={{
                fontSize: 26,
                fontWeight: 700,
                lineHeight: 1,
                color: cardColor.paper,
                background: cardColor.red,
                padding: '11px 15px',
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {quoteA.map((l, i) => (
            <div key={i} style={quoteStyle}>{l}</div>
          ))}
        </div>
      </div>

      {/* 중단 paper 밴드 410px — 키커 / 메인 타이틀 / 무게 바 */}
      <div
        style={{
          height: 410,
          background: cardColor.paper,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${PAD}px`,
        }}
      >
        {kicker ? (
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '.1em', lineHeight: 1, color: cardColor.red }}>
            {kicker}
          </span>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
          {titleLines.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                fontSize: tSize,
                fontWeight: 800,
                letterSpacing: '-.05em',
                lineHeight: 1.06,
                color: cardColor.ink,
              }}
            >
              {l}
            </div>
          ))}
        </div>

        {hasWeight ? (
          // ★ 프래그먼트(<>)로 감싸면 안 된다 — satori는 프래그먼트를 레이아웃 노드로 처리하지
          // 못해서 무게 바와 라벨이 형제가 아닌 것처럼 배치되고, 라벨이 카드 밖으로 밀려 잘린다
          // (2026-08-18 실측: "팬 58"이 오른쪽 경계에서 잘리고 "제작사 42"는 통째로 사라졌다).
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', height: 26, marginTop: 34 }}>
              <div style={{ width: `${wA}%`, height: 26, background: cardColor.ink }} />
              <div style={{ width: `${wB}%`, height: 26, background: cardColor.red }} />
            </div>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', marginTop: 14 }}>
              <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: cardColor.ink }}>{labelA}</span>
              <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: cardColor.red }}>{labelB}</span>
            </div>
          </div>
        ) : note ? (
          // 무게가 의미 없는 유형(T3 지원금·T4 추천)에서는 바를 비우지 않고 D-day나 가격을
          // 넣는다(SPEC §2.6). 빈 바를 남기면 저울이 고장난 것처럼 보인다.
          <div style={{ display: 'flex', marginTop: 34 }}>
            <span
              style={{
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1,
                color: cardColor.paper,
                background: cardColor.red,
                padding: '14px 20px',
              }}
            >
              {note}
            </span>
          </div>
        ) : null}
      </div>

      {/* 하단 red 밴드 470px — 인용 B / 카운터·CTA */}
      <div
        style={{
          height: 470,
          background: cardColor.red,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `52px ${PAD}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {quoteB.map((l, i) => (
            <div key={i} style={quoteStyle}>{l}</div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 28, fontWeight: 600, lineHeight: 1, color: cardColor.onRed }}>
            {index} / {total}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: cardColor.paper }}>{cta}</span>
        </div>
      </div>
    </div>
  )
}

// ── 2번 what — 헤더 밴드 + 가로 데이터 바 (SPEC §2.2) ──────────────────────
// "무슨 일인가"는 사실만 놓는 장이다(SPEC §4.2: 해석 금지). 막대는 값 비례가 아니라
// **시각 비례**로 폭을 직접 지정한다 — 값 차이가 작을 때 비례로 그리면 차이가 안 보인다.
// 그래서 폭은 호출부가 200~700px 사이로 정해서 보내고, 여기서는 그대로 그린다.
const BAR_FILL = { ink: cardColor.ink, gray: cardColor.inkLine, red: cardColor.red } as const
type BarColor = keyof typeof BAR_FILL
type Bar = { label: string; value: string; width: number; color: BarColor }

function CardWhat({
  label, subheadLines, bars, source, index, total,
}: {
  label: string; subheadLines: string[]; bars: Bar[]; source: string; index: number; total: number
}) {
  const PAD = SKIN_PAD.news
  const sSize = subheadSize(subheadLines.join(''))

  return (
    <div
      style={{
        width: W,
        height: H,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: cardColor.paper,
        fontFamily: 'Pretendard',
      }}
    >
      <div
        style={{
          height: 190,
          background: cardColor.ink,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `0 ${PAD}px`,
        }}
      >
        <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '.1em', lineHeight: 1, color: cardColor.paper }}>
          {label}
        </span>
        <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: cardColor.mutedDark }}>
          {index} / {total}
        </span>
      </div>

      <div
        style={{
          height: 1160,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `52px ${PAD}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {subheadLines.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                fontSize: sSize,
                fontWeight: 800,
                letterSpacing: '-.04em',
                lineHeight: 1.2,
                color: cardColor.ink,
              }}
            >
              {l}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {bars.map((b, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span style={{ width: 120, fontSize: 34, fontWeight: 700, lineHeight: 1, color: cardColor.muted }}>
                {b.label}
              </span>
              <div style={{ width: b.width, height: 56, background: BAR_FILL[b.color] }} />
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  lineHeight: 1,
                  color: b.color === 'red' ? cardColor.red : cardColor.ink,
                }}
              >
                {b.value}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ width: '100%', height: 3, background: cardColor.line }} />
          <span style={{ fontSize: 38, fontWeight: 500, lineHeight: 1.5, color: cardColor.body }}>{source}</span>
        </div>
      </div>
    </div>
  )
}

// ── 5번 end — 상단 paper + 하단 ink 푸터 (SPEC §2.5) ───────────────────────
// 마무리는 결론을 내리는 장이 아니라 **다음에 확인할 시점**을 담는 장이다(SPEC §4.4).
// "판단 유보 + 검증 시점" — 이게 이 매체의 논조라 카피 규칙이 레이아웃만큼 중요하다.
function CardEnd({
  label, headlineLines, body, tagline, cta, index, total,
}: {
  label: string; headlineLines: string[]; body: string; tagline: string; cta: string
  index: number; total: number
}) {
  const PAD = SKIN_PAD.news
  // 헤드라인 86px 기준(SPEC §2.5). 3줄까지 들어가므로 길면 단계적으로 줄인다.
  const n = [...headlineLines.join('')].length
  const hSize = n <= 14 ? 86 : n <= 21 ? 74 : 64

  return (
    <div
      style={{
        width: W,
        height: H,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background: cardColor.paper,
        fontFamily: 'Pretendard',
      }}
    >
      <div
        style={{
          height: 1010,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: `60px ${PAD}px`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '.1em', lineHeight: 1, color: cardColor.red }}>
            {label}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, lineHeight: 1, color: cardColor.muted }}>
            {index} / {total}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {headlineLines.map((l, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                fontSize: hSize,
                fontWeight: 800,
                letterSpacing: '-.045em',
                lineHeight: 1.2,
                color: cardColor.ink,
              }}
            >
              {l}
            </div>
          ))}
        </div>

        <span style={{ fontSize: 42, fontWeight: 500, lineHeight: 1.6, color: cardColor.body }}>{body}</span>
      </div>

      <div
        style={{
          height: 340,
          background: cardColor.ink,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `0 ${PAD}px`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1, color: cardColor.paper }}>
            뉴스저울
          </span>
          <span style={{ fontSize: 32, fontWeight: 500, lineHeight: 1, color: cardColor.mutedDark }}>{tagline}</span>
        </div>
        <span
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.3,
            color: cardColor.ink,
            background: cardColor.paper,
            padding: '22px 26px',
          }}
        >
          {cta}
        </span>
      </div>
    </div>
  )
}

// ── 8D 연예 스킨(리소 형광) — 표지 (SPEC §3 / 레퍼런스 8d) ──────────────────
// 골격 슬롯(quoteA/kicker/titleLines/quoteB/badge/cta)은 8B와 같은 데이터 계약을 쓰지만,
// 3밴드 대립 구조 대신 flu(형광) 전면 + 원형 장식으로 바뀐다(SPEC §3 표). 무게 바·labelA/B는
// 이 스킨엔 자리가 없어 렌더하지 않는다 — quoteA·quoteB는 위/아래로 나뉘지 않고 한 텍스트
// 블록에 두 줄로 쌓인다(레퍼런스 "팬은 화났고 / 제작사는 원가를 말한다").
// 원형은 §3.1 규칙(슬라이드당 최대 2개, 음수 offset, position:relative 텍스트 컨테이너)을 따른다
// — 표지 항목표의 "원형 3개"는 요약 문구고 §3.1 규칙 텍스트가 정본이라 2개로 구현했다.
function CoverEnt({
  quoteA, kicker, titleLines, quoteB, badge, index, total, cta,
}: {
  quoteA: string[]; kicker: string; titleLines: string[]; quoteB: string[]
  badge: string; index: number; total: number; cta: string
}) {
  const tSize = coverTitleSize(titleLines.join(''))

  return (
    <div
      style={{
        width: W, height: H, boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: cardColor.flu, padding: '56px 52px', position: 'relative', fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', position: 'absolute', top: -140, right: -160, width: 620, height: 620, borderRadius: 620, background: cardColor.ink }} />
      <div style={{ display: 'flex', position: 'absolute', bottom: 250, left: -90, width: 340, height: 340, borderRadius: 340, background: cardColor.red }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <span style={{ display: 'flex', fontSize: 34, fontWeight: 800, lineHeight: 1, color: cardColor.ink }}>뉴스저울</span>
        {badge ? (
          <span style={{ display: 'flex', fontSize: 26, fontWeight: 800, lineHeight: 1, color: cardColor.flu, background: cardColor.ink, padding: '12px 16px', borderRadius: 100 }}>
            {badge}
          </span>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {kicker ? (
          <span
            style={{
              display: 'flex', alignSelf: 'flex-start', fontSize: 40, fontWeight: 800,
              letterSpacing: '.06em', color: cardColor.ink, background: cardColor.paper,
              padding: '16px 20px', transform: 'rotate(-2deg)',
            }}
          >
            {kicker}
          </span>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
          {titleLines.map((l, i) => (
            <div key={i} style={{ display: 'flex', fontSize: tSize, fontWeight: 800, letterSpacing: '-.05em', lineHeight: 1.02, color: cardColor.paper }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 30 }}>
          {[...quoteA, ...quoteB].map((l, i) => (
            <div key={i} style={{ display: 'flex', fontSize: 46, fontWeight: 700, lineHeight: 1.45, color: cardColor.ink }}>
              {l}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <span style={{ display: 'flex', fontSize: 30, fontWeight: 800, lineHeight: 1, color: cardColor.ink, background: cardColor.paper, padding: '14px 18px', borderRadius: 100 }}>
          {index} / {total}
        </span>
        <span style={{ display: 'flex', fontSize: 32, fontWeight: 800, lineHeight: 1, color: cardColor.paper, background: cardColor.ink, padding: '18px 24px', borderRadius: 100 }}>
          {cta}
        </span>
      </div>
    </div>
  )
}

// ── 8D — 무슨 일인가 (레퍼런스 8d 2번 슬라이드) ─────────────────────────────
// 8B의 ink 헤더 밴드 대신 알약 배지 라벨 하나. 막대 대신 값이 칩(알약)으로 나열된다.
// source는 "날짜 큰 글씨 + 나머지·카운터 작은 글씨" 두 줄로 쪼갠다(레퍼런스가 그렇게 나뉜다).
function CardWhatEnt({
  label, subheadLines, bars, source, index, total,
}: {
  label: string; subheadLines: string[]; bars: Bar[]; source: string; index: number; total: number
}) {
  const sSize = subheadSize(subheadLines.join(''))
  const CHIP_STYLE: Record<BarColor, { bg: string; color: string }> = {
    gray: { bg: cardColor.flu, color: cardColor.ink },
    ink: { bg: cardColor.ink, color: cardColor.paper },
    red: { bg: cardColor.red, color: cardColor.paper },
  }
  const parts = source.split('·').map((s) => s.trim()).filter(Boolean)
  const [big, ...rest] = parts

  return (
    <div
      style={{
        width: W, height: H, boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: cardColor.paper, padding: '56px 52px', fontFamily: 'Pretendard',
      }}
    >
      <span style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 36, fontWeight: 800, letterSpacing: '.06em', color: cardColor.paper, background: cardColor.ink, padding: '16px 20px', borderRadius: 100 }}>
        {label}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {subheadLines.map((l, i) => (
            <div key={i} style={{ display: 'flex', fontSize: sSize, fontWeight: 800, letterSpacing: '-.04em', lineHeight: 1.18, color: cardColor.ink }}>
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {bars.map((b, i) => {
            const st = CHIP_STYLE[b.color]
            return (
              <span key={i} style={{ display: 'flex', fontSize: 40, fontWeight: 800, lineHeight: 1, color: st.color, background: st.bg, padding: '18px 22px', borderRadius: 100 }}>
                {b.label} {b.value}
              </span>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {big ? <span style={{ display: 'flex', fontSize: 52, fontWeight: 800, lineHeight: 1.3, color: cardColor.ink }}>{big}</span> : null}
        <span style={{ display: 'flex', fontSize: 32, fontWeight: 600, lineHeight: 1, color: cardColor.mutedDark }}>
          {[...rest, `${index} / ${total}`].join(' · ')}
        </span>
      </div>
    </div>
  )
}

// ── viewA / viewB — 대립형(T1) 전면 슬라이드 (SPEC §2.3~§2.4, §3) ──────────
// news·ent 두 스킨을 한 컴포넌트로 묶는다 — 슬롯(headline/body/attribution/카운터)이
// 완전히 같고 색·장식만 갈리기 때문이다(레퍼런스 8b/8d 3·4번 슬라이드 대조 결과).
// A와 B는 배경(ink/red)과 몇몇 대비색만 바뀌는 완전 대칭 — 호출부가 headlineLines 줄 수를
// A/B 동일하게 맞춰야 한다(SPEC §2.4 "줄 수가 다르면 대칭이 깨진다").
function CardView({
  side, skin, label, headlineLines, body, attribution, index, total,
}: {
  side: 'A' | 'B'; skin: CardSkin
  label: string; headlineLines: string[]; body: string; attribution: string
  index: number; total: number
}) {
  const isNews = skin !== 'ent'
  const bg = side === 'A' ? cardColor.ink : cardColor.red
  const n = [...headlineLines.join('')].length
  const hSize = n <= 14 ? 90 : n <= 21 ? 78 : 68

  const bodyColor = isNews
    ? (side === 'A' ? cardColor.bodyDark : cardColor.onRed)
    : (side === 'A' ? cardColor.flu : cardColor.onRed)
  // news 상단 카운터색 — 8B 레퍼런스가 A/B에서 다른 값을 쓴다(4번 슬라이드만 밝은 톤).
  const newsCounterColor = side === 'A' ? cardColor.mutedDark : cardColor.onRed
  const entPill = side === 'A'
    ? { bg: cardColor.flu, color: cardColor.ink }
    : { bg: cardColor.paper, color: cardColor.red }
  const entFooterColor = side === 'A' ? cardColor.bodyDark : cardColor.onRed

  return (
    <div
      style={{
        width: W, height: H, boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: bg, padding: isNews ? '60px 56px' : '56px 52px', position: 'relative', fontFamily: 'Pretendard',
      }}
    >
      {!isNews ? (
        <div
          style={{
            display: 'flex', position: 'absolute', width: 520, height: 520, borderRadius: 520,
            background: side === 'A' ? cardColor.red : cardColor.ink,
            ...(side === 'A' ? { bottom: -180, right: -120 } : { top: -160, left: -140 }),
          }}
        />
      ) : null}

      {isNews ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <span style={{ display: 'flex', fontSize: 34, fontWeight: 700, letterSpacing: '.1em', lineHeight: 1, color: cardColor.paper }}>{label}</span>
          <span style={{ display: 'flex', fontSize: 30, fontWeight: 700, lineHeight: 1, color: newsCounterColor }}>{index} / {total}</span>
        </div>
      ) : (
        <span
          style={{
            display: 'flex', alignSelf: 'flex-start', fontSize: 36, fontWeight: 800, letterSpacing: '.06em',
            color: entPill.color, background: entPill.bg, padding: '16px 20px', borderRadius: 100, position: 'relative',
          }}
        >
          {label}
        </span>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: isNews ? 30 : 28, position: 'relative' }}>
        {headlineLines.map((l, i) => (
          <div key={i} style={{ display: 'flex', fontSize: hSize, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.18, color: cardColor.paper }}>
            {l}
          </div>
        ))}
        <span style={{ display: 'flex', fontSize: 42, fontWeight: isNews ? 500 : 600, lineHeight: isNews ? 1.6 : 1.55, color: bodyColor }}>
          {body}
        </span>
      </div>

      {isNews ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative' }}>
          <div style={{ display: 'flex', width: 70, height: 70, background: cardColor.paper }} />
          <span style={{ display: 'flex', fontSize: 32, fontWeight: 600, lineHeight: 1.35, color: newsCounterColor }}>{attribution}</span>
        </div>
      ) : (
        <span style={{ display: 'flex', fontSize: 30, fontWeight: 700, lineHeight: 1, color: entFooterColor, position: 'relative' }}>
          {[attribution, `${index} / ${total}`].filter(Boolean).join(' · ')}
        </span>
      )}
    </div>
  )
}

// ── 8D — 마무리 (레퍼런스 8d 5번 슬라이드) ──────────────────────────────────
// 8B end와 달리 상단 paper/하단 ink 2밴드가 아니라 flu 전면 1장이고, 태그라인·카운터가 없다
// (레퍼런스에 없다 — 있는 그대로 옮긴다).
function CardEndEnt({
  label, headlineLines, body, cta,
}: {
  label: string; headlineLines: string[]; body: string; cta: string
}) {
  const n = [...headlineLines.join('')].length
  const hSize = n <= 14 ? 88 : n <= 21 ? 76 : 66

  return (
    <div
      style={{
        width: W, height: H, boxSizing: 'border-box', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: cardColor.flu, padding: '56px 52px', position: 'relative', fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', position: 'absolute', top: 340, right: -190, width: 600, height: 600, borderRadius: 600, background: cardColor.paper }} />

      <span style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 36, fontWeight: 800, letterSpacing: '.06em', color: cardColor.flu, background: cardColor.ink, padding: '16px 20px', borderRadius: 100, position: 'relative' }}>
        {label}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 26, position: 'relative' }}>
        {headlineLines.map((l, i) => (
          <div key={i} style={{ display: 'flex', fontSize: hSize, fontWeight: 800, letterSpacing: '-.045em', lineHeight: 1.18, color: cardColor.ink }}>
            {l}
          </div>
        ))}
        <span style={{ display: 'flex', fontSize: 42, fontWeight: 600, lineHeight: 1.55, color: cardColor.ink }}>{body}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <span style={{ display: 'flex', fontSize: 44, fontWeight: 800, lineHeight: 1, color: cardColor.ink }}>뉴스저울</span>
        <span style={{ display: 'flex', fontSize: 32, fontWeight: 800, lineHeight: 1, color: cardColor.flu, background: cardColor.ink, padding: '20px 26px', borderRadius: 100 }}>
          {cta}
        </span>
      </div>
    </div>
  )
}

// bars 쿼리 파싱 — `라벨:값:폭:색` 행을 `|`로 이어 보낸다.
//   예) bars=VIP:22만:520:ink|일반:16.5만:390:gray|암표:30만+:700:red
// SPEC §5.2의 검증(3~4행, 폭 200~700)을 여기서 하고, 어긋나면 이유를 문자열로 돌려준다.
// 조용히 잘린 이미지를 내보내지 않는 것이 이 라우트의 규칙이다(SPEC §Interactions).
function parseBars(raw: string | null): { bars: Bar[] } | { error: string } {
  if (!raw) return { error: 'bars 파라미터가 없다 (형식: 라벨:값:폭:색|…)' }
  const rows = raw.split('|').map((s) => s.trim()).filter(Boolean)
  if (rows.length < 3 || rows.length > 4) {
    return { error: `막대는 3~4행이어야 한다 (받은 행 수: ${rows.length})` }
  }

  const bars: Bar[] = []
  for (const row of rows) {
    const [label, value, widthRaw, colorRaw] = row.split(':')
    const width = Number(widthRaw)
    if (!label || !value || !Number.isFinite(width)) {
      return { error: `막대 형식 오류: "${row}" (라벨:값:폭:색)` }
    }
    if (width < 200 || width > 700) {
      // SPEC §2.2: 값 차이가 작으면 차이가 안 보이므로 최소 폭 200px을 보장할 것.
      return { error: `막대 폭은 200~700이어야 한다: "${row}" (받은 값: ${width})` }
    }
    const color = (colorRaw || 'ink') as BarColor
    if (!(color in BAR_FILL)) {
      return { error: `막대 색은 ink|gray|red 중 하나여야 한다: "${row}"` }
    }
    const over = checkLimits([['bar.label', label, 4], ['bar.value', value, 7]])
    if (over) return { error: `"${row}" — ${over}` }
    bars.push({ label, value, width, color })
  }
  return { bars }
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const slide = p.get('slide') || 'cover'
  const title = p.get('title') || '뉴스저울'
  const text = p.get('text') || ''
  const heading = p.get('heading') || ''
  const category = p.get('category') || ''
  const badge = p.get('badge') || '오늘의 이슈'
  const index = Number(p.get('i') || 1)
  const total = Number(p.get('n') || 1)
  // 스킨(SPEC §3·§5) — 8B(news) 골격은 그대로 두고 색·장식만 8D(ent)로 갈아끼운다.
  // guide(§6.3)는 T3 붙을 때 추가한다. 잘못된 값이 오면 news로 떨어뜨린다(카드 생성 자체는 막지 않는다).
  const skinParam = p.get('skin')
  const skin: CardSkin = skinParam === 'ent' || skinParam === 'guide' ? skinParam : 'news'
  // 표지 개편(2026-08-17)으로 추가된 파라미터. 없으면 title로 폴백해 구버전 URL도 그대로 동작한다.
  const hook = p.get('hook') || ''
  const sub = p.get('sub') || ''
  const emoji = p.get('emoji') || ''
  const stat = p.get('stat') || ''

  // ── 새 표지(SPEC §2.1) 파라미터 ────────────────────────────────────────────
  // 대립 인용 두 개가 이 안의 전제다(SPEC §4.1: "quoteA/quoteB는 반드시 대립해야 한다").
  // 둘 다 있을 때만 새 표지를 그리고, 없으면 기존 표지로 간다 — 콘텐츠 생성 단계가 붙기 전까지
  // 30분마다 도는 인스타/스레드 게시를 멈추지 않기 위해서다.
  const quoteA = toLines(p.get('quoteA'), 2)
  const quoteB = toLines(p.get('quoteB'), 2)
  const titleLines = toLines(p.get('title'), 2)
  const useNewCover = slide === 'cover' && quoteA.length > 0 && quoteB.length > 0 && titleLines.length > 0

  // ── 2번 what — 새 슬라이드라 레거시 충돌이 없다. 데이터가 어긋나면 그대로 500으로 막는다.
  if (slide === 'what') {
    const parsed = parseBars(p.get('bars'))
    if ('error' in parsed) return new Response(parsed.error, { status: 500 })
    const subheadLines = toLines(p.get('subhead'), 2)
    if (!subheadLines.length) return new Response('subhead가 없다 (2줄까지, 각 24자)', { status: 500 })

    const label = p.get('label') || '무슨 일인가'
    const source = p.get('source') || ''
    const over = checkLimits([
      ...subheadLines.map((l, i) => [`subhead[${i}]`, l, 24] as LimitEntry),
      ['source', source, 34],
      ['label', label, 8],
    ])
    if (over) return new Response(over, { status: 500 })

    try {
      const fonts = await loadPretendard(new URL(req.url).origin)
      const node = skin === 'ent'
        ? <CardWhatEnt label={label} subheadLines={subheadLines} bars={parsed.bars} source={source} index={index} total={total} />
        : <CardWhat label={label} subheadLines={subheadLines} bars={parsed.bars} source={source} index={index} total={total} />
      return new ImageResponse(node, { width: W, height: H, fonts, headers: NO_STORE })
    } catch (e) {
      console.error('카드뉴스 what 생성 오류:', e)
      return new Response(`card what error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
    }
  }

  // ── 3·4번 viewA/viewB — T1 대립형 (SPEC §2.3~§2.4) ─────────────────────────
  // A/B는 완전 대칭이어야 한다(SPEC §2.4) — headlineLines 줄 수가 다르면 500으로 막는다.
  // 호출부가 두 슬라이드를 각각 요청하므로 여기서는 한쪽만 검증하고, 줄 수 불일치는
  // 카피 생성 단계(§5.2 assert)가 1차로 막아야 하지만 라우트에서도 조용히 넘기지 않는다.
  if (slide === 'viewA' || slide === 'viewB') {
    const side = slide === 'viewA' ? 'A' : 'B'
    const headlineLines = toLines(p.get('headline'), 3)
    const body = p.get('body') || ''
    const attribution = p.get('attribution') || ''
    const label = p.get('label') || (side === 'A' ? '이렇게 본다' : '이렇게도 본다')
    if (!headlineLines.length) return new Response('headline이 없다 (3줄까지, 각 21자)', { status: 500 })
    const over = checkLimits([
      ...headlineLines.map((l, i) => [`headline[${i}]`, l, 21] as LimitEntry),
      ['body', body, 52],
      ['attribution', attribution, 16],
      ['label', label, 8],
    ])
    if (over) return new Response(over, { status: 500 })

    try {
      const fonts = await loadPretendard(new URL(req.url).origin)
      const node = (
        <CardView side={side} skin={skin} label={label} headlineLines={headlineLines} body={body} attribution={attribution} index={index} total={total} />
      )
      return new ImageResponse(node, { width: W, height: H, fonts, headers: NO_STORE })
    } catch (e) {
      console.error('카드뉴스 view 생성 오류:', e)
      return new Response(`card view error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
    }
  }

  // ── 5번 end — 레거시 end(text만 받던 것)와 같은 이름이라, 새 카피(headline)가 있을 때만
  // 새 디자인으로 간다. 없으면 기존 마무리 카드로 떨어져 현행 인스타 게시가 안 끊긴다.
  const endHeadline = toLines(p.get('headline'), 3)
  if (slide === 'end' && endHeadline.length > 0) {
    const endLabel = p.get('label') || '마무리'
    const endBody = p.get('body') || text
    const endTagline = p.get('tagline') || '양쪽을 같이 재는 뉴스'
    const endCta = p.get('cta') || '전문 보기'
    const over = checkLimits([
      ...endHeadline.map((l, i) => [`headline[${i}]`, l, 18] as LimitEntry),
      ['body', endBody, 48],
      ['tagline', endTagline, 14],
      ['cta', endCta, 10],
      ['label', endLabel, 8],
    ])
    if (over) return new Response(over, { status: 500 })

    try {
      const fonts = await loadPretendard(new URL(req.url).origin)
      const node = skin === 'ent'
        ? <CardEndEnt label={endLabel} headlineLines={endHeadline} body={endBody} cta={endCta} />
        : <CardEnd label={endLabel} headlineLines={endHeadline} body={endBody} tagline={endTagline} cta={endCta} index={index} total={total} />
      return new ImageResponse(node, { width: W, height: H, fonts, headers: NO_STORE })
    } catch (e) {
      console.error('카드뉴스 end 생성 오류:', e)
      return new Response(`card end error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
    }
  }

  if (useNewCover) {
    const weightRaw = p.get('weightA')
    const weightA = weightRaw != null && weightRaw !== '' ? Number(weightRaw) : null
    if (weightA != null && (!Number.isFinite(weightA) || weightA < 0 || weightA > 100)) {
      // SPEC §5.2 검증. 조용히 잘린 이미지를 내보내지 말고 어떤 필드가 문제인지 본문에 쓴다.
      return new Response(`weightA는 0~100이어야 한다 (받은 값: ${weightRaw})`, { status: 500 })
    }

    const kicker = p.get('kicker') || ''
    const labelA = p.get('labelA') || ''
    const labelB = p.get('labelB') || ''
    const coverBadge = p.get('badge') || ''
    const coverCta = p.get('cta') || '양쪽 다 읽어보기 →'
    const note = p.get('note') || ''
    const overCover = checkLimits([
      ...titleLines.map((l, i) => [`title[${i}]`, l, 12] as LimitEntry),
      ...quoteA.map((l, i) => [`quoteA[${i}]`, l, 16] as LimitEntry),
      ...quoteB.map((l, i) => [`quoteB[${i}]`, l, 16] as LimitEntry),
      ['kicker', kicker, 14],
      ['labelA', labelA, 6],
      ['labelB', labelB, 6],
      ['badge', coverBadge, 6],
      ['cta', coverCta, 12],
      ['note', note, 10],
    ])
    if (overCover) return new Response(overCover, { status: 500 })

    try {
      const fonts = await loadPretendard(new URL(req.url).origin)
      const node = skin === 'ent'
        ? (
          <CoverEnt
            quoteA={quoteA}
            quoteB={quoteB}
            titleLines={titleLines}
            kicker={kicker}
            badge={coverBadge}
            index={index}
            total={total}
            cta={coverCta}
          />
        )
        : (
          <CoverNews
            quoteA={quoteA}
            quoteB={quoteB}
            titleLines={titleLines}
            kicker={kicker}
            weightA={weightA}
            labelA={labelA}
            labelB={labelB}
            badge={coverBadge}
            index={index}
            total={total}
            cta={coverCta}
            note={note}
          />
        )
      return new ImageResponse(node, { width: W, height: H, fonts, headers: NO_STORE })
    } catch (e) {
      // 폰트를 못 실으면 satori가 전 웨이트를 400으로 떨어뜨린다(SPEC §1.2가 지목한 사고).
      // 무게가 무너진 표지를 내보내느니 실패를 드러낸다.
      console.error('카드뉴스 표지 생성 오류:', e)
      return new Response(`card cover error: ${e instanceof Error ? e.message : String(e)}`, { status: 500 })
    }
  }

  const allText = ['뉴스저울', '이 이슈 이면에 뭐가 있나', title, text, heading, badge, hook, sub, stat, `${index}/${total}`].join(' ')

  try {
    const [font700, font900] = await Promise.all([loadFont(allText, 700), loadFont(allText, 900)])
    const fonts: { name: string; data: ArrayBuffer; weight: 700 | 900 }[] = []
    if (font700) fonts.push({ name: 'NotoSansKR', data: font700, weight: 700 })
    if (font900) fonts.push({ name: 'NotoSansKR', data: font900, weight: 900 })

    const node =
      slide === 'body' ? <Body heading={heading} text={text} index={index} total={total} category={category} />
      : slide === 'end' ? <End text={text || '매일 이슈의 이면을 봅니다'} />
      : <LegacyCover title={title} category={category} badge={badge} hook={hook} sub={sub} emoji={emoji} stat={stat} />

    return new ImageResponse(node, {
      width: W,
      height: H,
      fonts,
      // ★ 캐시 금지 — 2026-08-17 실측 사고.
      // 처음엔 'public, max-age=3600, s-maxage=86400, immutable'을 줬는데, Netlify Edge가
      // 쿼리스트링을 무시하고 경로(/card)만으로 캐시 키를 잡아버렸다. 그 결과 slide/title/text가
      // 전부 다른 5장을 요청해도 **똑같은 이미지 1장**이 돌아왔다(4장 sha256 완전 일치,
      // 응답 헤더 cache: "Netlify Edge"; hit; ttl=86346). 그대로 게시했으면 카드뉴스 5장이
      // 전부 같은 그림으로 올라갔을 것이다.
      // 이 라우트는 요청마다 파라미터가 다른 것이 정상이므로 CDN 캐싱을 아예 끈다.
      // 성능 손해는 없다 — 인스타/스레드는 게시할 때 이미지를 한 번만 가져간다.
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Netlify-CDN-Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('카드뉴스 생성 오류:', e)
    return new Response('card image error', { status: 500 })
  }
}
