import { DOC_SLUG_RENAMES } from '@/lib/hubs/doc-slug-renames'

// 문서 slug 교체 대장을 Netlify 함수가 읽을 수 있게 내보낸다.
//
// hub-targets.json과 같은 이유로 라우트다: 대장은 lib/hubs/*.ts에 있고 함수는 TS를 읽을 수
// 없다. 함수에 목록을 복사해 두면 두 벌이 되고, 한쪽만 고친 순간 리다이렉트와 DB가 어긋난다.
//
// 노출되는 건 이미 공개된 URL 두 개와 문서 제목뿐이라 비밀이 없다.
export const revalidate = 3600

export async function GET() {
  return Response.json(DOC_SLUG_RENAMES, {
    headers: { 'X-Robots-Tag': 'noindex' },
  })
}
