// 전기차 구매 보조금 계산 로직 — 허브 /hub/ev-subsidy의 도구.
//
// 계산 구조는 실제 제도를 따른다:
//   실구매가 = 차량가 − (국고보조금 + 지자체보조금) − 세제감면
//   · 국고보조금은 차량가 구간에 따라 지급률이 달라진다(고가 차량은 감액·제외)
//   · 지자체보조금은 지역별 단가가 다르고, 국고 대비 비율로 정해지는 지역이 많다
//   · 취득세는 전기차 감면 상한이 있다
//
// ★ 이 파일의 수치는 제도 구조를 재현하기 위한 기준값이며, 공고마다 바뀐다.
//   실제 발행 전 에디터가 공고 원문으로 검증해야 한다(허브 config의 needsEditorVerification과 같은 성격).
//   구조와 값을 분리해 둔 이유가 그것이다 — 값만 갈아끼우면 계산은 그대로 맞는다.

/** 국고보조금 차량가 구간별 지급률(실제 제도의 가격 구간 차등 구조). */
export const NATIONAL_PRICE_TIERS = [
  { maxPrice: 53_000_000, rate: 1.0, label: '5,300만원 미만 — 전액' },
  { maxPrice: 85_000_000, rate: 0.5, label: '5,300만~8,500만원 — 50% 감액' },
  { maxPrice: Infinity, rate: 0, label: '8,500만원 이상 — 지원 제외' },
] as const

/** 지자체 보조금 — 국고 대비 비율(지역별 공고값). 값은 공고마다 바뀐다. */
export const LOCAL_RATES: Record<string, number> = {
  서울: 0.30,
  경기: 0.45,
  인천: 0.55,
  부산: 0.55,
  대구: 0.60,
  광주: 0.60,
  대전: 0.55,
  울산: 0.60,
  세종: 0.45,
  강원: 0.70,
  충북: 0.70,
  충남: 0.70,
  전북: 0.75,
  전남: 0.75,
  경북: 0.70,
  경남: 0.70,
  제주: 0.50,
}

export const NATIONAL_BASE = 6_500_000 // 승용 전기차 국고보조금 상한(기준값)
export const ACQUISITION_TAX_RATE = 0.07 // 취득세율
export const ACQUISITION_TAX_CAP = 1_400_000 // 전기차 취득세 감면 상한

export type EvSubsidyInput = {
  /** 차량 가격(원) — 부가세 포함 판매가 */
  vehiclePrice: number
  region: string
  /** 성능(주행거리·효율) 계수 0~1. 공고의 성능별 차등을 반영한다. */
  performanceRatio?: number
  /** 개인 취득세 감면 적용 여부 */
  applyTaxCut?: boolean
}

export type EvSubsidyResult = {
  vehiclePrice: number
  tier: string
  nationalSubsidy: number
  localSubsidy: number
  totalSubsidy: number
  taxCut: number
  /** 보조금·세제 반영 후 실제 부담액 */
  netPrice: number
  /** 계산 근거를 한 줄씩 남긴다 — 숫자만 보여주면 검증할 수 없다. */
  breakdown: string[]
  /** 지원 제외 등 사용자가 알아야 하는 사실 */
  notes: string[]
}

const won = (n: number) => n.toLocaleString('ko-KR')

export function calcEvSubsidy(input: EvSubsidyInput): EvSubsidyResult {
  // Number()로 한 번 통과시킨다. `x || 0`만으로는 문자열이 그대로 넘어가 Math.round가 NaN을
  // 내고, 그 NaN이 화면에 "NaN원"으로 찍힌다(테스트 22가 잡은 실제 경로).
  const num = (v: unknown, fallback: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const price = Math.max(0, Math.round(num(input.vehiclePrice, 0)))
  const perf = Math.min(1, Math.max(0, num(input.performanceRatio, 1)))
  const breakdown: string[] = []
  const notes: string[] = []

  const tier = NATIONAL_PRICE_TIERS.find((t) => price < t.maxPrice) ?? NATIONAL_PRICE_TIERS[NATIONAL_PRICE_TIERS.length - 1]

  // 국고보조금 = 상한 × 가격구간 지급률 × 성능계수
  const nationalSubsidy = Math.floor(NATIONAL_BASE * tier.rate * perf)
  breakdown.push(`국고보조금 ${won(NATIONAL_BASE)}원 × 가격구간 ${Math.round(tier.rate * 100)}% × 성능 ${Math.round(perf * 100)}% = ${won(nationalSubsidy)}원`)
  if (tier.rate === 0) notes.push('차량가가 국고보조금 지원 상한을 넘어 국고·지자체 보조금 모두 받을 수 없습니다.')
  else if (tier.rate < 1) notes.push('차량가가 감액 구간에 들어 국고보조금이 절반만 지급됩니다.')

  // 지자체보조금 = 국고보조금 × 지역 비율 (국고가 0이면 지자체도 0)
  const localRate = LOCAL_RATES[input.region] ?? 0
  const localSubsidy = Math.floor(nationalSubsidy * localRate)
  if (LOCAL_RATES[input.region] === undefined) {
    notes.push(`'${input.region}' 지역 공고값이 없어 지자체 보조금을 0으로 계산했습니다.`)
  }
  breakdown.push(`지자체보조금 ${won(nationalSubsidy)}원 × ${input.region} ${Math.round(localRate * 100)}% = ${won(localSubsidy)}원`)

  const totalSubsidy = nationalSubsidy + localSubsidy

  // 취득세 감면 — 감면 상한이 있어 고가 차량은 상한까지만 감면된다.
  let taxCut = 0
  if (input.applyTaxCut !== false) {
    const fullTax = Math.floor(price * ACQUISITION_TAX_RATE)
    taxCut = Math.min(fullTax, ACQUISITION_TAX_CAP)
    breakdown.push(`취득세 ${won(fullTax)}원 중 감면 상한 ${won(ACQUISITION_TAX_CAP)}원 적용 = ${won(taxCut)}원 절감`)
    if (fullTax > ACQUISITION_TAX_CAP) notes.push('취득세 감면은 상한이 있어 초과분은 부담해야 합니다.')
  }

  const netPrice = Math.max(0, price - totalSubsidy - taxCut)
  breakdown.push(`실부담 ${won(price)} − 보조금 ${won(totalSubsidy)} − 세제 ${won(taxCut)} = ${won(netPrice)}원`)

  notes.push('지자체 예산이 소진되면 보조금을 받지 못하고 다음 공고를 기다려야 합니다. 계약 전 거주지 공고의 잔여 물량을 확인하세요.')

  return {
    vehiclePrice: price,
    tier: tier.label,
    nationalSubsidy, localSubsidy, totalSubsidy, taxCut, netPrice,
    breakdown, notes,
  }
}

export const EV_REGIONS = Object.keys(LOCAL_RATES)
