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
  const [editorialStatus, setEditorialStatus] = useState<any>(null)
  const [gateTopics, setGateTopics] = useState<any[]>([])
  const [gateFilter, setGateFilter] = useState<string>('all')

  useEffect(() => {
    const k = localStorage.getItem('nj_admin_key') || ''
    if (k) { setSavedKey(k); loadStats(); loadEditorialStatus(); loadGateTopics() }
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

  // Editorial Engine 상태 — 관리자 키 없이도(anon key) 조회 가능한 읽기 전용 패널.
  // 운영은 Cron이 자동으로 돌리므로, 이 패널은 "지금 어디까지 진행됐는지"만 보여주는 역할.
  async function loadEditorialStatus() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
      const countOf = async (status: string) => {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&editorial_status=eq.${status}`, { method: 'HEAD', headers })
        return parseInt((r.headers.get('content-range') || '/0').split('/')[1]) || 0
      }
      const today = new Date().toISOString().slice(0, 10)
      const [pending, planned, published, degraded, zRes] = await Promise.all([
        countOf('pending'), countOf('planned'), countOf('published'), countOf('degraded'),
        fetch(`${SUPABASE_URL}/rest/v1/daily_zeitgeist?date=eq.${today}&select=tags,generated_at`, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }),
      ])
      const zRows = await zRes.json().catch(() => [])
      setEditorialStatus({ pending, planned, published, degraded, zeitgeist: zRows[0] || null })
    } catch (e) {}
  }

  // Publish Gate 목록 — 관리자 키 없이도(anon key) 조회 가능한 읽기 전용 패널(설계서 §5).
  async function loadGateTopics() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?select=id,name,gate_status,editorial_status,ai_context,updated_at&editorial_status=eq.planned&order=updated_at.desc&limit=50`, { headers })
      const rows = await res.json()
      setGateTopics(Array.isArray(rows) ? rows : [])
    } catch (e) {}
  }

  async function overrideGate(topicId: string, newStatus: string) {
    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/override-gate-status`, {
        method: 'POST',
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_id: topicId, new_status: newStatus }),
      })
      const data = await res.json()
      if (res.ok) { addLog('success', `✅ Gate 수동 변경: ${newStatus}`); loadGateTopics() }
      else addLog('error', `❌ Gate 변경 실패: ${data.error}`)
    } catch (e: any) { addLog('error', `❌ 실패: ${e.message}`) }
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

  // Background Function은 202를 즉시 반환하고 본문이 없다 — Cron이 운영을 담당하고 이 버튼은
  // 개발·검증용 트리거일 뿐이므로 결과를 기다리지 않고 "접수됨"만 표시한 뒤 상태 패널 새로고침을 유도한다.
  const BACKGROUND_FUNCTIONS = new Set(['generate-zeitgeist-background', 'generate-editorial-plan-background', 'generate-editorial-draft-background', 'generate-relation-context-background', 'process-stories-background', 'resolve-topics-background', 'generate-publish-gate-background'])

  async function runFn(fnName: string, label: string) {
    setLoading(fnName)
    try {
      const res = await callFn(fnName)
      if (res.status === 401) { addLog('error', '❌ 관리자 키 오류'); setLoading(null); return }

      if (BACKGROUND_FUNCTIONS.has(fnName)) {
        if (res.status === 202 || res.ok) {
          addLog('success', `🚀 ${label}: 접수됨 — Background에서 실행 중(수 분 소요 가능). 잠시 후 아래 "Editorial Engine 상태" 새로고침으로 확인하세요.`)
          setTimeout(loadEditorialStatus, 15000)
        } else {
          addLog('error', `❌ ${label} 접수 실패: HTTP ${res.status}`)
        }
        setLoading(null)
        return
      }

      const data = await res.json()
      if (res.ok) {
        if (fnName === 'enrich-article-images') {
          addLog('success', `✅ ${label}: 대상 ${data.totalInWindow}건 중 이미지 보유 ${data.alreadyHasImage}건, 이번 실행 ${data.targetedThisRun}건 처리(토픽연결 우선 ${data.topicLinkedTargeted}건)`)
          addLog('info', `　성공 ${data.success} / og:image 없음 ${data.noOgImage} / URL미해제 ${data.resolveFailed} / Timeout ${data.timeout} / 차단(403 등) ${data.blocked} / 기타오류 ${data.otherError}`)
        } else if (fnName === 'resolve-article-urls') {
          addLog('success', `✅ ${label}: 미해제 ${data.totalPending}건 중 이번 실행 ${data.targetedThisRun}건 처리(토픽연결 우선 ${data.topicLinkedTargeted}건)`)
          addLog('info', `　해제 성공 ${data.resolved} / 중복 확정 ${data.duplicate} / 해제 실패(재시도 대기) ${data.resolveFailed} / 남은 미해제 ${data.remainingPending}`)
        } else {
          const detail = data.saved ? `${data.saved}건` : data.stories ? `${data.stories}개 스토리` : data.updated ? `${data.updated.length}개` : '완료'
          addLog('success', `✅ ${label}: ${detail}`)
        }
        loadStats()
      } else addLog('error', `❌ ${label} 실패: ${data.error}`)
    } catch(e: any) { addLog('error', `❌ 실패: ${e.message}`) }
    setLoading(null)
  }

  // 수집→처리→토픽매칭→관계생성까지 버튼 1번으로 (2026-07-10, 파이프라인 정상화 지시에 따라 확장).
  // 각 함수는 자체 BATCH_SIZE 제한이 있어 밀린 물량이 많으면 한 번에 다 못 비울 수 있음 —
  // 그 경우 이 버튼을 몇 번 더 누르면 이어서 처리된다. "점수 계산" 단계는 코드가 아직 없어(§6 진단 참고) 제외.
  async function runPipeline() {
    setLoading('pipeline')
    addLog('info', '⚡ 전체 파이프라인 시작...')
    try {
      // 1. 기사 수집
      const r1 = await callFn('collect-news')
      const d1 = await r1.json()
      if (r1.status === 401) { addLog('error', '❌ 관리자 키 오류'); setLoading(null); return }
      if (r1.ok) addLog('success', `✅ 기사 수집: ${d1.saved || 0}건 (원문 URL 해제 ${d1.urlResolved ?? 0}건, 실패 ${d1.urlFailed ?? 0}건)`)
      else addLog('error', `❌ 수집 실패: ${d1.error}`)

      addLog('info', '3초 후 스토리 처리...')
      await new Promise(r => setTimeout(r, 3000))

      // 2. 스토리 처리(Background Function — 202 즉시 반환, 실제 처리는 비동기로 계속됨)
      const r2 = await callFn('process-stories-background')
      if (r2.status === 202 || r2.ok) addLog('success', '🚀 스토리 처리: 접수됨 — Background에서 처리 중')
      else addLog('error', `❌ 스토리 처리 접수 실패: HTTP ${r2.status}`)

      addLog('info', '25초 후 토픽 매칭...')
      await new Promise(r => setTimeout(r, 25000))

      // 3. 토픽 매칭/생성(Background Function — 202 즉시 반환, 실제 처리는 비동기로 계속됨)
      const r3 = await callFn('resolve-topics-background')
      if (r3.status === 202 || r3.ok) addLog('success', '🚀 토픽 매칭: 접수됨 — Background에서 처리 중')
      else addLog('error', `❌ 토픽 매칭 접수 실패: HTTP ${r3.status}`)

      addLog('info', '25초 후 관계 생성...')
      await new Promise(r => setTimeout(r, 25000))

      // 4. Topic/Entity 관계 생성 (topic_relations/entity_relations)
      const r4 = await callFn('refresh-relationships')
      const d4 = await r4.json()
      if (r4.ok) addLog('success', `✅ 관계 생성: topic ${d4.topicRelationsCreated ?? 0}건, entity ${d4.entityRelationsCreated ?? 0}건`)
      else addLog('error', `❌ 관계 생성 실패: ${d4.error}`)

      addLog('info', '🎉 파이프라인 완료! (점수 계산 단계는 아직 미구현 — 별도 작업 필요)')
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
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>기사 수집 → 스토리 생성 → 토픽 매칭 → 관계 생성</div>
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
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('process-stories-background', '스토리 처리')} disabled={!!loading}>
          {loading === 'process-stories-background' ? '실행 중...' : '▶ 지금 실행'}
        </button>
      </div>

      {/* 기사 원문 URL 복구 — Google 뉴스 리다이렉트 링크 해제, 스케줄 없음(수동 실행 전용) */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🔗 기사 원문 URL 복구</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Google 뉴스 링크 → 실제 언론사 URL 해제(20건씩) — 이미지 보강보다 먼저 실행</div>
          </div>
          <div style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)' }}>수동 실행</div>
        </div>
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('resolve-article-urls', '원문 URL 복구')} disabled={!!loading}>
          {loading === 'resolve-article-urls' ? '실행 중...' : '▶ 지금 실행'}
        </button>
      </div>

      {/* 기사 이미지 보강 — og:image 백필, 스케줄 없음(수동 실행 전용) */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🖼️ 기사 이미지 보강</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>og_image_url 백필(원문 URL 해제된 기사 중 최근 14일, 15건씩)</div>
          </div>
          <div style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)' }}>수동 실행</div>
        </div>
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('enrich-article-images', '이미지 보강')} disabled={!!loading}>
          {loading === 'enrich-article-images' ? '실행 중...' : '▶ 지금 실행'}
        </button>
      </div>

      {/* Editorial Engine — Background Function + Cron 자동화(2026-07-11). 운영은 자동, 여기는 상태 확인 + 개발용 트리거 */}
      <div style={{ ...s.card, background: 'linear-gradient(135deg,rgba(185,140,255,.08),rgba(124,140,255,.06))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🖋️ Editorial Engine 상태</div>
          <button onClick={loadEditorialStatus} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
          운영은 Cron이 자동 실행(화두 매일 01:50, 계획·생성 3시간마다) — 아래 버튼은 개발·검증용 트리거
        </div>

        {editorialStatus && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
            {[
              ['미계획', editorialStatus.pending, 'var(--muted)'],
              ['계획수립', editorialStatus.planned, 'var(--blue,#7C8CFF)'],
              ['발행됨', editorialStatus.published, 'var(--green,#7CC2B8)'],
              ['강등', editorialStatus.degraded, 'var(--gold,#D9A441)'],
            ].map(([label, count, color]: any) => (
              <div key={label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color }}>{count}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
        {editorialStatus?.zeitgeist && (
          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 14, lineHeight: 1.6 }}>
            오늘의 화두: {(editorialStatus.zeitgeist.tags || []).join(', ')}
          </div>
        )}
        {editorialStatus && !editorialStatus.zeitgeist && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>오늘의 화두 아직 없음</div>
        )}

        <button style={{ ...s.btn('var(--card)', 'var(--text)'), marginBottom: 8 }} onClick={() => runFn('generate-zeitgeist-background', '① 오늘의 화두(개발용)')} disabled={!!loading}>
          {loading === 'generate-zeitgeist-background' ? '실행 중...' : '① 오늘의 화두 생성(개발용)'}
        </button>
        <button style={{ ...s.btn('var(--card)', 'var(--text)'), marginBottom: 8 }} onClick={() => runFn('generate-editorial-plan-background', '② 편집 계획(개발용)')} disabled={!!loading}>
          {loading === 'generate-editorial-plan-background' ? '실행 중...' : '② 편집 계획 수립(개발용, 10건씩)'}
        </button>
        <button style={{ ...s.btn('var(--card)', 'var(--text)'), marginBottom: 8 }} onClick={() => runFn('generate-editorial-draft-background', '③ 장문 생성(개발용)')} disabled={!!loading}>
          {loading === 'generate-editorial-draft-background' ? '실행 중...' : '③ 장문 생성+QA(개발용, 5건씩)'}
        </button>
        <button style={{ ...s.btn('var(--card)', 'var(--text)'), marginBottom: 8 }} onClick={() => runFn('generate-relation-context-background', '④ 관계 설명 생성(개발용)')} disabled={!!loading}>
          {loading === 'generate-relation-context-background' ? '실행 중...' : '④ 관계 설명 생성(개발용, Cron 미연결, published 5건씩)'}
        </button>
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('generate-publish-gate-background', '⑤ Publish Gate(개발용)')} disabled={!!loading}>
          {loading === 'generate-publish-gate-background' ? '실행 중...' : '⑤ Publish Gate 실행(개발용, Cron 미연결, planned 10건씩)'}
        </button>
      </div>

      {/* Publish Gate — 설계서 docs/newsjeoul-publish-gate-design.md §5 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🚪 Publish Gate</div>
          <button onClick={loadGateTopics} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          장문 생성 전 단계 — planned Topic이 publish_long으로 판정돼야 ③번 장문 생성 대상이 됩니다
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['all', 'pending_gate', 'publish_long', 'publish_short', 'hold', 'reject'].map((f) => (
            <button key={f} onClick={() => setGateFilter(f)} style={{
              fontSize: 10, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${gateFilter === f ? 'var(--accent)' : 'var(--border)'}`,
              background: gateFilter === f ? 'var(--accent-soft)' : 'var(--bg2)',
              color: gateFilter === f ? 'var(--accent)' : 'var(--muted)',
            }}>
              {f === 'all' ? '전체' : f}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
          {gateTopics
            .filter((t) => gateFilter === 'all' || t.gate_status === gateFilter)
            .map((t) => {
              const gate = t.ai_context?.gate
              const badgeColor: Record<string, string> = {
                DEEP_DIVE: 'var(--green,#7CC2B8)', SEARCH_GUIDE: 'var(--blue,#7C8CFF)',
                PRODUCT_BRIEF: 'var(--blue,#7C8CFF)', COMPARE: 'var(--violet,#B98CFF)',
                BACKGROUND: 'var(--violet,#B98CFF)', UPDATE: 'var(--gold,#D9A441)',
                SHORT_BRIEF: 'var(--gold,#D9A441)', REJECT: 'var(--muted)', pending_gate: 'var(--muted)',
              }
              return (
                <div key={t.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{t.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: badgeColor[t.gate_status] || 'var(--muted)' }}>{t.gate_status}</span>
                  </div>
                  {gate?.reasons && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{gate.reasons.join(' / ')}</div>
                  )}
                  {gate?.score?.target_length_hint && (
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>목표 분량: {gate.score.target_length_hint}</div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select onChange={(e) => e.target.value && overrideGate(t.id, e.target.value)} defaultValue="" style={{ fontSize: 10, padding: '4px 6px', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      <option value="">수정...</option>
                      <option value="DEEP_DIVE">DEEP_DIVE</option>
                      <option value="SEARCH_GUIDE">SEARCH_GUIDE</option>
                      <option value="PRODUCT_BRIEF">PRODUCT_BRIEF</option>
                      <option value="COMPARE">COMPARE</option>
                      <option value="BACKGROUND">BACKGROUND</option>
                      <option value="UPDATE">UPDATE</option>
                      <option value="SHORT_BRIEF">SHORT_BRIEF</option>
                      <option value="REJECT">REJECT</option>
                    </select>
                    <button onClick={() => overrideGate(t.id, 'DEEP_DIVE')} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)', cursor: 'pointer', fontFamily: 'inherit' }}>
                      DEEP_DIVE로 강제 지정
                    </button>
                  </div>
                </div>
              )
            })}
          {gateTopics.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>표시할 Topic 없음</div>}
        </div>
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
