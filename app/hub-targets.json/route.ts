import { ALL_HUBS } from '@/lib/hubs'

// 에버그린 문서 생성 함수(netlify/functions/generate-hub-documents-background.js)가
// "어떤 문서를 써야 하는가"를 알아내는 목록.
//
// 왜 라우트인가: 파일럿 허브의 설정은 lib/hubs/*.ts에 있고 빌드에 컴파일된다. Netlify 함수는
// 그 TS를 읽을 수 없다. 빌드 스크립트로 JSON을 떨어뜨리는 방법도 있지만, 그러면 스크립트를
// 깜빡한 순간부터 목록이 조용히 낡는다. 앱이 직접 내보내면 레지스트리와 어긋날 수 없다.
//
// 공개 URL이지만 노출되는 건 이미 허브 페이지에 그대로 보이는 가이드 제목이다.
export const revalidate = 3600

// 2026-08-12: 항목을 제목 문자열에서 {title, slug} 객체로 바꿨다. 문서 URL을 사람이 정한
// 키워드로 두기 위해서다(생성 함수가 slug가 있으면 그대로 쓴다). 소비 측은 문자열 항목도
// 계속 받아들이므로, 배포 시차나 캐시로 옛 형식이 잠깐 남아도 생성이 멈추지 않는다.
export async function GET() {
  const items = (list: { title: string; slug?: string }[]) =>
    list.map((i) => ({ title: i.title, slug: i.slug }))

  const payload = ALL_HUBS.map((h) => ({
    slug: h.slug,
    title: h.title,
    kind: h.kind,
    items: {
      howto: items(h.evergreen.howto.items),
      troubleshoot: items(h.evergreen.troubleshoot.items),
      compare: items(h.evergreen.compare.items),
      buying: items(h.evergreen.buying.items),
    },
  }))
  return Response.json(payload, {
    headers: { 'X-Robots-Tag': 'noindex' },
  })
}
