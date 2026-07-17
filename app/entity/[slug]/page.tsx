import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEntityBySlug, getEntityStories, getEntityTopics, getEntityTimeline } from '@/lib/entities'
import { entityIcon } from '@/lib/icons'
import SignatureCard from '@/components/SignatureCard'
import { generateEntitySchema } from '@/lib/schema/article'
import { generateBreadcrumbSchema } from '@/lib/schema/breadcrumb'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const TYPE_LABEL: Record<string, string> = {
  company: '기업', person: '인물', organization: '기관', country: '국가',
  product: '제품', technology: '기술', market: '시장', policy: '정책',
}

async function getRelatedEntities(entityId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('entity_relations')
    .select('explanation, strength_score, source_entity_id, target_entity_id, source:entities!entity_relations_source_entity_id_fkey(id,slug,name,type), target:entities!entity_relations_target_entity_id_fkey(id,slug,name,type)')
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`)
    .order('strength_score', { ascending: false })
    .limit(10)
  return (data || [])
    .map((row: any) => {
      const other = row.source_entity_id === entityId ? row.target : row.source
      return other ? { ...other, explanation: row.explanation, strength_score: row.strength_score } : null
    })
    .filter(Boolean)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const entity = await getEntityBySlug(slug)
  if (!entity) return { title: '뉴스저울' }

  const title = `${entity.name} — 관련 이슈 정리 | 뉴스저울`
  const desc = entity.description || `${entity.name}와 관련된 최근 이슈와 흐름을 정리했습니다.`

  return {
    title,
    description: desc,
    alternates: { canonical: `${BASE}/entity/${entity.slug}` },
    openGraph: { title: entity.name, description: desc, url: `${BASE}/entity/${entity.slug}`, images: [{ url: `${BASE}/og?type=topic&title=${encodeURIComponent(entity.name)}`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: entity.name, description: desc },
  }
}

export default async function EntityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const entity = await getEntityBySlug(slug)
  if (!entity) notFound()

  const [topics, stories, relatedEntities, timeline] = await Promise.all([
    getEntityTopics(entity.id),
    getEntityStories(entity.id, 20),
    getRelatedEntities(entity.id),
    getEntityTimeline(entity.id, 15),
  ])

  const jsonLd = generateEntitySchema({
    name: entity.name,
    entityType: entity.type,
    description: entity.description,
    dateModified: entity.updated_at,
    url: `${BASE}/entity/${entity.slug}`,
  })
  const breadcrumbLd = generateBreadcrumbSchema([
    { name: '뉴스저울', url: BASE },
    { name: entity.name, url: `${BASE}/entity/${entity.slug}` },
  ])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <div style={{ padding: '16px 0 0' }}>
        <Link href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← 뉴스저울로</Link>
      </div>

      {/* 지금 */}
      <div style={{ padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
            {TYPE_LABEL[entity.type] || entity.type}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 'clamp(20px,3.5vw,30px)', lineHeight: 1.4, marginBottom: 14, color: 'var(--text)' }}>
          {entityIcon(entity.type, entity.name)} {entity.name}
        </h1>
        {entity.description && (
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{entity.description}</p>
        )}
      </div>

      {/* 뉴스저울 분석 — 없으면 숨김 (AI는 작은 안내문구로만) */}
      {entity.ai_analysis && (
        <div style={{ marginBottom: 28, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>🔍 최근 주목받는 이유</p>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{entity.ai_analysis}</p>
          <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>뉴스저울 자동 분석 · 참고용</p>
        </div>
      )}

      {/* 자주 함께 등장하는 국가 — country 타입만 별도 강조 */}
      {relatedEntities.some((e: any) => e.type === 'country') && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            자주 함께 등장하는 국가
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {relatedEntities.filter((e: any) => e.type === 'country').map((e: any) => (
              <Link key={e.id} href={`/entity/${e.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 20,
                  background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text)',
                }}>
                  {entityIcon('country', e.name)} {e.name}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 연결 — 관련 이슈 + 관련 기업 */}
      {(topics.length > 0 || relatedEntities.length > 0) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            연결된 것들
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {topics.map((t: any) => (
              <div key={t.id} style={{ flexShrink: 0, width: 180 }}>
                <SignatureCard href={`/topic/${t.slug}`} seed={t.slug} icon="🔗" badge="이슈" title={t.name} subtitle={t.explanation} size="sm" />
              </div>
            ))}
            {relatedEntities.map((e: any) => (
              <div key={e.id} style={{ flexShrink: 0, width: 180 }}>
                <SignatureCard href={`/entity/${e.slug}`} seed={e.slug} icon={entityIcon(e.type, e.name)} badge={TYPE_LABEL[e.type] || e.type} title={e.name} subtitle={e.explanation} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관련 Timeline */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            관련 Timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {timeline.map((t: any) => (
              <Link key={t.id} href={`/topic/${t.topics.slug}`} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 70 }}>
                    {new Date(t.event_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{t.topics.name}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 근거 — 관련 기사, 기본 접힘 */}
      {stories.length > 0 && (
        <details style={{ marginBottom: 32 }}>
          <summary style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', cursor: 'pointer' }}>
            관련 기사 보기 ({stories.length}개)
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {stories.map((s: any) => (
              <Link key={s.id} href={`/story/${s.id}`} style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{s.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
