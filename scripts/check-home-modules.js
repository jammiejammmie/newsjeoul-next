// 홈 2a 모듈 인프라의 실제 적용 상태를 측정한다.
//
// 왜 필요한가: "마이그레이션 실행했다"는 말과 "DB에 반영됐다"는 사실은 다르다.
// 실제로 2026-08-05에 엉뚱한 파일(hubs_migration.sql)을 실행한 것을 적용 완료로 오인했다.
//
// ★ head:true를 쓰지 않는다 — count 조회는 표가 없어도 error를 내지 않고 count=null만
//   돌려주는 경우가 있어 "표 있음"으로 잘못 읽힌다(그 방식으로 한 번 오진했다).
//   컬럼을 실제로 select해서 error.code를 본다.

const { createClient } = require('@supabase/supabase-js')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 필요 (node --env-file=.env.local)')
  process.exit(1)
}
const s = createClient(url, key)

// 표가 없거나 스키마 캐시에 없을 때 나오는 코드들
const MISSING = ['42P01', 'PGRST205', 'PGRST204', '42703']

async function probe(table, column) {
  const { error } = await s.from(table).select(column).limit(1)
  if (!error) return { ok: true }
  return { ok: false, code: error.code, message: error.message }
}

async function main() {
  const checks = [
    ['③ 캘린더', 'upcoming_events', 'topic_id, event_date, title, kind, source_quote'],
    ['⑤ 조회수', 'topic_reads', 'topic_id, views, window_views, window_start'],
    ['⑥ 구독', 'email_subscribers', 'email'],
  ]

  let missing = 0
  console.log('\n=== 표·컬럼 ===')
  for (const [label, table, cols] of checks) {
    const r = await probe(table, cols)
    if (r.ok) console.log(`  OK   ${label} ${table} (${cols.split(',').length}개 컬럼 확인)`)
    else {
      missing++
      const why = MISSING.includes(r.code) ? '미적용' : '조회 실패'
      console.log(`  ★    ${label} ${table} — ${why} [${r.code}] ${r.message.slice(0, 70)}`)
    }
  }

  // ⑥은 email 컬럼만으로는 판단할 수 없다(원래 있던 표다). 추가 컬럼을 따로 본다.
  const sub = await probe('email_subscribers', 'source, keyword, status, created_at')
  if (sub.ok) console.log('  OK   ⑥ 구독 email_subscribers 보강 컬럼(source/keyword/status/created_at)')
  else { missing++; console.log(`  ★    ⑥ 구독 보강 컬럼 미적용 [${sub.code}] — ALTER 문이 실행되지 않았다`) }

  console.log('\n=== 함수 ===')
  const { error: rpcErr } = await s.rpc('record_topic_read', { p_topic_id: '00000000-0000-0000-0000-000000000000' })
  // 존재하지 않는 topic_id는 FK 위반(23503)이 정상 — 함수가 있다는 뜻이다.
  if (!rpcErr || rpcErr.code === '23503') console.log('  OK   record_topic_read() 존재')
  else { missing++; console.log(`  ★    record_topic_read() 없음 [${rpcErr.code}] ${rpcErr.message.slice(0, 70)}`) }

  console.log('\n=== 데이터 적재 ===')
  for (const t of ['upcoming_events', 'topic_reads']) {
    const { data, error } = await s.from(t).select('*').limit(3)
    if (error) console.log(`  -    ${t}: 표 없음(위 참고)`)
    else console.log(`  ${data.length ? 'OK  ' : '대기'} ${t}: ${data.length}건${data.length ? '' : ' — 적재 대기(추출 3시간 주기 / 조회는 트래픽 발생 시)'}`)
  }

  console.log(
    missing === 0
      ? '\n결론: 6개 모듈 인프라 전부 적용됨.\n'
      : `\n결론: ★ ${missing}건 미적용. Supabase SQL Editor에서 실행 필요:\n        C:\\newsjeoul-next\\supabase\\home_modules_migration.sql\n        (hubs_migration.sql이 아니다 — 다른 파일이다)\n`
  )
  process.exit(missing === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e.message); process.exit(1) })
