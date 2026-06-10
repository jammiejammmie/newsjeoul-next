'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const navLinks = [
  { href: '/',         label: '오늘의 뉴스' },
  { href: '/election', label: '선거 결과' },
  { href: '/youtube',  label: '유튜브' },
  { href: '/media101', label: '미디어 101' },
]

export default function Nav() {
  const pathname = usePathname()
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const saved = localStorage.getItem('nj_theme') || 'dark'
    setTheme(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('nj_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <nav style={{
      background: theme === 'dark' ? 'rgba(8,8,8,.95)' : 'rgba(245,244,239,.95)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      height: 56,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 24px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
      }}>

        {/* Wordmark */}
        <Link href="/" style={{ textDecoration: 'none', flexShrink: 0, marginRight: 'auto' }}>
          <span style={{
            fontFamily: "'Bebas Neue', cursive",
            fontSize: 22,
            letterSpacing: '.06em',
            color: 'var(--text)',
            display: 'block',
            lineHeight: 1,
          }}>
            뉴스저울
          </span>
          <span style={{
            fontSize: 9,
            letterSpacing: '.1em',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            display: 'block',
            marginTop: 1,
          }}
            className="hidden sm:block"
          >
            당신이 못 본 절반
          </span>
        </Link>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="hidden md:inline-flex"
              style={{
                color: pathname === href ? 'var(--text)' : 'var(--muted)',
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: pathname === href ? 600 : 400,
                padding: '5px 10px',
                borderRadius: 8,
                background: pathname === href ? 'var(--card)' : 'transparent',
                border: pathname === href ? '1px solid var(--border)' : '1px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color .15s',
              }}
            >
              {label}
            </Link>
          ))}

          <button
            onClick={toggleTheme}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              width: 32,
              height: 32,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              cursor: 'pointer',
              marginLeft: 8,
              flexShrink: 0,
            }}
          >
            {theme === 'dark' ? '○' : '●'}
          </button>
        </div>

      </div>
    </nav>
  )
}
