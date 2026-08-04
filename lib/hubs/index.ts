import { createClient } from '@supabase/supabase-js'
import type { HubAffiliateSlot, HubConfig } from './types'
import { galaxyZFold8 } from './galaxy-z-fold8'
import { audiQ9 } from './audi-q9'
import { youthMonthlyRent } from './youth-monthly-rent'
import { evSubsidy } from './ev-subsidy'
import { excel } from './excel'

export type * from './types'

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// 허브 레지스트리. 새 허브를 추가할 때 여기 한 줄만 넣으면 라우트·사이트맵·/go 리다이렉트가
// 모두 따라온다(설계서 §11 기준 1년차 목표 허브 150~250개까지 이 구조로 감당 가능).
const HUBS: HubConfig[] = [galaxyZFold8, audiQ9, youthMonthlyRent, evSubsidy, excel]

export const ALL_HUBS = HUBS
export const HUB_SLUGS = HUBS.map((h) => h.slug)

export function getHubConfig(slug: string): HubConfig | null {
  return HUBS.find((h) => h.slug === slug) ?? null
}

/** /go/{slot} 라우트가 목적지를 찾을 때 쓴다. 슬롯은 전 허브에서 유일해야 한다. */
export function findAffiliateSlot(slot: string): { hub: HubConfig; entry: HubAffiliateSlot } | null {
  for (const hub of HUBS) {
    // 링크 금지 허브(§8.3 신차·정책)는 슬롯 자체가 없다 — 타입이 그렇게 강제한다.
    if (!hub.affiliate.allowed) continue
    const entry = hub.affiliate.slots.find((a) => a.slot === slot)
    if (entry) return { hub, entry }
  }
  return null
}

export type HubMeta = {
  createdAt: string
  updatedAt: string
  updateCount: number
  /** DB에서 읽었는지 — 마이그레이션 전에는 false(설정값 폴백). 화면 표기 판단에 쓴다. */
  fromDb: boolean
}

// 갱신 메타 — hubs 테이블이 정본이고, 없으면 설정값으로 폴백한다.
// 폴백을 두는 이유: 마이그레이션(supabase/hubs_migration.sql)은 DDL이라 배포와 별개로 적용되는데,
// 그 사이에 페이지가 깨지면 안 된다. 설계서 §10.5가 dateModified 정확성을 요구하므로,
// DB가 붙으면 즉시 DB 값을 쓴다.
export async function getHubMeta(hub: HubConfig): Promise<HubMeta> {
  const fallback: HubMeta = {
    createdAt: hub.createdAt,
    updatedAt: hub.updatedAtFallback,
    updateCount: hub.updateCountFallback,
    fromDb: false,
  }
  try {
    const { data, error } = await client()
      .from('hubs')
      .select('created_at, updated_at, update_count')
      .eq('slug', hub.slug)
      .maybeSingle()
    if (error || !data) return fallback
    return {
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      updateCount: data.update_count ?? fallback.updateCount,
      fromDb: true,
    }
  } catch {
    return fallback
  }
}

export type HubNewsItem = {
  id: string
  title: string
  url: string | null
  publishedAt: string | null
  source: string | null
}

// 최신 소식 — articles 테이블을 제목 키워드로 조회한다.
//
// topics가 아니라 articles를 쓰는 이유: 이 사이트의 topics는 이슈(정치·국제) 중심으로 만들어져
// 제품 단위 실체가 거의 없다(실측: '폴드' 매칭 topic 0건). 반면 articles에는 실제 폴드8 기사가
// 있다(같은 키워드로 7건). 허브의 주인공은 뉴스가 아니라 실체이므로(설계서 §3.1),
// 뉴스는 실체에 붙는 부속 정보로 취급해 기사 단위로 붙이는 편이 맞다.
export async function getHubNews(hub: HubConfig, limit = 6): Promise<HubNewsItem[]> {
  if (!hub.newsKeywords.length) return []
  try {
    const or = hub.newsKeywords.map((k) => `title.ilike.*${k}*`).join(',')
    const { data, error } = await client()
      .from('articles')
      .select('id, title, url, source_url, published_at, source_name')
      .or(or)
      .order('published_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    const excluded = hub.newsExclude ?? []
    return data
      // 짧은 키워드는 부분매칭 오탐이 난다(실측: '엑셀'이 '큐엑셀'을 잡았다).
      // 제목에 제외어가 있으면 버린다 — 엉뚱한 기사가 허브에 보이면 안 된다.
      .filter((a: any) => !excluded.some((x: string) => (a.title || '').includes(x)))
      .map((a: any) => ({
      id: a.id,
      // source_url이 원문 해제된 주소다. 없으면 수집 당시 url로 폴백.
      url: a.source_url || a.url || null,
      title: a.title,
      publishedAt: a.published_at,
      source: a.source_name,
    }))
  } catch {
    return []
  }
}

/** 관련 이슈 — 허브 키워드와 겹치는 활성 Topic. 없으면 빈 배열(섹션을 숨긴다). */
export async function getHubTopics(hub: HubConfig, limit = 4) {
  if (!hub.newsKeywords.length) return []
  try {
    const or = hub.newsKeywords.map((k) => `name.ilike.*${k}*`).join(',')
    const { data } = await client()
      .from('topics')
      .select('slug, name, category, updated_at')
      .eq('status', 'active')
      .or(or)
      .order('updated_at', { ascending: false })
      .limit(limit)
    return data || []
  } catch {
    return []
  }
}
