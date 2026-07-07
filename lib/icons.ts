// 가벼운 시각 레이어 — 이미지/외부 API 없이 이모지만으로 타입/국가를 구분한다.

const TYPE_ICON: Record<string, string> = {
  company: '🏢',
  person: '👤',
  organization: '🏛',
  country: '🌍',
  product: '📦',
  technology: '⚙️',
  market: '📈',
  policy: '📜',
}

const COUNTRY_FLAG: Record<string, string> = {
  '한국': '🇰🇷', '대한민국': '🇰🇷',
  '미국': '🇺🇸',
  '일본': '🇯🇵',
  '중국': '🇨🇳',
  '북한': '🇰🇵',
  '이란': '🇮🇷',
  '이스라엘': '🇮🇱',
  '러시아': '🇷🇺',
  '우크라이나': '🇺🇦',
  '영국': '🇬🇧',
  '프랑스': '🇫🇷',
  '독일': '🇩🇪',
  '인도': '🇮🇳',
  '대만': '🇹🇼',
  '아르헨티나': '🇦🇷',
  '브라질': '🇧🇷',
}

export function entityIcon(type: string, name?: string) {
  if (type === 'country' && name && COUNTRY_FLAG[name]) return COUNTRY_FLAG[name]
  return TYPE_ICON[type] || '🔹'
}

const CATEGORY_ICON: Record<string, string> = {
  '정치': '🏛️', '경제': '📈', '사회': '👥', 'IT': '💻', 'AI': '🤖',
  '반도체': '🔬', '자동차': '🚗', '게임': '🎮', '스포츠': '⚽', '문화': '🎭',
  '교육': '📚', '건강': '🏥', '환경': '🌱', '국제': '🌍', '부동산': '🏠',
  '금융': '💰', '엔터테인먼트': '🎬', '과학': '🔭',
}

export function categoryIcon(category: string) {
  return CATEGORY_ICON[category] || '🗂️'
}

// 뉴스저울 시그니처 카드용 — 이름을 해시해 브랜드 팔레트 안에서 그라디언트를 결정적으로 고른다 (이미지 없음)
const GRADIENTS = [
  'linear-gradient(135deg, var(--accent), var(--data-warm))',
  'linear-gradient(135deg, var(--data-cool), var(--purple))',
  'linear-gradient(135deg, var(--green), var(--data-cool))',
  'linear-gradient(135deg, var(--data-warm), var(--gold))',
  'linear-gradient(135deg, var(--purple), var(--accent))',
  'linear-gradient(135deg, var(--gold), var(--data-cool))',
]

export function seedGradient(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return GRADIENTS[hash % GRADIENTS.length]
}
