import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 조회 기록 — 홈 "많이 본 이슈 24시간"의 데이터 출처.
//
// 왜 서버 라우트인가: anon key로 topic_reads를 직접 쓰게 하면 누구나 임의 값을 넣을 수 있다.
// 대신 DB 함수 record_topic_read(uuid)만 anon에 실행 권한을 줬다 — 그 함수는 +1만 할 수 있고
// 임의 값 주입이 불가능하다. 이 라우트는 그 함수를 호출하는 얇은 껍데기다.
//
// service key를 쓰지 않는 이유: 이 경로는 공개 트래픽이 때리는 곳이다. service key를 여기
// 끼워두면 실수 하나로 전권 키가 노출되는 표면이 생긴다. +1만 가능한 함수면 anon으로 충분하다.

export const dynamic = 'force-dynamic'

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

export async function POST(req: Request) {
  let topicId: unknown
  try {
    const body = await req.json()
    topicId = body?.topicId
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 })
  }

  // UUID 형식이 아니면 DB까지 보내지 않는다 — 형식 검증을 앞단에서 끝낸다.
  if (!isUuid(topicId)) {
    return NextResponse.json({ ok: false, error: 'invalid_topic_id' }, { status: 400 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { error } = await supabase.rpc('record_topic_read', { p_topic_id: topicId })
    if (error) {
      // 집계 실패가 페이지 동작을 막아선 안 된다. 조용히 실패하고 로그만 남긴다.
      console.error('record_topic_read 실패:', error.message)
      return NextResponse.json({ ok: false }, { status: 200 })
    }
    return NextResponse.json({ ok: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    console.error('record_topic_read 예외:', e?.message)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
