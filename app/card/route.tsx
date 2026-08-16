import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { colors, domainColors } from '@/lib/design-tokens'

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
function Cover({ title, category, badge }: { title: string; category: string; badge: string }) {
  const accent = domainColors[category] || colors.amber
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        width: '100%', height: '100%', background: colors.ink,
        padding: '84px 76px', position: 'relative', fontFamily: 'NotoSansKR',
      }}
    >
      <div
        style={{
          display: 'flex', position: 'absolute', top: -180, right: -140,
          width: 640, height: 640, borderRadius: 320,
          background: `radial-gradient(circle, ${hexToRgba(accent, 0.22)}, transparent 70%)`,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <Logo size={0.85} />
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: colors.paper, letterSpacing: '-0.02em' }}>
          뉴스저울
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex', alignSelf: 'flex-start',
            fontSize: 30, fontWeight: 900, color: colors.ink, background: accent,
            padding: '12px 28px', borderRadius: 999, marginBottom: 36, letterSpacing: '0.02em',
          }}
        >
          {trunc(badge, 14)}
        </div>
        {/* wordBreak: keep-all — 없으면 "국회 본회/의 표결"처럼 한글 단어 중간에서 줄이 끊긴다.
            satori 기본값이 단어 경계를 무시하기 때문에 카드 텍스트에는 항상 명시해야 한다. */}
        <div
          style={{
            display: 'flex', fontSize: titleSize(title), fontWeight: 900,
            lineHeight: 1.28, color: colors.paper, letterSpacing: '-0.03em',
            wordBreak: 'keep-all',
          }}
        >
          {trunc(title, 70)}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', width: 72, height: 5, background: accent }} />
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: colors.stone }}>
          이 이슈 이면에 뭐가 있나
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

  const allText = ['뉴스저울', '이 이슈 이면에 뭐가 있나', title, text, heading, badge, `${index}/${total}`].join(' ')

  try {
    const [font700, font900] = await Promise.all([loadFont(allText, 700), loadFont(allText, 900)])
    const fonts: { name: string; data: ArrayBuffer; weight: 700 | 900 }[] = []
    if (font700) fonts.push({ name: 'NotoSansKR', data: font700, weight: 700 })
    if (font900) fonts.push({ name: 'NotoSansKR', data: font900, weight: 900 })

    const node =
      slide === 'body' ? <Body heading={heading} text={text} index={index} total={total} category={category} />
      : slide === 'end' ? <End text={text || '매일 이슈의 이면을 봅니다'} />
      : <Cover title={title} category={category} badge={badge} />

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
