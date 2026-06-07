'use client'
import { useState, useEffect } from 'react'

const SITE_URL = 'https://newsjeoul.co.kr'

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('')
  const [savedKey, setSavedKey] = useState('')
  const [logEntries, setLogEntries] = useState<{time:string, type:string, msg:string}[]>([])
  const [loading, setLoading] = useState<string|null>(null)
  const [newsCount, setNewsCount] = useState<number|null>(null)
  const [pollsCount, setPollsCount] = useState<number|null>(null)

  const SUPABASE_URL = 'https://xlxztrnpmzklbnyfkrze.supabase.co'
  const SUPABASE_KEY = 'sb_publishable_RYLor2fbXqj4aHhSW0vCsw_7ZfP2a58'

  useEffect(() => {
    const k = localStorage.getItem('nj_admin_key') || ''
    if (k) { setSavedKey(k); loadStats() }
  }, [])

  function addLog(type: string, msg: string) {
    const now = new Date().toLocaleTimeString('ko-KR')
    setLogEntries(prev => [...prev, { time: now, type, msg }])
  }

  async function loadStats() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
      const today = new Date().toISOString().split('T')[0]
      const [r1, r2] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/news_kr?select=id&created_at=gte.${today}T00:00:00Z`, { method: 'HEAD', headers }),
        fetch(`${SUPABASE_URL}/rest/v1/polls_kr?select=id`, { method: 'HEAD', headers })
      ])
      const c1 = parseInt((r1.headers.get('content-range') || '/0').split('/')[1]) || 0
      const c2 = parseInt((r2.headers.get('content-range') || '/0').split('/')[1]) || 0
      setNewsCount(c1)
      setPollsCount(c2)
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

  async function runNews() {
    setLoading('news')
    try {
      const res = await callFn('fetch-comparisons-kr')
      const data = await res.json()
      if (res.status === 401) addLog('error', '❌ 관리자 키 오류')
      else if (res.ok) { addLog('success', `✅ 뉴스 비교 ${data.saved || 0}건 저장`); loadStats() }
      else addLog('error', `❌ 오류: ${data.error}`)
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  async function runElection() {
    setLoading('election')
    try {
      const res = await callFn('fetch-election-kr')
      const data = await res.json()
      if (res.status === 401) addLog('error', '❌ 관리자 키 오류')
      else if (res.ok) { addLog('success', `✅ 여론조사 ${data.saved || 0}건 저장`); loadStats() }
      else addLog('error', `❌ 오류: ${data.error}`)
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  async function runYoutube() {
    setLoading('youtube')
    try {
      const res = await callFn('update-youtube')
      const data = await res.json()
      if (res.ok) addLog('success', `✅ 유튜브 ${(data.updated||[]).length}개 채널 업데이트`)
      else addLog('error', `❌ 오류: ${data.error}`)
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  async function runAll() {
    setLoading('all')
    addLog('info', '⚡ 전체 실행 시작...')
    try {
      const r1 = await callFn('fetch-comparisons-kr')
      const d1 = await r1.json()
      if (r1.status === 401) { addLog('error', '❌ 관리자 키 오류'); setLoading(null); return }
      if (r1.ok) addLog('success', `✅ 뉴스 비교: ${d1.saved || 0}건 저장`)
      else addLog('error', `❌ 뉴스 비교 실패: ${d1.error}`)

      addLog('info', '3초 후 여론조사...')
      await new Promise(r => setTimeout(r, 3000))

      const r2 = await callFn('fetch-election-kr')
      const d2 = await r2.json()
      if (r2.ok) addLog('success', `✅ 여론조사: ${d2.saved || 0}건 저장`)
      else addLog('error', `❌ 여론조사 실패: ${d2.error}`)

      addLog('info', '3초 후 유튜브...')
      await new Promise(r => setTimeout(r, 3000))

      const r3 = await callFn('update-youtube')
      const d3 = await r3.json()
      if (r3.ok) addLog('success', `✅ 유튜브: ${(d3.updated||[]).length}개 채널`)
      else addLog('error', `❌ 유튜브 실패: ${d3.error}`)

      addLog('info', '🎉 전체 완료!')
      loadStats()
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  const s = {
    wrap: { maxWidth: 520, margin: '0 auto', padding: '20px 16px' } as const,
    logo: { fontFamily: "'Bebas Neue', cursive", fontSize: 24, marginBottom: 4 } as const,
    sub: { fontSize: 12, color: 'var(--muted)', marginBottom: 28 } as const,
    card: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 10 } as const,
    label: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: 'var(--muted)', marginBottom: 6, display: 'block' },
    input: { width: '100%', padding: '11px 13px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 12 } as const,
    btn: (bg: string) => ({ width: '100%', padding: 11, border: 'none', borderRadius: 10, background: bg, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 } as const),
    statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 } as const,
    statCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 } as const,
    statVal: { fontSize: 28, fontWeight: 700, lineHeight: 1, marginBottom: 4 } as const,
    statLabel: { fontSize: 11, color: 'var(--muted)' } as const,
    logArea: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, minHeight: 120, maxHeight: 260, overflowY: 'auto' as const, fontSize: 12, fontFamily: 'monospace', lineHeight: 1.7 } as const,
  }

  const logColors: Record<string, string> = { success: 'var(--green)', error: 'var(--con)', info: 'var(--lib)' }

  if (!savedKey) return (
    <div style={s.wrap}>
      <div style={s.logo}>뉴스<span style={{color:'var(--con)'}}>저</span><span style={{color:'var(--lib)'}}>울</span></div>
      <div style={s.sub}>관리자 페이지</div>
      <div style={s.card}>
        <div style={{fontSize:14,fontWeight:600,color:'var(--muted)',marginBottom:16}}>🔐 관리자 키를 입력하세요</div>
        <label style={s.label}>Admin Key</label>
        <input style={s.input} type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="관리자 키 입력..." />
        <button style={s.btn('var(--con)')} onClick={login}>로그인 →</button>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.logo}>뉴스<span style={{color:'var(--con)'}}>저</span><span style={{color:'var(--lib)'}}>울</span></div>
      <div style={s.sub}>관리자 페이지</div>

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,fontSize:13,color:'var(--text2)'}}>
        <span>안녕하세요, 관리자님 👋</span>
        <button onClick={()=>{localStorage.removeItem('nj_admin_key');setSavedKey('')}} style={{background:'none',border:'none',color:'var(--muted)',fontSize:11,cursor:'pointer'}}>로그아웃</button>
      </div>

      <div style={s.statGrid}>
        <div style={s.statCard}><div style={s.statVal}>{newsCount ?? '—'}</div><div style={s.statLabel}>오늘 뉴스 비교</div></div>
        <div style={s.statCard}><div style={s.statVal}>{pollsCount ?? '—'}</div><div style={s.statLabel}>여론조사 데이터</div></div>
      </div>

      {/* 전체 실행 */}
      <div style={{...s.card, background:'linear-gradient(135deg,var(--con-soft),var(--lib-soft))'}}>
        <div style={{fontSize:14,fontWeight:600,marginBottom:14}}>⚡ 전체 실행</div>
        <button style={s.btn('rgba(94,62,161,.8)')} onClick={runAll} disabled={!!loading}>
          {loading==='all' ? '실행 중...' : '⚡ 전체 실행'}
        </button>
      </div>

      {/* 뉴스 비교 */}
      <div style={s.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div><div style={{fontSize:14,fontWeight:600}}>📰 뉴스 비교</div><div style={{fontSize:12,color:'var(--muted)'}}>보수 vs 진보 AI 분석</div></div>
          <div style={{fontSize:10,padding:'3px 9px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:999,color:'var(--muted)'}}>오전9시/오후9시</div>
        </div>
        <button style={s.btn('var(--card)')} onClick={runNews} disabled={!!loading}>
          <span style={{color:'var(--text)',fontWeight:600}}>{loading==='news' ? '실행 중...' : '▶ 지금 실행'}</span>
        </button>
      </div>

      {/* 여론조사 */}
      <div style={s.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div><div style={{fontSize:14,fontWeight:600}}>🗳️ 여론조사</div><div style={{fontSize:12,color:'var(--muted)'}}>최신 여론조사 수집</div></div>
          <div style={{fontSize:10,padding:'3px 9px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:999,color:'var(--muted)'}}>오전9시/오후9시</div>
        </div>
        <button style={s.btn('var(--card)')} onClick={runElection} disabled={!!loading}>
          <span style={{color:'var(--text)',fontWeight:600}}>{loading==='election' ? '실행 중...' : '▶ 지금 실행'}</span>
        </button>
      </div>

      {/* 유튜브 */}
      <div style={s.card}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
          <div><div style={{fontSize:14,fontWeight:600}}>📺 유튜브 채널</div><div style={{fontSize:12,color:'var(--muted)'}}>최신 영상 정보 수집</div></div>
          <div style={{fontSize:10,padding:'3px 9px',background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:999,color:'var(--muted)'}}>매일 오전6시</div>
        </div>
        <button style={s.btn('var(--card)')} onClick={runYoutube} disabled={!!loading}>
          <span style={{color:'var(--text)',fontWeight:600}}>{loading==='youtube' ? '실행 중...' : '▶ 지금 실행'}</span>
        </button>
      </div>

      {/* 로그 */}
      <div style={s.card}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}>📋 실행 로그</div>
        <div style={s.logArea}>
          {logEntries.length === 0 ? <div style={{color:'var(--muted)',fontStyle:'italic'}}>실행 버튼을 누르면 결과가 여기에 표시됩니다.</div> :
            logEntries.map((e,i) => (
              <div key={i} style={{display:'flex',gap:10}}>
                <span style={{color:'var(--muted)',flexShrink:0}}>{e.time}</span>
                <span style={{color: logColors[e.type] || 'var(--text2)'}}>{e.msg}</span>
              </div>
            ))
          }
        </div>
      </div>

      <div style={{textAlign:'center',fontSize:11,color:'var(--muted)'}}><a href="/" style={{color:'var(--text2)',textDecoration:'none'}}>← 뉴스저울로 돌아가기</a></div>
    </div>
  )
}
