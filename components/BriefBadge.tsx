// 단문 Topic 표시 배지(PM 지시 2026-08-03 — "단문 토픽은 목록에서 Brief 배지로 장문과 구분").
//
// 배경: Content Routing Gate가 분류한 6개 비장문 유형(SHORT_BRIEF/UPDATE/SEARCH_GUIDE/
// BACKGROUND/PRODUCT_BRIEF/COMPARE)을 publish-routed-content-background가 발행하기 시작하면서
// 목록에 장문(1000~1600자)과 단문(370~1500자, 대부분 500~700자)이 섞이게 됐다. 독자가 클릭 전에
// 글의 분량을 예상할 수 있도록 구분한다.
//
// 판별은 lib/topics.ts의 isBriefTopic() 하나만 쓴다(화면마다 조건이 갈라지지 않게).
// 스타일을 컴포넌트로 뽑은 이유도 같다 — 목록이 4곳(홈 side/홈 인덱스/전체 이슈/카테고리)이라
// 각자 인라인 스타일로 쓰면 금방 서로 달라진다.
//
// 색은 카테고리 배지(반투명 검정)와 겹치지 않게 중립 회색 톤을 쓴다. 브랜드 강조색(--accent)은
// 무게·중요도 신호에 이미 쓰이고 있어서, 분량 표시에 같은 색을 쓰면 "중요하다"는 오독을 만든다.
export default function BriefBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const compact = size === 'sm'
  return (
    <span
      title="짧게 정리한 단문입니다"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        flexShrink: 0,
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: compact ? 9 : 9.5,
        fontWeight: 700,
        letterSpacing: '.06em',
        lineHeight: 1,
        padding: compact ? '3px 5px' : '3px 6px',
        borderRadius: 4,
        color: 'var(--muted)',
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        textTransform: 'uppercase',
      }}
    >
      Brief
    </span>
  )
}
