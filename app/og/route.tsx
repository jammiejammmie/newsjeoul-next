import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const runtime = 'edge'

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
// Using text= parameter returns a single tiny woff2 with only
// the glyphs we need, instead of loading all Korean subsets.
async function loadFont(allText: string, weight: 400 | 700 | 900) {
  const chars = [...new Set(allText.replace(/\s/g, ''))].join('')
  if (!chars) return null

  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(chars)}&display=swap`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    }
  ).then(r => r.text())

  const url = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/)?.[1]
  if (!url) return null
  return fetch(url).then(r => r.arrayBuffer())
}

function trunc(s: string, n: number) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ── Card: 침묵 뉴스 ─────────────────────────────────────────────
// Hook: "20개 중 3개만 보도" — the NUMBER stops the scroll
function SilenceCard({ title, outlets, total }: { title: string; outlets: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
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

      {/* Main hook */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Context label */}
        <span style={{ fontSize: 20, color: C.text2, fontWeight: 400, marginBottom: 6 }}>
          {total}개 언론사 중
        </span>

        {/* Big number — the scroll-stopper */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 2 }}>
          <span style={{ fontSize: 104, fontWeight: 900, color: C.text, lineHeight: 1 }}>
            {outlets}
          </span>
          <span style={{ fontSize: 42, fontWeight: 700, color: C.text }}>개만</span>
        </div>
        <span style={{ fontSize: 40, fontWeight: 700, color: C.text, marginBottom: 36 }}>
          보도했습니다
        </span>

        {/* Article title — gold left border */}
        <div style={{ display: 'flex', borderLeft: `4px solid ${C.accent}`, paddingLeft: 22 }}>
          <span style={{ fontSize: 21, color: C.text2, lineHeight: 1.65, fontWeight: 500 }}>
            {trunc(title, 58)}
          </span>
        </div>
      </div>

      {/* Bottom question — curiosity hook */}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <span style={{ fontSize: 17, color: C.muted, fontWeight: 400 }}>
          왜 대부분의 언론은 이 사건을 다루지 않았을까?
        </span>
      </div>
    </div>
  )
}

// ── Card: 오늘의 논쟁 ───────────────────────────────────────────
// Hook: Two headlines that directly contradict each other
function DebateCard({
  title, h1, o1, h2, o2,
}: { title: string; h1: string; o1: string; h2: string; o2: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: '60px 72px',
        fontFamily: 'NotoSansKR',
      }}
    >
      {/* Top: headline label + brand */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 14, color: C.muted, letterSpacing: '0.22em', fontWeight: 700 }}>
            NEWSJEOUL
          </span>
          <span style={{ fontSize: 14, color: C.muted }}>같은 사건</span>
          <span style={{ fontSize: 30, fontWeight: 900, color: C.text, lineHeight: 1 }}>
            완전히 다른 헤드라인
          </span>
        </div>
        <span style={{ fontSize: 13, color: C.muted, letterSpacing: '0.08em' }}>
          당신이 못 본 절반
        </span>
      </div>

      {/* Center: two headlines side by side */}
      <div style={{ display: 'flex', flex: 1, gap: 0, marginTop: 40, marginBottom: 40 }}>

        {/* Left */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingRight: 44,
            borderRight: `1px solid ${C.line}`,
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: C.accent, fontWeight: 700, marginBottom: 14, letterSpacing: '0.06em' }}>
            {o1}
          </span>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>
            "{trunc(h1, 42)}"
          </span>
        </div>

        {/* Right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            paddingLeft: 44,
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: C.accent, fontWeight: 700, marginBottom: 14, letterSpacing: '0.06em' }}>
            {o2}
          </span>
          <span style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>
            "{trunc(h2, 42)}"
          </span>
        </div>
      </div>

      {/* Bottom: story context */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 15, color: C.text2, fontWeight: 500, maxWidth: 700 }}>
          {trunc(title, 65)}
        </span>
      </div>
    </div>
  )
}

// ── Card: 내가 못 본 절반 ────────────────────────────────────────
function MissingCard({ title, outlets, total }: { title: string; outlets: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        background: C.bg,
        padding: '60px 72px',
        fontFamily: 'NotoSansKR',
      }}
    >
      {/* Top */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, color: C.muted, letterSpacing: '0.22em', fontWeight: 700 }}>
          NEWSJEOUL
        </span>
        <span style={{ fontSize: 13, color: C.muted, letterSpacing: '0.08em' }}>
          당신이 못 본 절반
        </span>
      </div>

      {/* Middle */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ fontSize: 22, color: C.muted, fontWeight: 400 }}>
          당신이 놓쳤을 수 있는 시각
        </span>
        <div style={{ display: 'flex', borderLeft: `4px solid ${C.accent}`, paddingLeft: 24 }}>
          <span style={{ fontSize: 34, fontWeight: 700, color: C.text, lineHeight: 1.5 }}>
            {trunc(title, 52)}
          </span>
        </div>
      </div>

      {/* Bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 20, color: C.text2, fontWeight: 600 }}>
          {total}개 언론사 중 {outlets}개만 보도
        </span>
        <span style={{ fontSize: 14, color: C.muted }}>
          나머지 {total - outlets}개는 이 이야기를 다루지 않았습니다
        </span>
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
