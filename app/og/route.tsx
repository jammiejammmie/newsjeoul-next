import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { colors } from '@/lib/design-tokens'
import { OG_CARD_SPECS, DEFAULT_OG_TYPE } from '@/lib/seo/og-card-spec'

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

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ── 브랜드 카드 — 브랜드 키트 "OG 이미지" 스펙(다크 배경 + 앰버 글로우 + 로고 마크) 그대로 ──
function BrandCard({ label, title }: { label: string; title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        background: colors.ink,
        position: 'relative',
        padding: '0 90px',
        gap: 56,
        fontFamily: 'NotoSansKR',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -140,
          right: -100,
          width: 520,
          height: 520,
          borderRadius: 260,
          background: `radial-gradient(circle, ${hexToRgba(colors.amber, 0.16)}, transparent 70%)`,
        }}
      />
      <svg width="120" height="90" viewBox="0 0 120 90" style={{ flexShrink: 0 }}>
        <line x1="60" y1="8" x2="60" y2="30" stroke={colors.amber} strokeWidth="3" />
        <circle cx="60" cy="6" r="5" fill={colors.bone} />
        <line x1="14" y1="30" x2="106" y2="30" stroke="rgba(243,239,230,0.6)" strokeWidth="3" />
        <circle cx="14" cy="30" r="16" fill="none" stroke={colors.blue} strokeWidth="4" />
        <circle cx="106" cy="30" r="16" fill="none" stroke={colors.amber} strokeWidth="4" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: colors.stone,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 20,
          }}
        >
          {label}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.3,
            color: colors.bone,
            maxWidth: 760,
          }}
        >
          {trunc(title, 60)}
        </div>
      </div>
    </div>
  )
}

// ── Route handler ────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const type = p.get('type') || DEFAULT_OG_TYPE
  const title = p.get('title') || '뉴스저울'
  const label = OG_CARD_SPECS[type]?.label || OG_CARD_SPECS[DEFAULT_OG_TYPE].label

  const allText = ['뉴스저울', label, title].join(' ')

  try {
    const [font700, font900] = await Promise.all([
      loadFont(allText, 700),
      loadFont(allText, 900),
    ])

    const fontConfig: { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 }[] = []
    if (font700) fontConfig.push({ name: 'NotoSansKR', data: font700, weight: 700 })
    if (font900) fontConfig.push({ name: 'NotoSansKR', data: font900, weight: 900 })

    return new ImageResponse(<BrandCard label={label} title={title} />, {
      width: 1200,
      height: 630,
      fonts: fontConfig,
    })
  } catch (e) {
    console.error('OG 생성 오류:', e)
    return new Response('OG image error', { status: 500 })
  }
}
