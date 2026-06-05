'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

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
      background: theme === 'dark' ? 'rgba(8,8,8,.96)' : 'rgba(245,244,239,.96)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      height: 56,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      gap: 8,
    }}>
      <Link href="/" style={{
        fontFamily: "'Bebas Neue', cursive",
        fontSize: 26,
        color: 'var(--text)',
        textDecoration: 'none',
        flexShrink: 0,
      }}>
        ⚖️ 뉴스<span style={{color:'var(--con)'}}>저</span><span style={{color:'var(--lib)'}}>울</span>
      </Link>

      {/* 데스크탑 메뉴 */}
      <div style={{display:'flex',gap:2,marginLeft:'auto',alignItems:'center'}}>
        {[
          {href:'/',label:'메인'},
          {href:'/election',label:'🗳️ 선거결과'},
          {href:'/youtube',label:'📺 유튜브'},
          {href:'/media101',label:'📖 미디어101'},
        ].map(({href,label}) => (
          <Link key={href} href={href} style={{
            color: pathname === href ? 'var(--text)' : 'var(--muted)',
            background: pathname === href ? 'var(--card)' : 'transparent',
            textDecoration: 'none',
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
          }}
          className="hidden sm:inline-flex"
          >
            {label}
          </Link>
        ))}
        <button onClick={toggleTheme} style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          width: 30, height: 30,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 13,
          cursor: 'pointer',
          flexShrink: 0,
        }}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>
    </nav>
  )
}
