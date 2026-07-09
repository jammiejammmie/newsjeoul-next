import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopicBySlug, getTopicStories, getTopicEntities, getTopicTimeline, getTopicUpdates, getTopicsByCategory } from '@/lib/topics'
import { getInsightsForTopic } from '@/lib/insights'
import { entityIcon, categoryIcon } from '@/lib/icons'
import SignatureCard from '@/components/SignatureCard'
import { generateArticleSchema } from '@/lib/schema/article'
import { generateBreadcrumbSchema } from '@/lib/schema/breadcrumb'
import { generateFaqSchema } from '@/lib/schema/faq'

const TYPE_LABEL: Record<string, string> = {
  company: '관련 기업', person: '관련 인물', organization: '관련 기관', country: '관련 국가',
  product: '관련 제품', technology: '관련 기술', market: '관련 시장', policy: '관련 정책',
}

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'
const STAGE_BADGE: Record<string, string> = {
  emerging: '🌱 새로 떠오름',
  active: '🔥 활발히 진행 중',
  cooling: '🧊 잦아드는 중',
  archived: '📦 종료',
}

function ContextBlock({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{icon} {label}</p>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{text}</p>
    </div>
  )
}

async function getRelatedTopics(topicId: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data } = await supabase
    .from('topic_relations')
    .select('relation_type, explanation, strength_score, source_topic_id, target_topic_id, source:topics!topic_relations_source_topic_id_fkey(id,slug,name), target:topics!topic_relations_target_topic_id_fkey(id,slug,name)')
    .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`)
    .order('strength_score', { ascending: false })
    .limit(10)
  return (data || [])
    .map((row: any) => {
      const other = row.source_topic_id === topicId ? row.target : row.source
      return other ? { ...other, explanation: row.explanation, strength_score: row.strength_score } : null
    })
    .filter(Boolean)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const topic = await getTopicBySlug(slug)
  if (!topic) return { title: '뉴스저울' }

  const title = `${topic.name} 총정리 — 지금까지 정리 | 뉴스저울`
  const desc = topic.summary || topic.description || `${topic.name}에 대한 지금까지의 흐름과 관련 이슈를 정리했습니다.`

  return {
    title,
    description: desc,
    alternates: { canonical: `${BASE}/topic/${topic.slug}` },
    openGraph: { title: topic.name, description: desc, images: [{ url: `${BASE}/og?type=topic&title=${encodeURIComponent(topic.name)}`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: topic.name, description: desc },
  }
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const topic = await getTopicBySlug(slug)
  if (!topic) notFound()

  const [stories, entities, timeline, updates, relatedTopics, sameCategoryTopics, relatedInsights] = await Promise.all([
    getTopicStories(topic.id, 20),
    getTopicEntities(topic.id),
    getTopicTimeline(topic.id, 30),
    getTopicUpdates(topic.id, 10),
    getRelatedTopics(topic.id),
    topic.category ? getTopicsByCategory(topic.category, 6) : Promise.resolve([]),
    getInsightsForTopic(topic.id, 2),
  ])
  const readNext = sameCategoryTopics.filter((t: any) => t.id !== topic.id).slice(0, 5)

  const recentTimeline = timeline.slice(-5).reverse()
  const olderTimeline = timeline.slice(0, -5).reverse()

  const jsonLd = generateArticleSchema({
    headline: topic.name,
    description: topic.summary || topic.description,
    dateModified: topic.updated_at,
    url: `${BASE}/topic/${topic.slug}`,
  })
  const breadcrumbLd = generateBreadcrumbSchema([
    { name: '뉴스저울', url: BASE },
    { name: topic.name, url: `${BASE}/topic/${topic.slug}` },
  ])
  const faqLd = generateFaqSchema(
    relatedTopics
      .filter((t: any) => t.explanation)
      .map((t: any) => ({ question: `${topic.name}와(과) ${t.name}은(는) 어떤 관계가 있나요?`, answer: t.explanation }))
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <div style={{ padding: '16px 0 0' }}>
        <Link href="/" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>← 뉴스저울로</Link>
      </div>

      {/* 지금 — 항상 최상단, 접히지 않음 (모바일 우선) */}
      <div style={{ padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
            {STAGE_BADGE[topic.lifecycle_stage] || topic.lifecycle_stage}
          </div>
          {topic.category && (
            <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {topic.category}
            </div>
          )}
        </div>
        <h1 style={{ fontFamily: "'Noto Serif KR',serif", fontSize: 'clamp(20px,3.5vw,30px)', lineHeight: 1.4, marginBottom: 14, color: 'var(--text)' }}>
          {topic.category && <span style={{ marginRight: 8 }}>{categoryIcon(topic.category)}</span>}
          {topic.name}
        </h1>
        {(topic.summary || topic.description) && (
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{topic.summary || topic.description}</p>
        )}
      </div>

      {/* 오늘 바뀐 것 */}
      {updates.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            오늘 바뀐 것
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {updates.map((u: any) => (
              <div key={u.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{u.title}</p>
                {u.summary && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>{u.summary}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 역사 — 처음부터 지금까지 (요약 5개는 항상 노출, 나머지는 접힘) */}
      {recentTimeline.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            처음부터 지금까지
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recentTimeline.map((t: any, i: number) => (
              <div key={t.id}>
                <div style={{ display: 'flex', gap: 10, padding: '4px 0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, width: 70 }}>
                    {new Date(t.event_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</p>
                    {t.summary && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.summary}</p>}
                  </div>
                </div>
                {i < recentTimeline.length - 1 && <span style={{ color: 'var(--border2)', fontSize: 12, marginLeft: 74 }}>↓</span>}
              </div>
            ))}
          </div>
          {olderTimeline.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>전체 타임라인 보기 ({olderTimeline.length}개 더)</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {olderTimeline.map((t: any) => (
                  <div key={t.id} style={{ display: 'flex', gap: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0, width: 70 }}>
                      {new Date(t.event_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.title}</p>
                      {t.summary && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.summary}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* 왜 중요한가 / 향후 전망 / 반대 시각 — AI 생성, 없으면 섹션 숨김 */}
      {(topic.ai_outlook || topic.ai_counter_view) && (
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {topic.ai_outlook && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>🔮 향후 전망</p>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{topic.ai_outlook}</p>
            </div>
          )}
          {topic.ai_counter_view && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>🔄 반대 시각</p>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{topic.ai_counter_view}</p>
            </div>
          )}
          <p style={{ fontSize: 9, color: 'var(--muted)' }}>뉴스저울 자동 분석 · 참고용</p>
        </div>
      )}

      {/* 넓은 맥락 — 산업 영향/과거 비교/해외 대응/전망/유사 사례/연관 이슈 */}
      {topic.ai_context && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            더 넓은 맥락
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topic.ai_context.industry_impact && (
              <ContextBlock icon="🏭" label="관련 산업에 미치는 영향" text={topic.ai_context.industry_impact} />
            )}
            {topic.ai_context.historical_comparison && (
              <ContextBlock icon="🕰️" label="최근 유사 사례와 비교" text={topic.ai_context.historical_comparison} />
            )}
            {topic.ai_context.international_response && (
              <ContextBlock icon="🌐" label="해외는 어떻게 대응했는가" text={topic.ai_context.international_response} />
            )}
            {Array.isArray(topic.ai_context.watchpoints) && topic.ai_context.watchpoints.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>👀 앞으로 주목해야 할 변화</p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 16 }}>
                  {topic.ai_context.watchpoints.map((w: string, i: number) => (
                    <li key={i} style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {Array.isArray(topic.ai_context.similar_cases) && topic.ai_context.similar_cases.length > 0 && (
              <ContextBlock icon="🔁" label="구조가 비슷한 다른 사건" text={topic.ai_context.similar_cases.join(' · ')} />
            )}
            {Array.isArray(topic.ai_context.related_issues) && topic.ai_context.related_issues.length > 0 && (
              <ContextBlock icon="🔗" label="함께 이해하면 좋은 이슈" text={topic.ai_context.related_issues.join(' · ')} />
            )}
          </div>
          <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 10 }}>뉴스저울 자동 분석 · 참고용</p>
        </div>
      )}

      {/* 오늘의 발견 — 이 Topic을 언급한 인사이트 교차 링크 */}
      {relatedInsights.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            오늘의 발견
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {relatedInsights.map((ins: any) => (
              <div key={ins.id} style={{ background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14, padding: '14px 16px', borderLeft: '3px solid var(--accent)' }}>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{ins.insight_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관련 Topic */}
      {relatedTopics.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            관련 Topic
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {relatedTopics.map((t: any) => (
              <div key={t.id} style={{ flexShrink: 0, width: 180 }}>
                <SignatureCard href={`/topic/${t.slug}`} seed={t.slug} icon="🔗" badge="주제" title={t.name} subtitle={t.explanation} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 관련 기업/인물/국가/정책/기술 — 타입별 그룹핑 */}
      {entities.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          {Object.entries(
            entities.reduce((acc: Record<string, any[]>, e: any) => {
              (acc[e.type] = acc[e.type] || []).push(e)
              return acc
            }, {})
          ).map(([type, list]) => (
            <div key={type} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
                {TYPE_LABEL[type] || type}
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
                {list.map((e: any) => (
                  <div key={e.id} style={{ flexShrink: 0, width: 170 }}>
                    <SignatureCard href={`/entity/${e.slug}`} seed={e.slug} icon={entityIcon(e.type, e.name)} title={e.name} subtitle={e.explanation} size="sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 근거 — 관련 기사, 기본 접힘 */}
      {stories.length > 0 && (
        <details style={{ marginBottom: 32 }}>
          <summary style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', cursor: 'pointer' }}>
            근거 기사 보기 ({stories.length}개)
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

      {/* 함께 읽으면 좋은 Topic — 같은 분야 기반 */}
      {readNext.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            함께 읽으면 좋은 Topic
          </div>
          <div className="nj-topic-grid">
            {readNext.map((t: any) => (
              <SignatureCard key={t.id} href={`/topic/${t.slug}`} seed={t.slug} icon={categoryIcon(topic.category)} title={t.name} subtitle={t.summary || t.description} size="md" />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
