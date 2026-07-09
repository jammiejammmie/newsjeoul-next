'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', icon: '⚖️', label: '오늘' },
  { href: '/topic', icon: '🧭', label: '이슈' },
  { href: '/search', icon: '🔍', label: '검색' },
]

export default function BottomTab() {
  const pathname = usePathname()

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 64,
      background: 'var(--card)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      zIndex: 100,
      backdropFilter: 'blur(16px)',
    }}>
      {tabs.map(({ href, icon, label }) => {
        const active = pathname === href
        return (
          <Link key={href} href={href} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            textDecoration: 'none',
            color: active ? 'var(--accent)' : 'var(--muted)',
            fontSize: 10,
            fontWeight: active ? 700 : 400,
            padding: '6px 0',
            transition: 'color .15s',
          }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
