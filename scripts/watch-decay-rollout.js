// 신선도 감쇠가 실제로 적용되기를 기다린다.
//
// 고정 시간 sleep을 쓰지 않는 이유: cron이 밀릴 수 있고(과거 GH Actions에서 1.2~5.5배 밀렸다),
// 무게 재계산은 1회 실행에 80건씩만 처리한다. "몇 분 뒤"가 아니라 "실제로 적용됐는지"를
// 조건으로 기다려야 헛measure를 하지 않는다.
//
// 종료 조건: components.staleness_decay를 가진 활성 토픽이 MIN_APPLIED건 이상, 또는 타임아웃.

const { createClient } = require('@supabase/supabase-js')

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

const MIN_APPLIED = 40        // 상위권(HERO_SCOPE 60) 대부분이 갱신됐다고 볼 수 있는 선
const POLL_MS = 4 * 60 * 1000
const TIMEOUT_MS = 115 * 60 * 1000
const started = Date.now()

async function snapshot() {
  const { data, error } = await s
    .from('topics')
    .select('slug, name, importance_score, w:ai_context->weight')
    .eq('status', 'active')
    .order('importance_score', { ascending: false })
    .limit(200)
  if (error) return { err: error.message }

  const applied = (data || []).filter((t) => t.w?.components && 'staleness_decay' in t.w.components)
  const decayed = applied.filter((t) => (t.w.components.staleness_decay || 0) < 0)
  return {
    total: (data || []).length,
    applied: applied.length,
    decayed: decayed.length,
    top10: (data || []).slice(0, 10).map((t) => ({
      name: t.name, g: t.importance_score,
      decay: t.w?.components?.staleness_decay ?? null,
    })),
  }
}

async function evergreenState() {
  const out = {}
  for (const [k, table] of [['queue', 'evergreen_queue'], ['docs', 'hub_documents']]) {
    const { data } = await s.from(table).select('status').limit(1000)
    out[k] = (data || []).length
    if (k === 'queue') {
      const by = {}
      ;(data || []).forEach((r) => { by[r.status] = (by[r.status] || 0) + 1 })
      out.queueBreakdown = by
    }
  }
  const { data: hubs } = await s.from('hubs').select('slug, auto_generated')
  out.autoHubs = (hubs || []).filter((h) => h.auto_generated).length
  out.totalHubs = (hubs || []).length
  return out
}

async function tick() {
  const elapsed = Math.round((Date.now() - started) / 60000)
  const snap = await snapshot()
  if (snap.err) {
    console.log(`[+${elapsed}분] 조회 실패: ${snap.err}`)
  } else {
    const ev = await evergreenState()
    console.log(
      `[+${elapsed}분] 감쇠 적용 ${snap.applied}/${snap.total}건 (실제 감점 ${snap.decayed}건)` +
      ` | 큐 ${ev.queue}건 ${JSON.stringify(ev.queueBreakdown)} | 자동허브 ${ev.autoHubs}/${ev.totalHubs} | 문서 ${ev.docs}건`
    )
    if (snap.applied >= MIN_APPLIED) {
      console.log('\n=== 조건 충족: 감쇠 적용 확인 ===')
      console.log('상위 10 (감쇠 반영 후):')
      snap.top10.forEach((t, i) =>
        console.log(`  ${String(i + 1).padStart(2)}. ${String(t.g).padStart(3)}g  decay ${String(t.decay ?? '미적용').padStart(5)}  ${(t.name || '').slice(0, 30)}`)
      )
      console.log('\nDECAY_ROLLOUT_READY')
      process.exit(0)
    }
  }
  if (Date.now() - started > TIMEOUT_MS) {
    console.log('\n타임아웃 — 아직 충분히 적용되지 않았다. 측정 없이 종료한다(추측 보고 금지).')
    console.log('DECAY_ROLLOUT_TIMEOUT')
    process.exit(1)
  }
  setTimeout(tick, POLL_MS)
}

console.log(`감쇠 롤아웃 감시 시작 — 조건: 활성 상위 200건 중 ${MIN_APPLIED}건에 staleness_decay 적용`)
tick()
