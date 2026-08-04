import { NextResponse } from 'next/server'
import { findAffiliateSlot } from '@/lib/hubs'

// 제휴 링크 리다이렉트 — 설계서 §8.1 "상품 1개 = 링크 슬롯 1개".
//
// 본문에 네트워크 URL을 직접 박지 않고 이 경로만 가리키게 하는 이유:
//  · 네트워크를 갈아타도 본문 수정이 0이다(슬롯 설정만 바꾼다).
//  · 클릭을 슬롯 단위로 집계할 수 있다 — 어느 문서가 버는지 파악하는 유일한 방법.
//  · 죽은 링크를 한 곳에서 차단할 수 있다(§8.2 헬스체크).
//
// 색인 정책: 이 경로는 검색엔진이 따라갈 이유가 없고 따라가면 안 된다.
// robots.ts에서 /go/를 disallow하고, 응답에도 noindex를 붙인다.
// 본문 쪽 <a>에는 rel="sponsored nofollow"를 반드시 넣는다(§8.1 — 누락 시 페널티 사유).

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slot: string }> }) {
  const { slot } = await ctx.params
  const found = findAffiliateSlot(slot)

  // 등록되지 않은 슬롯 — 오픈 리다이렉터가 되지 않도록 임의 URL 전달은 절대 받지 않는다.
  if (!found) {
    return new NextResponse('알 수 없는 링크입니다.', {
      status: 404,
      headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const { entry } = found

  // 아직 실제 제휴 URL이 채워지지 않은 슬롯. 검증되지 않은 추적 URL을 임의로 만들어 넣지
  // 않는 것이 원칙이므로, 이 상태에서는 어디로도 보내지 않고 그 사실을 그대로 알린다.
  if (!entry.targetUrl) {
    return new NextResponse(
      `"${entry.label}" 제휴 링크가 아직 연결되지 않았습니다.\n` +
      `lib/hubs/${found.hub.slug}.ts의 affiliate 항목에 targetUrl을 넣으면 활성화됩니다.`,
      {
        status: 404,
        headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Content-Type': 'text/plain; charset=utf-8' },
      }
    )
  }

  // 302(임시) — 목적지가 네트워크 사정으로 바뀔 수 있으므로 영구 리다이렉트를 쓰지 않는다.
  // 301로 두면 브라우저·중간 캐시가 옛 목적지를 오래 기억해 링크 교체가 즉시 반영되지 않는다.
  return NextResponse.redirect(entry.targetUrl, {
    status: 302,
    headers: {
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  })
}
