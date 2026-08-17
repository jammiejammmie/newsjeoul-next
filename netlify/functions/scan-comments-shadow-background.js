// scan-comments-shadow-background.js — 마스터 스펙 v1 Track 3(커뮤니티 소통 레이어), 섀도우 모드
//
// 범위(의도적 제한): 이 함수는 댓글을 "읽고 분류하고 답변 초안을 로그에만 남긴다." 실제로
// Threads에 답글을 게시하는 코드는 이 파일에 없다 — 마스터 스펙 3-2 "처음엔 실제로 댓글을 달지
// 않고 로그 테이블에만 기록"을 문자 그대로 지켰다. comment_auto_reply_settings.is_live이
// true가 되더라도(admin 수동 토글로만 가능, 이 함수/마이그레이션 어디서도 자동으로 켜지 않음)
// 이 함수는 여전히 게시하지 않는다 — 실제 게시 경로는 최소 7일치 섀도우 로그를 사람이 검토한
// 뒤 별도 작업으로 구현하기로 판단(한 세션에서 자동응답 게시 코드까지 한번에 만드는 것은
// 검증 없이 위험 표면을 키우는 것이라 과도하다고 판단 — CHANGELOG.md 참고).
//
// 안전 가드레일(3-1): 아래 EXCLUDED 분류에 해당하면 무조건 needs_human_review로 분류하고
// 답변 초안조차 생성하지 않는다. 애매하면 무조건 제외(기본값: 응답 안 함).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

const RECENT_POSTS_TO_SCAN = 20; // 최근 게시물 N건의 댓글만 스캔(오래된 글은 댓글이 잘 안 달림)

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ` + await res.text());
  return res.json();
}

async function fetchRecentPostIds() {
  const rows = await supabaseGet('threads_posts', `?select=post_id&status=eq.success&order=posted_at.desc&limit=${RECENT_POSTS_TO_SCAN}`);
  return rows.map((r) => r.post_id).filter(Boolean);
}

async function fetchReplies(postId) {
  const url = `https://graph.threads.net/v1.0/${postId}/replies?fields=id,text,username,timestamp&access_token=${THREADS_ACCESS_TOKEN}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    console.error(`REPLIES_FETCH_FAILED[${postId}]:`, JSON.stringify(data));
    return [];
  }
  return data.data || [];
}

async function fetchAlreadyLogged(commentIds) {
  if (!commentIds.length) return new Set();
  const rows = await supabaseGet('comment_auto_reply_log', `?select=comment_id&comment_id=in.(${commentIds.join(',')})`);
  return new Set(rows.map((r) => r.comment_id));
}

// 3-1. 안전 가드레일 — Claude 1회 호출로 분류+답변 초안을 동시에 받는다(비용 절감).
// 허용 범위를 좁게 시작(정보 보충 질문/감사·공감 표현/단순 사실확인)하고, 애매하면 제외가 기본값.
async function classifyAndDraft(commentText) {
  const prompt = `너는 뉴스저울 Threads 계정의 댓글 응답 게이트키퍼다. 아래 댓글 하나를 분류해라.

댓글: "${commentText}"

분류 기준(반드시 이 순서로 판단, 하나라도 해당하면 즉시 EXCLUDED):
1. 정치적으로 논쟁적이거나 도발적인 내용 → EXCLUDED(정치적_논쟁성)
2. 욕설/혐오 표현 → EXCLUDED(욕설_혐오)
3. 개인정보를 요구하거나 제공하는 내용 → EXCLUDED(개인정보_요구)
4. 위 세 가지에 해당하지 않지만 판단이 조금이라도 애매함 → EXCLUDED(애매함) — 기본값은 항상 이쪽이다
5. 명확히 "정보 보충 질문" 또는 "감사·공감 표현" 또는 "단순 사실 확인 요청"에만 해당 → ELIGIBLE

ELIGIBLE인 경우에만 자연스럽고 짧은(1~2문장) 답변 초안을 작성해라. 뉴스저울의 편집 관점을
대변하거나 논쟁적 주장을 하지 않는다 — 정보 보충과 감사 표현 수준으로만 답한다.

설명 없이 아래 JSON만 반환해라:
{
  "classification": "auto_reply_eligible 또는 needs_human_review",
  "exclusion_reason": "정치적_논쟁성 또는 욕설_혐오 또는 개인정보_요구 또는 애매함 또는 null",
  "reply_draft": "ELIGIBLE일 때만 작성, 아니면 null"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    // 2026-08-06: sonnet-5는 thinking 생략 시 adaptive thinking이 켜지고, max_tokens는
    // thinking+텍스트 합계 상한이다. 300토큰은 이 파이프라인에서 가장 좁은 예산이라
    // thinking이 켜지면 거의 확실히 본문이 0바이트로 온다(전 파이프라인 공통 수정).
    body: JSON.stringify({
      // 2026-08-17(비용 분석): 매시간 도는 섀도 스캔이고, thinking을 끈 채 800토큰짜리
      // 짧은 판정만 뽑는 용도라 haiku-4.5로 충분하다(출력 단가 1/3).
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('댓글 분류 파싱 실패: ' + rawText.slice(0, 200));
  return JSON.parse(match[0]);
}

async function saveLog(rows) {
  if (!rows.length) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/comment_auto_reply_log`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) console.error('COMMENT_LOG_SAVE_FAILED(마이그레이션 미적용 가능성):', await res.text());
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  if (!THREADS_ACCESS_TOKEN) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'THREADS_ACCESS_TOKEN 없음' }) };
  }

  try {
    const postIds = await fetchRecentPostIds();
    const repliesByPost = await Promise.all(postIds.map((id) => fetchReplies(id).then((replies) => ({ postId: id, replies }))));
    const allReplies = repliesByPost.flatMap(({ postId, replies }) => replies.map((r) => ({ ...r, postId })));

    const alreadyLogged = await fetchAlreadyLogged(allReplies.map((r) => r.id));
    const newReplies = allReplies.filter((r) => !alreadyLogged.has(r.id));

    console.log(`COMMENT_SCAN: 게시물 ${postIds.length}건, 댓글 ${allReplies.length}건, 신규 ${newReplies.length}건`);

    const logRows = [];
    for (const reply of newReplies) {
      try {
        const result = await classifyAndDraft(reply.text || '');
        logRows.push({
          thread_post_id: reply.postId,
          comment_id: reply.id,
          comment_text: reply.text || '',
          commenter_username: reply.username || null,
          classification: result.classification,
          exclusion_reason: result.exclusion_reason || null,
          generated_reply_text: result.reply_draft || null,
          was_posted: false, // 섀도우 모드 — 항상 false, 이 함수는 실제 게시를 하지 않는다
        });
      } catch (e) {
        console.error(`COMMENT_CLASSIFY_FAILED[${reply.id}]:`, e.message);
      }
    }
    await saveLog(logRows);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, postsScanned: postIds.length, totalReplies: allReplies.length, newReplies: newReplies.length, logged: logRows.length }),
    };
  } catch (e) {
    console.error('scan-comments-shadow-background 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
