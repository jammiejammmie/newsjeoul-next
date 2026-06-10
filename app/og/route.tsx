import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

// ── Design tokens (no CSS vars — satori doesn't support them) ──
const C = {
  bg:     '#f5f2ea',   // warm ivory
  text:   '#111010',   // near-black
  text2:  '#3d3830',   // dark charcoal
  muted:  '#9a8e82',   // warm gray
  accent: '#c8a87a',   // gold — used sparingly
  line:   '#ddd8ce',   // divider
}

// ── Font loader: Google Fonts text-subset API ──────────────────
// Old Android UA → Google Fonts returns TTF instead of WOFF2.
// satori in Next.js 16 does NOT support WOFF2.
async function loadFont(allText: string, weight: 400 | 700 | 900) {
  const chars = [...new Set(allText.replace(/\s/g, ''))].join('')
  if (!chars) return null

  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(chars)}&display=swap`,
    {
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

// Split title at the space nearest to the midpoint → newspaper 2-line headline.
// Favors left-of-center breaks (shorter first line reads more naturally in Korean).
// Falls back to single line when no space is found within 14 chars of midpoint.
function headlineSplit(s: string): [string, string] {
  const t = trunc(s, 52)
  if (t.length <= 15) return [t, '']
  const mid = Math.floor(t.length / 2)
  for (let d = 0; d <= 14; d++) {
    if (mid - d >= 1 && t[mid - d] === ' ')
      return [t.slice(0, mid - d).trim(), t.slice(mid - d).trim()]
    if (mid + d < t.length - 1 && t[mid + d] === ' ')
      return [t.slice(0, mid + d).trim(), t.slice(mid + d).trim()]
  }
  return [t, '']
}

// ── Card: 침묵 뉴스 ─────────────────────────────────────────────
// Visual flow: title → count → question
// Title is the protagonist — people click "what's the story?" not the number.
// Note: flexDirection:'column' on title container enables satori text wrapping.
function SilenceCard({ title, outlets, total }: { title: string; outlets: number; total: number }) {
  const [line1, line2] = headlineSplit(title)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: '60px 72px',
        fontFamily: 'NotoSansKR',
      }}
    >
      {/* Top bar — brand only */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: '0.22em', fontWeight: 700 }}>
          NEWSJEOUL
        </span>
      </div>

      {/* Title — newspaper headline, max 2 lines, vertically centered */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          borderLeft: `4px solid ${C.accent}`,
          paddingLeft: 24,
          marginTop: 36,
          marginBottom: 32,
        }}
      >
        <span style={{ fontSize: 38, fontWeight: 900, color: C.text, lineHeight: 1.55 }}>
          {line1}
        </span>
        {line2 ? (
          <span style={{ fontSize: 38, fontWeight: 900, color: C.text, lineHeight: 1.55 }}>
            {line2}
          </span>
        ) : null}
      </div>

      {/* Count — supporting stat, number in accent gold */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 18, color: C.text2, fontWeight: 400 }}>{total}개 언론사 중</span>
        <span style={{ fontSize: 30, fontWeight: 900, color: C.accent, lineHeight: 1 }}>{outlets}</span>
        <span style={{ fontSize: 18, color: C.text2, fontWeight: 400 }}>개만 보도했습니다</span>
      </div>

      {/* Question — curiosity hook */}
      <div style={{ display: 'flex' }}>
        <span style={{ fontSize: 18, color: C.muted, fontWeight: 600 }}>
          왜 대부분의 언론은 이 사건을 다루지 않았을까?
        </span>
      </div>
    </div>
  )
}

// ── Card: 오늘의 논쟁 ───────────────────────────────────────────
// Layout: compact one-line header, headlines dominate the center.
function DebateCard({
  title, h1, o1, h2, o2,
}: { title: string; h1: string; o1: string; h2: string; o2: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: '48px 72px 52px',
        fontFamily: 'NotoSansKR',
      }}
    >
      {/* Top: single compact line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: C.muted, letterSpacing: '0.22em', fontWeight: 700 }}>
            NEWSJEOUL
          </span>
          <span style={{ display: 'flex', width: 1, height: 14, background: C.line }} />
          <span style={{ fontSize: 15, color: C.text2, fontWeight: 600 }}>
            같은 사건, 완전히 다른 헤드라인
          </span>
        </div>
        <span style={{ fontSize: 12, color: C.muted }}>당신이 못 본 절반</span>
      </div>

      {/* Thin divider */}
      <div style={{ display: 'flex', height: 1, background: C.line }} />

      {/* Headlines — main content, fills available space */}
      <div style={{ display: 'flex', flexGrow: 1, gap: 0 }}>

        {/* Left */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingRight: 44,
            paddingTop: 36,
            paddingBottom: 36,
            borderRight: `1px solid ${C.line}`,
            justifyContent: 'center',
          }}
        >
          <span
            style={{ fontSize: 13, color: C.accent, fontWeight: 700, marginBottom: 16, letterSpacing: '0.06em' }}
          >
            {o1}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>
            "{trunc(h1, 36)}"
          </span>
        </div>

        {/* Right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingLeft: 44,
            paddingTop: 36,
            paddingBottom: 36,
            justifyContent: 'center',
          }}
        >
          <span
            style={{ fontSize: 13, color: C.accent, fontWeight: 700, marginBottom: 16, letterSpacing: '0.06em' }}
          >
            {o2}
          </span>
          <span style={{ fontSize: 30, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>
            "{trunc(h2, 36)}"
          </span>
        </div>
      </div>

      {/* Thin divider */}
      <div style={{ display: 'flex', height: 1, background: C.line, marginBottom: 16 }} />

      {/* Bottom: story context */}
      <span style={{ fontSize: 14, color: C.muted }}>
        {trunc(title, 70)}
      </span>
    </div>
  )
}

// ── Card: 내가 못 본 절반 ────────────────────────────────────────
// Layout: content vertically centered, no excessive top whitespace.
function MissingCard({ title, outlets, total }: { title: string; outlets: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: '60px 72px',
        fontFamily: 'NotoSansKR',
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: '0.22em', fontWeight: 700 }}>
          NEWSJEOUL
        </span>
        <span style={{ fontSize: 13, color: C.muted, letterSpacing: '0.08em' }}>
          당신이 못 본 절반
        </span>
      </div>

      {/* Main block — vertically centered in remaining space */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          justifyContent: 'center',
          gap: 22,
        }}
      >
        <span style={{ fontSize: 20, color: C.muted, fontWeight: 400 }}>
          당신이 놓쳤을 수 있는 시각
        </span>

        <div style={{ display: 'flex', borderLeft: `4px solid ${C.accent}`, paddingLeft: 24 }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: C.text, lineHeight: 1.55 }}>
            {trunc(title, 48)}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 20, color: C.text2, fontWeight: 700 }}>
            {total}개 언론사 중 {outlets}개만 보도
          </span>
          <span style={{ fontSize: 14, color: C.muted }}>
            나머지 {total - outlets}개는 이 이야기를 다루지 않았습니다
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Route handler ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const type    = p.get('type') || 'silence'
  const title   = p.get('title') || '뉴스저울'
  const outlets = parseInt(p.get('outlets') || '3')
  const total   = parseInt(p.get('total')   || '20')
  const h1      = p.get('h1') || ''
  const o1      = p.get('o1') || ''
  const h2      = p.get('h2') || ''
  const o2      = p.get('o2') || ''

  // Collect all text that needs to be rendered (for font subsetting)
  const allText = [
    'NEWSJEOUL', '당신이 못 본 절반',
    title, h1, h2, o1, o2,
    `${total}개 언론사 중`, `${outlets}개만`, '보도했습니다',
    '같은 사건', '완전히 다른 헤드라인',
    '당신이 놓쳤을 수 있는 시각',
    '왜 대부분의 언론은 이 사건을 다루지 않았을까?',
    `나머지 ${total - outlets}개는 이 이야기를 다루지 않았습니다`,
  ].join(' ')

  try {
    const [font700, font900] = await Promise.all([
      loadFont(allText, 700),
      loadFont(allText, 900),
    ])

    const fontConfig: { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 }[] = []
    if (font700) fontConfig.push({ name: 'NotoSansKR', data: font700, weight: 700 })
    if (font900) fontConfig.push({ name: 'NotoSansKR', data: font900, weight: 900 })

    let el: React.ReactElement
    if (type === 'debate') {
      el = <DebateCard title={title} h1={h1} o1={o1} h2={h2} o2={o2} />
    } else if (type === 'missing') {
      el = <MissingCard title={title} outlets={outlets} total={total} />
    } else {
      el = <SilenceCard title={title} outlets={outlets} total={total} />
    }

    return new ImageResponse(el, {
      width: 1200,
      height: 630,
      fonts: fontConfig,
    })
  } catch (e) {
    console.error('OG 생성 오류:', e)
    return new Response('OG image error', { status: 500 })
  }
}
