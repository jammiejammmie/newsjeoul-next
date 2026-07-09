import { redirect } from 'next/navigation'

// 구브랜드("침묵지수") 상세 페이지 — 브랜드 Audit P3에 따라 사용 중지, 홈으로 redirect.
// v5 상세 구조로 재작성하기 전까지 이 라우트는 콘텐츠를 렌더링하지 않는다.
export default function StoryPage() {
  redirect('/')
}
