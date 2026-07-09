'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/topic', label: '이슈' },
  { href: '/search', label: '검색' },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(11,11,13,0.72)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1440,
        margin: '0 auto',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>

        <Link href="/" style={{
          textDecoration: 'none', fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em',
          color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span>⚖</span> 뉴스저울
        </Link>

        <div
          className="hidden sm:flex"
          style={{ alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--muted)', flex: 1, justifyContent: 'center' }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0,
          }} />
          오늘 세상의 무게가 실시간으로 기울고 있습니다
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                color: pathname === href ? 'var(--text)' : 'var(--muted)',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: pathname === href ? 700 : 600,
                padding: '6px 12px',
                borderRadius: 8,
                background: pathname === href ? 'var(--card)' : 'transparent',
                border: pathname === href ? '1px solid var(--border2)' : '1px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}
            >
              {label}
            </Link>
          ))}
        </div>

      </div>
    </nav>
  )
}
