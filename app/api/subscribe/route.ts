import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 이메일 구독 — 홈 "키워드로 새 뉴스 받기", 허브 "값이 바뀌면 알림" 폼의 수신부.
//
// 왜 service key인가: email_subscribers는 개인정보라 anon read를 주지 않았고(마이그레이션 참고),
// anon write도 주지 않았다. anon insert를 허용하면 누구나 임의 이메일을 대량 등록할 수 있고
// 그건 남의 주소로 스팸을 보내는 경로가 된다. 서버에서만 쓰게 두고 여기서 검증한다.
//
// SUPABASE_SERVICE_KEY는 Netlify 사이트 환경변수에 이미 있다(netlify/functions/*가 쓰는 값).
// 키가 없으면 500이 아니라 명확한 메시지를 돌려준다 — 조용히 실패하면 사용자는 구독됐다고 믿는다.

export const dynamic = 'force-dynamic'

// 실무적으로 충분한 검증만 한다. RFC 완전 준수 정규식은 실제 오탐이 더 많다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i
const MAX_EMAIL_LEN = 254 // RFC 5321 상한
const MAX_FIELD_LEN = 120

export async function POST(req: Request) {
  let email: unknown, source: unknown, keyword: unknown
  try {
    const body = await req.json()
    email = body?.email
    source = body?.source
    keyword = body?.keyword
  } catch {
    return NextResponse.json({ ok: false, error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (typeof email !== 'string' || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json({ ok: false, error: '이메일 주소를 확인해 주세요.' }, { status: 400 })
  }
  const normalized = email.trim().toLowerCase()
  const src = typeof source === 'string' ? source.slice(0, MAX_FIELD_LEN) : 'home'
  const kw = typeof keyword === 'string' && keyword.trim() ? keyword.trim().slice(0, MAX_FIELD_LEN) : null

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    // 구독됐다고 착각시키지 않는다 — 저장할 수 없으면 그렇다고 말한다.
    console.error('구독 실패: SUPABASE_SERVICE_KEY 없음')
    return NextResponse.json({ ok: false, error: '구독 기능이 아직 설정되지 않았습니다.' }, { status: 503 })
  }

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    const { error } = await supabase
      .from('email_subscribers')
      .insert({ email: normalized, source: src, keyword: kw, status: 'active' })

    if (error) {
      // 23505 = unique 위반. 이미 구독된 상태이므로 사용자에게는 성공으로 알린다 —
      // "이미 등록됨"을 노출하면 특정 주소의 구독 여부를 외부에서 알아낼 수 있다.
      if (error.code === '23505') {
        return NextResponse.json({ ok: true, already: true })
      }
      // 42703 = 컬럼 없음 → 마이그레이션 미적용. 원인을 명확히 알려준다.
      if (error.code === '42703') {
        console.error('구독 실패: email_subscribers 컬럼 누락 — home_modules_migration.sql 미적용')
        return NextResponse.json({ ok: false, error: '구독 기능이 아직 설정되지 않았습니다.' }, { status: 503 })
      }
      console.error('구독 저장 실패:', error.code, error.message)
      return NextResponse.json({ ok: false, error: '잠시 후 다시 시도해 주세요.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('구독 예외:', e?.message)
    return NextResponse.json({ ok: false, error: '잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }
}
