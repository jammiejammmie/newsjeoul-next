'use client'
import { useState, useEffect } from 'react'

const SITE_URL = 'https://newsjeoul.co.kr'
const SUPABASE_URL = 'https://xlxztrnpmzklbnyfkrze.supabase.co'
const SUPABASE_KEY = 'sb_publishable_RYLor2fbXqj4aHhSW0vCsw_7ZfP2a58'

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [logs, setLogs] = useState<{time:string,type:string,msg:string}[]>([])
  const [loading, setLoading] = useState<string|null>(null)
  const [stats, setStats] = useState<any>({})

  useEffect(() => {
    const k = localStorage.getItem('nj_admin_key') || ''
    if (k) { setSavedKey(k); loadStats() }
  }, [])

  function addLog(type: string, msg: string) {
    const now = new Date().toLocaleTimeString('ko-KR')
    setLogs(prev => [...prev, { time: now, type, msg }])
  }

  async function loadStats() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
      const today = new Date().toISOString().split('T')[0]
      const [r1, r2, r3, r4] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/articles?select=id&created_at=gte.${today}T00:00:00Z`, { method: 'HEAD', headers }),
        fetch(`${SUPABASE_URL}/rest/v1/stories?select=id&created_at=gte.${today}T00:00:00Z`, { method: 'HEAD', headers }),
        fetch(`${SUPABASE_URL}/rest/v1/news_kr?select=id&created_at=gte.${today}T00:00:00Z`, { method: 'HEAD', headers }),
        fetch(`${SUPABASE_URL}/rest/v1/polls_kr?select=id`, { method: 'HEAD', headers }),
      ])
      setStats({
        articles: parseInt((r1.headers.get('content-range') || '/0').split('/')[1]) || 0,
        stories: parseInt((r2.headers.get('content-range') || '/0').split('/')[1]) || 0,
        news: parseInt((r3.headers.get('content-range') || '/0').split('/')[1]) || 0,
        polls: parseInt((r4.headers.get('content-range') || '/0').split('/')[1]) || 0,
      })
    } catch(e) {}
  }

  function login() {
    if (!adminKey.trim()) return
    localStorage.setItem('nj_admin_key', adminKey)
    setSavedKey(adminKey)
    addLog('info', '로그인 완료')
    loadStats()
  }

  async function callFn(fnName: string) {
    addLog('info', `${fnName} 실행 중...`)
    const res = await fetch(`${SITE_URL}/.netlify/functions/${fnName}`, {
      headers: { 'x-admin-key': savedKey }
    })
    return res
  }

  async function runFn(fnName: string, label: string) {
    setLoading(fnName)
    try {
      const res = await callFn(fnName)
      const data = await res.json()
      if (res.status === 401) addLog('error', '❌ 관리자 키 오류')
      else if (res.ok) {
        const detail = data.saved ? `${data.saved}건` : data.stories ? `${data.stories}개 스토리` : data.updated ? `${data.updated.length}개` : '완료'
        addLog('success', `✅ ${label}: ${detail}`)
        loadStats()
      } else addLog('error', `❌ ${label} 실패: ${data.error}`)
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  async function runPipeline() {
    setLoading('pipeline')
    addLog('info', '⚡ 전체 파이프라인 시작...')
    try {
      // 1. 기사 수집
      const r1 = await callFn('collect-news')
      const d1 = await r1.json()
      if (r1.status === 401) { addLog('error', '❌ 관리자 키 오류'); setLoading(null); return }
      if (r1.ok) addLog('success', `✅ 기사 수집: ${d1.saved || 0}건`)
      else addLog('error', `❌ 수집 실패: ${d1.error}`)

      addLog('info', '3초 후 스토리 처리...')
      await new Promise(r => setTimeout(r, 3000))

      // 2. 스토리 처리
      const r2 = await callFn('process-stories')
      const d2 = await r2.json()
      if (r2.ok) addLog('success', `✅ 스토리 생성: ${d2.stories || 0}개`)
      else addLog('error', `❌ 스토리 실패: ${d2.error}`)

      addLog('info', '🎉 파이프라인 완료!')
      loadStats()
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  const s = {
    wrap: { maxWidth: 560, margin: '0 auto', padding: '20px 16px' } as const,
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 10 } as const,
    btn: (bg: string, color = '#fff') => ({
      width: '100%', padding: 11, border: 'none', borderRadius: 10,
      background: bg, color, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      opacity: loading ? 0.6 : 1,
    } as const),
    statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 } as const,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 } as const,
    label: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 4, display: 'block' },
    input: { width: '100%', padding: '11px 13px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 12 } as const,
    logArea: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, minHeight: 120, maxHeight: 280, overflowY: 'auto' as const, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.7 } as const,
  }

  const logColors: Record<string, string> = { success: 'var(--green)', error: 'var(--rose)', info: 'var(--blue)', warn: 'var(--gold)' }

  if (!savedKey) return (
    <div style={s.wrap}>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, marginBottom: 4 }}>
        뉴스<span style={{color:'var(--accent)'}}>저</span><span style={{color:'var(--blue)'}}>울</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 28 }}>관리자 페이지</div>
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginBottom: 16 }}>🔐 관리자 키를 입력하세요</div>
        <label style={s.label}>Admin Key</label>
        <input style={s.input} type="password" value={adminKey}
          onChange={e => setAdminKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          placeholder="관리자 키 입력..." />
        <button style={s.btn('var(--accent)')} onClick={login}>로그인 →</button>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 24, marginBottom: 4 }}>
        뉴스<span style={{color:'var(--accent)'}}>저</span><span style={{color:'var(--blue)'}}>울</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>관리자 페이지</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, fontSize: 13, color: 'var(--text2)' }}>
        <span>안녕하세요, 관리자님 👋</span>
        <button onClick={() => { localStorage.removeItem('nj_admin_key'); setSavedKey('') }}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer' }}>로그아웃</button>
      </div>

      {/* 통계 */}
      <div style={s.statGrid}>
        <div style={s.statCard}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 }}>{stats.articles ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>오늘 수집 기사</div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 }}>{stats.stories ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>오늘 생성 스토리</div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 }}>{stats.news ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>뉴스 비교</div>
        </div>
        <div style={s.statCard}>
          <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 3 }}>{stats.polls ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>여론조사</div>
        </div>
      </div>

      {/* 2.0 파이프라인 */}
      <div style={{ ...s.card, background: 'linear-gradient(135deg,var(--accent-soft),rgba(124,140,255,.08))' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⚡ 2.0 전체 파이프라인</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>기사 수집 → 클러스터링 → 스토리 생성</div>
        <button style={s.btn('rgba(94,62,161,.8)')} onClick={runPipeline} disabled={!!loading}>
          {loading === 'pipeline' ? '실행 중...' : '⚡ 전체 실행'}
        </button>
      </div>

      {/* 기사 수집 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>📰 기사 수집</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>20개 언론사 구글 뉴스 RSS</div>
          </div>
          <div style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)' }}>매 3시간</div>
        </div>
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('collect-news', '기사 수집')} disabled={!!loading}>
          {loading === 'collect-news' ? '실행 중...' : '▶ 지금 실행'}
        </button>
      </div>

      {/* 스토리 처리 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🔗 스토리 처리</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>클러스터링 + 침묵지수 계산</div>
          </div>
          <div style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)' }}>매 3시간+30분</div>
        </div>
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('process-stories', '스토리 처리')} disabled={!!loading}>
          {loading === 'process-stories' ? '실행 중...' : '▶ 지금 실행'}
        </button>
      </div>

      {/* 기존 기능 */}
      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>📋 기존 기능</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('fetch-comparisons-kr', '뉴스 비교')} disabled={!!loading}>
            {loading === 'fetch-comparisons-kr' ? '실행 중...' : '📰 뉴스 비교 실행'}
          </button>
          <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('fetch-election-kr', '여론조사')} disabled={!!loading}>
            {loading === 'fetch-election-kr' ? '실행 중...' : '🗳️ 여론조사 실행'}
          </button>
          <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('update-youtube', '유튜브')} disabled={!!loading}>
            {loading === 'update-youtube' ? '실행 중...' : '📺 유튜브 업데이트'}
          </button>
        </div>
      </div>

      {/* 로그 */}
      <div style={s.card}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>📋 실행 로그</div>
        <div style={s.logArea}>
          {logs.length === 0
            ? <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>실행 버튼을 누르면 결과가 표시됩니다.</div>
            : logs.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{e.time}</span>
                <span style={{ color: logColors[e.type] || 'var(--text2)' }}>{e.msg}</span>
              </div>
            ))
          }
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
        <a href="/" style={{ color: 'var(--text2)', textDecoration: 'none' }}>← 뉴스저울로 돌아가기</a>
      </div>
    </div>
  )
}
