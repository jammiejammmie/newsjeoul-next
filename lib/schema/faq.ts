// 드로어의 "다음으로 이어지는 질문" 섹션 → FAQPage
// (질문-답변 쌍 구조가 실제로 FAQ와 일치하는 경우에만 사용 — topic 상세 페이지의 "관련 Topic"처럼
// 서버에서 이미 렌더되는 데이터에만 붙인다. 클라이언트에서만 로드되는 드로어 콘텐츠는 크롤러가
// 못 보므로 대상이 아님)

export function generateFaqSchema(items: { question: string; answer: string }[]) {
  if (items.length === 0) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}
