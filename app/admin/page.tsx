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
  const [editors, setEditors] = useState<any[]>([])
  const [editorTagFilter, setEditorTagFilter] = useState<string>('all')
  const [health, setHealth] = useState<any[]>([])
  const [distOps, setDistOps] = useState<any>(null)
  const [evolution, setEvolution] = useState<any>(null)
  const [commentReply, setCommentReply] = useState<any>(null)

  useEffect(() => {
    const k = localStorage.getItem('nj_admin_key') || ''
    if (k) { setSavedKey(k); loadStats(); loadEditorialStatus(); loadGateTopics(); loadEditors(); loadAutomationHealth(); loadDistributionOps(); loadEvolution(); loadCommentReply() }
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

  // Persona/에디터 관리(§관리자 UI, PM 지시 2026-07-17) — 관리자 키 없이도(anon key) 조회 가능한 읽기 전용 목록.
  async function loadEditors() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/editors?select=id,name,perspective_tag,specialty,domains,active,assignment_count,last_assigned_at,content_missions,avatar_emoji&order=assignment_count.desc`, { headers })
      const rows = await res.json()
      setEditors(Array.isArray(rows) ? rows : [])
    } catch (e) {}
  }

  async function toggleEditorActive(editorId: string, nextActive: boolean) {
    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/update-editor`, {
        method: 'POST',
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ editor_id: editorId, active: nextActive }),
      })
      const data = await res.json()
      if (res.ok) { addLog('success', `✅ 에디터 ${nextActive ? '활성화' : '비활성화'}`); loadEditors() }
      else addLog('error', `❌ 에디터 상태 변경 실패: ${data.error}`)
    } catch (e: any) { addLog('error', `❌ 실패: ${e.message}`) }
  }

  // Automation Health(PM 지시 2026-07-17 — "자동화가 며칠 멈춰 있어도 뒤늦게 발견하는 일" 방지).
  // Phase 2(cron_invocations 테이블) 배포 전까지는 각 단계가 실제 데이터에 남긴 타임스탬프로
  // 근사한다 — articles/stories/topics 생성시각, ai_context에 각 단계가 스스로 남긴
  // plan.generated_at/gate.evaluated_at/draft.generated_at/weight.computed_at, threads_posts.posted_at.
  async function loadAutomationHealth() {
    try {
      const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
      const [articlesRes, storiesRes, topicsRes, threadsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/articles?select=created_at&order=created_at.desc&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/stories?select=created_at&order=created_at.desc&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/topics?select=created_at,ai_context&status=eq.active&limit=300`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/threads_posts?select=posted_at&order=posted_at.desc&limit=1`, { headers }),
      ])
      const [articles, stories, topics, threads] = await Promise.all([articlesRes.json(), storiesRes.json(), topicsRes.json(), threadsRes.json()])

      const maxOf = (arr: any[]) => arr.length ? arr.reduce((m, v) => (v && v > m ? v : m), arr[0]) : null
      const planTimes = (topics || []).map((t: any) => t.ai_context?.plan?.generated_at).filter(Boolean)
      const gateTimes = (topics || []).map((t: any) => t.ai_context?.gate?.evaluated_at).filter(Boolean)
      const draftTimes = (topics || []).map((t: any) => t.ai_context?.draft?.generated_at).filter(Boolean)
      const weightTimes = (topics || []).map((t: any) => t.ai_context?.weight?.computed_at).filter(Boolean)
      const assignedCount = (topics || []).filter((t: any) => (t.ai_context?.plan?.editors_assigned || []).length > 0).length
      const plannedCount = (topics || []).filter((t: any) => t.ai_context?.plan).length

      const stageOf = (label: string, lastAt: string | null, expectedMin: number, detail?: string) => {
        if (!lastAt) return { label, status: 'unknown', lastAt: null, detail: detail || '기록 없음' }
        const minsSince = (Date.now() - new Date(lastAt).getTime()) / 60000
        const status = minsSince <= expectedMin * 1.5 ? 'ok' : minsSince <= expectedMin * 3 ? 'warn' : 'fail'
        return { label, status, lastAt, detail }
      }

      setHealth([
        stageOf('Collect News', maxOf(articles.map((a: any) => a.created_at)), 180),
        stageOf('Process Stories', maxOf(stories.map((s: any) => s.created_at)), 180),
        stageOf('Resolve Topics', maxOf(topics.map((t: any) => t.created_at)), 180),
        stageOf('Editorial Plan', maxOf(planTimes), 180),
        stageOf('Persona Assignment', maxOf(planTimes), 180, plannedCount ? `배정률 ${assignedCount}/${plannedCount}` : undefined),
        stageOf('Content Routing Gate', maxOf(gateTimes), 180),
        stageOf('Draft Generation', maxOf(draftTimes), 180),
        stageOf('Weight Engine', maxOf(weightTimes), 180),
        stageOf('Threads 게시', maxOf(threads.map((t: any) => t.posted_at)), 360),
      ])
    } catch (e) {}
  }

  // Distribution Engine 운영 대시보드(PM 지시 2026-07-22 — "코드가 맞는지"보다 "실제로 얼마나
  // 생산·유통했는지"를 관리자 화면에서 바로 볼 것). hero_history/distribution_run_log/
  // distribution_skip_log 테이블은 supabase/distribution_ops_logging_migration.sql 적용 전에는
  // 조회가 실패할 수 있으므로 테이블별로 개별 try/catch — 하나가 없어도 나머지는 정상 표시.
  async function loadDistributionOps() {
    const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00'

    const safeJson = async (url: string, extraHeaders?: any) => {
      try {
        const r = await fetch(url, { headers: { ...headers, ...extraHeaders } })
        if (!r.ok) return { ok: false, data: null }
        return { ok: true, data: await r.json() }
      } catch { return { ok: false, data: null } }
    }
    const safeCount = async (url: string) => {
      try {
        const r = await fetch(url, { method: 'HEAD', headers: { ...headers, Prefer: 'count=exact' } })
        if (!r.ok) return null
        return parseInt((r.headers.get('content-range') || '/0').split('/')[1]) || 0
      } catch { return null }
    }

    const [
      threadsPostedTodayCount,
      recentThreadsRes, heroNowRes, heroHistoryRes, runLogTodayRes, skipLogTodayRes, threadsPostsRes,
    ] = await Promise.all([
      safeCount(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&ai_context->threads->>posted_at=gte.${encodeURIComponent(todayStart)}`),
      safeJson(`${SUPABASE_URL}/rest/v1/topics?select=category,ai_context&status=eq.active&ai_context->threads->>posted_at=not.is.null&limit=30`),
      safeJson(`${SUPABASE_URL}/rest/v1/topics?select=id,name,importance_score,updated_at&status=eq.active&order=importance_score.desc&limit=1`),
      safeJson(`${SUPABASE_URL}/rest/v1/hero_history?select=*&order=changed_at.desc&limit=20`),
      safeJson(`${SUPABASE_URL}/rest/v1/distribution_run_log?select=*&run_at=gte.${encodeURIComponent(todayStart)}&order=run_at.desc&limit=30`),
      safeJson(`${SUPABASE_URL}/rest/v1/distribution_skip_log?select=reason,distribution_score,editorial_score&run_at=gte.${encodeURIComponent(todayStart)}&limit=1000`),
      safeJson(`${SUPABASE_URL}/rest/v1/threads_posts?select=*&order=posted_at.desc&limit=100`),
    ])

    // 오늘 새로 생성/갱신된 Topic 전체를 한 번에 가져와 Topic/장문/Expansion 신규 건수를 클라이언트에서 계산
    const updatedTodayRes = await safeJson(`${SUPABASE_URL}/rest/v1/topics?select=id,created_at,ai_context&updated_at=gte.${encodeURIComponent(todayStart)}&limit=500`)
    const updatedToday: any[] = updatedTodayRes.data || []
    const newTopicsToday = updatedToday.filter((t) => t.created_at >= todayStart).length
    const draftsToday = updatedToday.filter((t) => (t.ai_context?.draft?.generated_at || '') >= todayStart).length
    const expansionToday = updatedToday.reduce((sum, t) => sum + (t.ai_context?.expansion_drafts || []).filter((d: any) => (d.generated_at || '') >= todayStart).length, 0)

    const runRows: any[] = runLogTodayRes.data || []
    const dailyTarget = runRows[0]?.daily_target ?? null
    const attemptedSum = runRows.reduce((a, r) => a + (r.posts_attempted || 0), 0)
    const succeededSum = runRows.reduce((a, r) => a + (r.posts_succeeded || 0), 0)

    const lastPostedAt = (recentThreadsRes.data || [])
      .map((t: any) => t.ai_context?.threads?.posted_at)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null

    const skipRows: any[] = skipLogTodayRes.data || []
    const skipByReason: Record<string, number> = {}
    skipRows.forEach((r) => { skipByReason[r.reason] = (skipByReason[r.reason] || 0) + 1 })
    const distScores = skipRows.map((r) => r.distribution_score).filter((v) => typeof v === 'number')
    const editScores = skipRows.map((r) => r.editorial_score).filter((v) => typeof v === 'number')
    const stat = (arr: number[]) => arr.length ? { min: Math.min(...arr), max: Math.max(...arr), avg: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) } : null

    setDistOps({
      newTopicsToday, draftsToday, expansionToday,
      threadsPostedToday: threadsPostedTodayCount, dailyTarget, attemptedSum, succeededSum,
      lastPostedAt,
      heroNow: heroNowRes.data?.[0] || null,
      heroHistory: heroHistoryRes.data || [],
      skipByReason, distScoreStat: stat(distScores), editScoreStat: stat(editScores),
      skipTotal: skipRows.length,
      recentThreadsPosts: threadsPostsRes.data || [],
      migrationsMissing: {
        heroHistory: !heroHistoryRes.ok,
        runLog: !runLogTodayRes.ok,
        skipLog: !skipLogTodayRes.ok,
        threadsPostsExtended: threadsPostsRes.ok && (threadsPostsRes.data || []).length > 0 && threadsPostsRes.data[0].topic_id === undefined,
      },
    })
  }

  // Evolution Engine(마스터 스펙 v1 Track 2) — 갭 감지 제안 큐 + 최신 주간 리포트.
  // evolution_engine_migration.sql 적용 전에는 두 테이블 다 없어 조용히 빈 상태로 표시된다
  // (CHANGELOG.md BLOCKED 참고).
  async function loadEvolution() {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    const [proposalsRes, reportRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/proposed_event_types?select=*&status=eq.proposed&order=detected_at.desc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/weekly_reports?select=*&order=report_week_start.desc&limit=1`, { headers }),
    ])
    setEvolution({
      migrationPending: !proposalsRes.ok || !reportRes.ok,
      proposals: proposalsRes.ok ? await proposalsRes.json() : [],
      latestReport: reportRes.ok ? (await reportRes.json())[0] || null : null,
    })
  }

  // 댓글 자동응답 섀도우 모드(마스터 스펙 v1 Track 3) — 분류별 집계 + 설정 + 최근 로그.
  async function loadCommentReply() {
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    const [logRes, settingsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/comment_auto_reply_log?select=classification,exclusion_reason,detected_at&order=detected_at.desc&limit=500`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/comment_auto_reply_settings?select=*&limit=1`, { headers }),
    ])
    if (!logRes.ok || !settingsRes.ok) { setCommentReply({ migrationPending: true }); return }
    const logs = await logRes.json()
    const settings = (await settingsRes.json())[0] || null
    const byClassification: any = {}
    logs.forEach((l: any) => {
      const key = l.classification === 'auto_reply_eligible' ? 'auto_reply_eligible' : (l.exclusion_reason || 'needs_human_review')
      byClassification[key] = (byClassification[key] || 0) + 1
    })
    const oldestAt = logs.length ? logs[logs.length - 1].detected_at : null
    const daysOfData = oldestAt ? (Date.now() - new Date(oldestAt).getTime()) / 86400000 : 0
    setCommentReply({ migrationPending: false, total: logs.length, byClassification, settings, readyForLive: daysOfData >= 7 && logs.length > 0 })
  }

  async function toggleCommentReplyLive(nextLive: boolean) {
    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/update-comment-reply-settings`, {
        method: 'POST',
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_live: nextLive }),
      })
      const data = await res.json()
      if (res.ok) { addLog('success', `✅ 댓글 자동응답 ${nextLive ? '라이브' : '섀도우'} 전환`); loadCommentReply() }
      else addLog('error', `❌ 전환 실패: ${data.error}`)
    } catch (e: any) { addLog('error', `❌ 실패: ${e.message}`) }
  }

  async function approveProposal(proposalId: string) {
    try {
      const res = await fetch(`${SITE_URL}/.netlify/functions/approve-proposed-event-type`, {
        method: 'POST',
        headers: { 'x-admin-key': savedKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId }),
      })
      const data = await res.json()
      if (res.ok) { addLog('success', `✅ event_type 승인: ${data.event_type}`); loadEvolution() }
      else addLog('error', `❌ 승인 실패: ${data.error}`)
    } catch (e: any) { addLog('error', `❌ 실패: ${e.message}`) }
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
    loadStats(); loadEditorialStatus(); loadGateTopics(); loadEditors(); loadAutomationHealth(); loadDistributionOps(); loadEvolution(); loadCommentReply()
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
  const BACKGROUND_FUNCTIONS = new Set(['generate-zeitgeist-background', 'generate-editorial-plan-background', 'generate-editorial-draft-background', 'generate-relation-context-background', 'process-stories-background', 'resolve-topics-background', 'generate-publish-gate-background', 'update-topic-weight-background'])

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

      {/* Automation Health(PM 지시 2026-07-17) — 자동화가 며칠 멈춰도 뒤늦게 발견하는 일 방지 */}
      <div style={{ ...s.card, background: 'linear-gradient(135deg,rgba(124,140,255,.1),rgba(185,140,255,.06))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🩺 Automation Health</div>
          <button onClick={loadAutomationHealth} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          각 단계가 실제로 마지막 언제 성공했는지 — Phase 2(cron_invocations) 배포 전에는 데이터 타임스탬프로 근사치 표시
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {health.map((h) => {
            const dot = h.status === 'ok' ? '🟢' : h.status === 'warn' ? '🟡' : h.status === 'fail' ? '🔴' : '⚪'
            const minsAgo = h.lastAt ? Math.round((Date.now() - new Date(h.lastAt).getTime()) / 60000) : null
            return (
              <div key={h.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--bg2)', borderRadius: 8, fontSize: 12 }}>
                <span>{dot} {h.label}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {h.lastAt ? `${minsAgo}분 전${h.detail ? ' · ' + h.detail : ''}` : h.detail}
                </span>
              </div>
            )
          })}
          {health.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>불러오는 중...</div>}
        </div>
      </div>

      {/* Distribution Engine 운영 현황(PM 지시 2026-07-22) — 오늘 생산·유통량, Hero 변경 이력,
          Threads 목표/실적, 탈락 후보 사유·점수 분포를 한 화면에서 확인 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📡 Distribution Engine 운영 현황</div>
          <button onClick={loadDistributionOps} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        {!distOps ? (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>불러오는 중...</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
              {[
                ['오늘 신규 Topic', distOps.newTopicsToday],
                ['오늘 신규 장문', distOps.draftsToday],
                ['오늘 Expansion', distOps.expansionToday],
                ['Threads 목표', distOps.dailyTarget ?? '—'],
                ['Threads 게시', distOps.threadsPostedToday ?? '—'],
                ['성공률', distOps.attemptedSum ? `${Math.round((distOps.succeededSum / distOps.attemptedSum) * 100)}%` : '—'],
              ].map(([label, val]) => (
                <div key={label as string} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{val as any}</div>
                  <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              마지막 Threads 게시: {distOps.lastPostedAt ? new Date(distOps.lastPostedAt).toLocaleString('ko-KR') : '기록 없음'}
            </div>

            {/* Hero */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                🏆 현재 Hero: {distOps.heroNow ? `${distOps.heroNow.name} (${distOps.heroNow.importance_score}g)` : '—'}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 6 }}>
                마지막 변경: {distOps.heroHistory[0] ? new Date(distOps.heroHistory[0].changed_at).toLocaleString('ko-KR') : (distOps.migrationsMissing.heroHistory ? '마이그레이션 미적용' : '변경 이력 없음')}
              </div>
              {distOps.heroHistory.length > 0 && (
                <div style={{ ...s.logArea, minHeight: 0, maxHeight: 140, fontSize: 10.5 }}>
                  {distOps.heroHistory.map((h: any) => (
                    <div key={h.id}>
                      {new Date(h.changed_at).toLocaleString('ko-KR')} — {h.from_topic_name || '(없음)'}({h.from_importance_score ?? '-'}g) → {h.to_topic_name}({h.to_importance_score}g)
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 탈락 후보 사유·점수 분포 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                🚫 오늘 게시하지 않은 후보 {distOps.skipTotal}건{distOps.migrationsMissing.skipLog ? ' (마이그레이션 미적용)' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                {Object.entries(distOps.skipByReason).map(([reason, count]) => (
                  <span key={reason} style={{ fontSize: 10.5, padding: '3px 8px', background: 'var(--bg2)', borderRadius: 999, color: 'var(--muted)' }}>{reason}: {count as any}</span>
                ))}
                {distOps.skipTotal === 0 && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>없음</span>}
              </div>
              {(distOps.distScoreStat || distOps.editScoreStat) && (
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                  {distOps.distScoreStat && <>Distribution Score min/avg/max: {distOps.distScoreStat.min}/{distOps.distScoreStat.avg}/{distOps.distScoreStat.max}　</>}
                  {distOps.editScoreStat && <>Editorial Score min/avg/max: {distOps.editScoreStat.min}/{distOps.editScoreStat.avg}/{distOps.editScoreStat.max}</>}
                </div>
              )}
            </div>

            {/* 최근 Threads 게시 100건 */}
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
                📮 최근 Threads 게시({distOps.recentThreadsPosts.length}건){distOps.migrationsMissing.threadsPostsExtended ? ' — 상세 컬럼 마이그레이션 미적용' : ''}
              </div>
              <div style={{ ...s.logArea, minHeight: 0, maxHeight: 180, fontSize: 10.5 }}>
                {distOps.recentThreadsPosts.map((p: any) => (
                  <div key={p.id}>
                    {p.posted_at ? new Date(p.posted_at).toLocaleString('ko-KR') : '-'} · {p.hook_type || '-'} · dist={p.distribution_score ?? '-'} · edit={p.editorial_score ?? '-'} · <a href={p.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{p.post_id}</a>
                  </div>
                ))}
                {distOps.recentThreadsPosts.length === 0 && <div>기록 없음</div>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Evolution Engine(마스터 스펙 v1 Track 2) — 갭 감지 제안 큐 + 최신 주간 리포트 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🌱 Evolution Engine</div>
          <button onClick={loadEvolution} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        {!evolution ? (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>불러오는 중...</div>
        ) : evolution.migrationPending ? (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            evolution_engine_migration.sql 미적용 — supabase/evolution_engine_migration.sql 실행 필요(CHANGELOG.md BLOCKED 참고)
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
              🔔 제안된 새 카테고리({evolution.proposals.length}건)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {evolution.proposals.map((p: any) => (
                <div key={p.id} style={{ padding: '8px 10px', background: 'var(--bg2)', borderRadius: 8, fontSize: 11.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b>{p.event_type_name}</b>
                    <button onClick={() => approveProposal(p.id)}
                      style={{ fontSize: 10, padding: '3px 10px', background: 'var(--accent)', border: 'none', borderRadius: 999, color: '#000', cursor: 'pointer', fontWeight: 700 }}>
                      승인
                    </button>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 10.5, marginTop: 2 }}>{p.rationale}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
                    관점 후보: {(p.suggested_perspective_candidates || []).join(', ') || '-'} · 감지된 기사 {p.detected_article_count}건
                  </div>
                </div>
              ))}
              {evolution.proposals.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>제안된 카테고리 없음</div>}
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
              📊 최신 주간 리포트{evolution.latestReport ? ` (${evolution.latestReport.report_week_start}~)` : ''}
            </div>
            {evolution.latestReport ? (
              <div style={{ fontSize: 10.5 }}>
                <div style={{ color: 'var(--muted)', marginBottom: 4 }}>
                  카테고리 분포: {Object.entries(evolution.latestReport.category_distribution?.byCategory || {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '-'}
                </div>
                <div style={{ color: 'var(--muted)' }}>
                  0회 배정 perspective({(evolution.latestReport.zero_assignment_perspectives || []).length}개): {(evolution.latestReport.zero_assignment_perspectives || []).join(', ') || '없음'}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>아직 생성된 리포트 없음(매주 월요일 자동 생성)</div>
            )}
          </>
        )}
      </div>

      {/* 댓글 자동응답 섀도우 모드(마스터 스펙 v1 Track 3) — 실제 게시 코드는 아직 없음(의도적 단계 분리) */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>💬 댓글 자동응답 (섀도우 모드)</div>
          <button onClick={loadCommentReply} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        {!commentReply ? (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>불러오는 중...</div>
        ) : commentReply.migrationPending ? (
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            evolution_engine_migration.sql 미적용 — comment_auto_reply_log/settings 테이블 없음(CHANGELOG.md BLOCKED 참고)
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              실제 게시 코드는 아직 구현되지 않았습니다 — 이 화면은 "이렇게 답했을 것"만 기록한
              섀도우 로그입니다. is_live 토글은 향후 게시 기능이 구현된 뒤에 의미를 가집니다.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {Object.entries(commentReply.byClassification || {}).map(([k, v]: any) => (
                <div key={k} style={{ padding: '6px 10px', background: 'var(--bg2)', borderRadius: 8, fontSize: 11 }}>
                  {k} <b style={{ float: 'right' }}>{v}</b>
                </div>
              ))}
              {commentReply.total === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>기록된 댓글 없음</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {commentReply.readyForLive ? '✅ 7일치 이상 섀도우 로그 축적됨 — 검토 후 라이브 전환 가능' : '⏳ 7일치 섀도우 로그 축적 대기 중'}
                {' · 현재 상태: '}{commentReply.settings?.is_live ? '라이브' : '섀도우'}
              </span>
              <button onClick={() => toggleCommentReplyLive(!commentReply.settings?.is_live)}
                style={{ fontSize: 10, padding: '3px 10px', background: commentReply.settings?.is_live ? 'var(--bg2)' : 'var(--accent)', border: '1px solid var(--border)', borderRadius: 999, color: commentReply.settings?.is_live ? 'var(--text2)' : '#000', cursor: 'pointer', fontWeight: 700 }}>
                {commentReply.settings?.is_live ? '섀도우로 전환' : '라이브로 전환'}
              </button>
            </div>
          </>
        )}
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
        <button style={s.btn('var(--card)', 'var(--text)')} onClick={() => runFn('generate-publish-gate-background', '⑤ Content Routing Gate(개발용)')} disabled={!!loading}>
          {loading === 'generate-publish-gate-background' ? '실행 중...' : '⑤ Content Routing Gate 실행(개발용, planned 10건씩)'}
        </button>
        <button style={{ ...s.btn('var(--card)', 'var(--text)'), marginTop: 8 }} onClick={() => runFn('update-topic-weight-background', '⑥ 무게(g) 재산정(개발용)')} disabled={!!loading}>
          {loading === 'update-topic-weight-background' ? '실행 중...' : '⑥ 무게(g) 재산정 실행(개발용, active 25건씩)'}
        </button>
      </div>

      {/* Publish Gate — 설계서 docs/newsjeoul-publish-gate-design.md §5 */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🚪 Content Routing Gate</div>
          <button onClick={loadGateTopics} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          planned Topic을 8종으로 분류(DEEP_DIVE만 현재 ③번 장문 생성行, 나머지는 분류·저장까지만)
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['all', 'pending_gate', 'DEEP_DIVE', 'SEARCH_GUIDE', 'PRODUCT_BRIEF', 'COMPARE', 'BACKGROUND', 'UPDATE', 'SHORT_BRIEF', 'REJECT'].map((f) => (
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

      {/* Persona/에디터 관리(PM 지시 2026-07-17) — 100명 Editorial Persona Registry */}
      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>🖊️ Persona/에디터 관리</div>
          <button onClick={loadEditors} style={{ fontSize: 10, padding: '3px 9px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--muted)', cursor: 'pointer' }}>
            ↻ 새로고침
          </button>
        </div>
        {editors.length > 0 && (() => {
          const activeCount = editors.filter((e) => e.active).length
          const unassignedCount = editors.filter((e) => (e.assignment_count || 0) === 0).length
          const counts = editors.map((e) => e.assignment_count || 0)
          const avg = counts.reduce((a, b) => a + b, 0) / (counts.length || 1)
          const overAssigned = editors.filter((e) => (e.assignment_count || 0) > avg * 3 && avg > 0)
          const tags = ['all', ...Array.from(new Set(editors.map((e) => e.perspective_tag)))]
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{editors.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>전체 ({activeCount} 활성)</div>
                </div>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: unassignedCount > 0 ? 'var(--gold,#D9A441)' : 'var(--green,#7CC2B8)' }}>{unassignedCount}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>미배정(0회)</div>
                </div>
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: overAssigned.length > 0 ? 'var(--gold,#D9A441)' : 'var(--text)' }}>{overAssigned.length}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>과다배정(평균 3배↑)</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, maxHeight: 70, overflowY: 'auto' }}>
                {tags.map((tag) => (
                  <button key={tag} onClick={() => setEditorTagFilter(tag)} style={{
                    fontSize: 10, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${editorTagFilter === tag ? 'var(--accent)' : 'var(--border)'}`,
                    background: editorTagFilter === tag ? 'var(--accent-soft)' : 'var(--bg2)',
                    color: editorTagFilter === tag ? 'var(--accent)' : 'var(--muted)',
                  }}>
                    {tag === 'all' ? '전체' : tag}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
                {editors
                  .filter((e) => editorTagFilter === 'all' || e.perspective_tag === editorTagFilter)
                  .map((e) => (
                    <div key={e.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', opacity: e.active ? 1 : 0.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{e.avatar_emoji || '👤'} {e.name} · {e.perspective_tag}</span>
                        <span style={{ fontSize: 10, color: 'var(--muted)' }}>배정 {e.assignment_count || 0}회</span>
                      </div>
                      {e.specialty && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{e.specialty}</div>}
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>담당: {(e.domains || []).join(', ') || '(없음)'}</div>
                      <button onClick={() => toggleEditorActive(e.id, !e.active)} style={{ fontSize: 10, padding: '4px 8px', borderRadius: 6, background: e.active ? 'var(--bg)' : 'var(--accent-soft)', color: e.active ? 'var(--muted)' : 'var(--accent)', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {e.active ? '비활성화' : '활성화'}
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )
        })()}
        {editors.length === 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>표시할 에디터 없음 — 새로고침을 눌러보세요</div>}
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
