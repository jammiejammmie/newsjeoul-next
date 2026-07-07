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
