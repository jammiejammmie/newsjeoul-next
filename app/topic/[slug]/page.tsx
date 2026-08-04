import { createClient } from '@supabase/supabase-js'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTopicBySlug, getTopicStories, getTopicEntities, getTopicUpdates, getTopicTimeline } from '@/lib/topics'
import { entityIcon, categoryIcon } from '@/lib/icons'
import PerspectiveExplorer from '@/components/topic/PerspectiveExplorer'
import { generateArticleSchema } from '@/lib/schema/article'
import { generateBreadcrumbSchema } from '@/lib/schema/breadcrumb'
import { generateFaqSchema } from '@/lib/schema/faq'
import ReadTracker from '@/components/ReadTracker'

const TYPE_LABEL: Record<string, string> = {
  company: '기업', person: '인물', organization: '기관', country: '국가',
  product: '제품', technology: '기술', market: '시장', policy: '정책',
}

// 첫 문장을 분리해 볼드 처리 — 핵심 문장을 먼저 눈에 띄게 한다(2026-07-12, 가독성 개선)
function renderWithLeadEmphasis(text: string) {
  const match = text.match(/^.+?[.!?](?=\s|$)/)
  if (!match) return text
  const first = match[0]
  const rest = text.slice(first.length)
  return (
    <>
      <strong style={{ fontWeight: 700 }}>{first}</strong>
      {rest}
    </>
  )
}

export const revalidate = 600
// generateStaticParams가 없으면 Netlify Next.js 런타임이 이 동적 세그먼트를 ISR 대상이 아닌
// 완전 SSR로 빌드해 revalidate가 무시된다(2026-07-30 실측: Cache-Status 항상 fwd=miss,
// Cache-Control: private,no-store). 빈 배열을 반환해 "빌드 시점엔 미리 만들 페이지 없음,
// 첫 요청부터 온디맨드로 ISR 캐시"를 명시적으로 신호한다.
export async function generateStaticParams() {
  return []
}
const BASE = 'https://newsjeoul.co.kr'

async function getRelatedTopics(topicId: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data } = await supabase
    .from('topic_relations')
    .select('relation_type, explanation, strength_score, source_topic_id, target_topic_id, source:topics!topic_relations_source_topic_id_fkey(id,slug,name), target:topics!topic_relations_target_topic_id_fkey(id,slug,name)')
    .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`)
    .order('strength_score', { ascending: false })
    .limit(6)
  return (data || [])
    .map((row: any) => {
      const other = row.source_topic_id === topicId ? row.target : row.source
      return other ? { ...other, explanation: row.explanation } : null
    })
    .filter(Boolean)
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const topic = await getTopicBySlug(slug)
  if (!topic) return { title: '뉴스저울', robots: { index: false, follow: false } }

  const draft = topic.ai_context?.draft
  const title = `${topic.name} — 뉴스저울`
  const desc = draft?.lead || topic.summary || topic.description || `${topic.name}에 대한 지금까지의 흐름을 정리했습니다.`

  return {
    title,
    description: desc,
    alternates: { canonical: `${BASE}/topic/${topic.slug}` },
    openGraph: { title: topic.name, description: desc, url: `${BASE}/topic/${topic.slug}`, images: [{ url: `${BASE}/og?type=topic&title=${encodeURIComponent(topic.name)}`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: topic.name, description: desc },
  }
}

export default async function TopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const topic = await getTopicBySlug(slug)
  if (!topic) notFound()

  const [stories, entities, updates, relatedTopics, timeline] = await Promise.all([
    getTopicStories(topic.id, 20),
    getTopicEntities(topic.id),
    getTopicUpdates(topic.id, 5),
    getRelatedTopics(topic.id),
    getTopicTimeline(topic.id, 8),
  ])

  // Editorial Engine이 이미 장문을 발행했으면(editorial_status='published') 그 결과물을 그대로
  // 보여준다 — Topic 화면을 위해 Editorial Engine을 만든 게 아니라 그 반대(PM 지시, 2026-07-11).
  // 아직 발행 전(pending/planned/degraded)이면 기존 요약 기반 폴백을 그대로 쓴다.
  const draft = topic.editorial_status === 'published' ? topic.ai_context?.draft : null
  const plan = topic.ai_context?.plan
  const weight = Math.round(topic.importance_score ?? 0)
  // "몇 g" 실제 산정 근거(PM 지시 2026-07-17) — update-topic-weight-background.js가 채운 값.
  // 아직 한 번도 계산 전이면(weight 필드 없음) 근거 없이 숫자만 있던 기존 상태이므로 이유를 숨긴다.
  const weightInfo = topic.ai_context?.weight
  const editorsAssigned = plan?.editors_assigned || []
  const displayKeywords = draft?.display_keywords || []
  // Expansion Engine(PM 지시 2026-07-19) — 이 Topic에서 파생된 다른 앵글 글들(가이드/비교/배경/FAQ 등)
  const expansionDrafts = topic.ai_context?.expansion_drafts || []

  const jsonLd = generateArticleSchema({
    headline: topic.name,
    description: draft?.lead || topic.summary || topic.description,
    dateModified: topic.updated_at,
    url: `${BASE}/topic/${topic.slug}`,
  })
  const breadcrumbLd = generateBreadcrumbSchema([
    { name: '뉴스저울', url: BASE },
    { name: topic.name, url: `${BASE}/topic/${topic.slug}` },
  ])
  const faqLd = generateFaqSchema(
    relatedTopics.filter((t: any) => t.explanation).map((t: any) => ({ question: `${topic.name}와(과) ${t.name}은(는) 어떤 관계가 있나요?`, answer: t.explanation }))
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      {/* 홈 "많이 본 이슈 24시간"의 집계원. 브라우저에서 1회 비콘을 보낸다 —
          서버 렌더 시점에 세면 크롤러·ISR 재생성까지 조회로 잡힌다. */}
      <ReadTracker topicId={topic.id} />

      <div style={{ padding: '16px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>뉴스저울</Link>
        {topic.category && <><span>›</span><span>{topic.category}</span></>}
      </div>

      {/* BRIEF — 이미지 제거·텍스트 중심 개편(PM 지시 2026-07-19) */}
      <div style={{ padding: '20px 0 36px' }}>
        {/* 핵심 키워드(PM 지시 2026-07-17) — 탐험의 입구: 매칭되는 엔티티가 있으면 그 페이지로 연결 */}
        {displayKeywords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 16 }}>
            {displayKeywords.slice(0, 5).map((kw: string, i: number) => {
              const matched = entities.find((e: any) => kw.includes(e.name) || e.name.includes(kw))
              const content = (
                <span style={{ fontSize: i === 0 ? 'clamp(20px,3.2vw,28px)' : 'clamp(16px,2.4vw,20px)', fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                  {kw}
                </span>
              )
              return matched ? (
                <Link key={kw} href={`/entity/${matched.slug}`} style={{ textDecoration: 'none' }}>{content}</Link>
              ) : (
                <span key={kw}>{content}</span>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>
          <span>무게 {weight}g</span>
          {topic.category && <><span>·</span><span>{topic.category}</span></>}
          <span>·</span>
          <span>관련 보도 {stories.length}건</span>
        </div>
        {weightInfo?.reasons?.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.7 }}>
            {weightInfo.reasons.map((r: string) => <div key={r}>· {r}</div>)}
          </div>
        )}
        <h1 style={{ fontSize: 'clamp(26px,4vw,42px)', fontWeight: 800, lineHeight: 1.28, letterSpacing: '-0.015em', color: 'var(--text)', marginBottom: 22 }}>
          {topic.name}
        </h1>
        {editorsAssigned.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
            {editorsAssigned.map((e: any) => `${e.name} 에디터(${e.perspective})`).join(' · ')}가 정리했습니다
          </div>
        )}
        <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', lineHeight: 1.9 }}>
          {renderWithLeadEmphasis(draft?.lead || topic.summary || topic.description || '')}
        </p>
        {!draft && (
          <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10 }}>
            {topic.editorial_status === 'degraded' ? '장문 분석 생성 실패 — 요약만 제공' : '장문 분석 준비 중 — 요약만 우선 제공'}
          </p>
        )}
      </div>

      {/* EXPANSION DRAFTS — 이 Topic에서 파생된 다른 관점의 글(PM 지시 2026-07-19, 내부링크 필수 3개+) */}
      {expansionDrafts.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            이 주제를 더 깊이 알아보기
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expansionDrafts.map((d: any) => (
              <Link key={d.angle} href={`/topic/${topic.slug}/${d.angle}`} style={{ display: 'block', border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 10, padding: '12px 16px', textDecoration: 'none' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{d.title}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ENTITY BAND */}
      {entities.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            관련 엔티티
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {entities.map((e: any) => (
              <Link
                key={e.id} href={`/entity/${e.slug}`}
                title={e.explanation || undefined}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                  border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
                  padding: '10px 16px', borderRadius: 999, whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 15 }}>{entityIcon(e.type, e.name)}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{e.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{TYPE_LABEL[e.type] || e.type}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* TIMELINE — 이 주제의 지금까지 흐름(topic_timeline_events, 실데이터만) */}
      {timeline.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            지금까지의 흐름
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.map((ev: any) => (
              <div key={ev.id} style={{ display: 'flex', gap: 14, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {new Date(ev.event_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                </span>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{ev.title}</p>
                  {ev.summary && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.6 }}>{ev.summary}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {draft ? (
        <>
          {/* PERSPECTIVE EXPLORER — Editorial Engine이 생성한 축별 블록 */}
          <PerspectiveExplorer blocks={draft.blocks || []} />

          {/* 대립 관점 병치 */}
          {Array.isArray(draft.perspective_markers) && draft.perspective_markers.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
                엇갈리는 시각
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: draft.perspective_markers.length > 1 ? '1fr 1fr' : '1fr', gap: 12 }}>
                {draft.perspective_markers.map((m: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 10 }}>{m.perspective}</p>
                    <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.8 }}>{m.claim}</p>
                    {m.basis && (
                      <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65, marginTop: 10 }}>근거 — {m.basis}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FORK — 더 넓게 / 더 깊게 */}
          <div style={{ marginBottom: 44 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
              여기서 갈림길입니다
            </div>
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 18px' }}>더 넓게 볼지, 더 깊게 볼지 골라보세요</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ border: '1px solid rgba(124,140,255,.2)', background: 'rgba(124,140,255,.04)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>↔ 더 넓게</div>
                {draft.closing_door?.wider && (
                  <p style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.75, marginBottom: 14 }}>{draft.closing_door.wider}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {relatedTopics.slice(0, 3).map((t: any) => (
                    <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none', display: 'block', padding: '10px 12px', borderRadius: 10, background: 'var(--card)' }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{t.name}</p>
                      {t.explanation && <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{t.explanation}</p>}
                    </Link>
                  ))}
                </div>
              </div>
              <div style={{ border: '1px solid rgba(200,16,46,.22)', background: 'rgba(200,16,46,.05)', borderRadius: 16, padding: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>↓ 더 깊게</div>
                {draft.closing_door?.deeper && (
                  <p style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.75, marginBottom: 14 }}>{draft.closing_door.deeper}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {stories.slice(0, 3).map((s: any) => (
                    <Link key={s.id} href={`/story/${s.id}`} style={{ fontSize: 12.5, color: 'var(--text2)', textDecoration: 'none', padding: '8px 10px', borderRadius: 10, background: 'var(--card)' }}>
                      {s.title}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* 폴백 — 장문 미발행 시 기존 방식 */}
          {updates.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>오늘 바뀐 것</div>
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
          {relatedTopics.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>관련 Topic</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {relatedTopics.map((t: any) => (
                  <Link key={t.id} href={`/topic/${t.slug}`} style={{ textDecoration: 'none' }}>
                    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.name}</p>
                      {t.explanation && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t.explanation}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 근거 기사 — 항상 노출, 기본 접힘 */}
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
    </div>
  )
}
