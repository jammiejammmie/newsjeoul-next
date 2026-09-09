#!/usr/bin/env node
// viral-radar/scripts/apply-classification.js
//
// ANTHROPIC_API_KEY가 없는 이번 세션의 분류 결과를 실제 db에 반영한다(§16-17).
// 이 OVERRIDES 테이블은 이 세션의 Claude가 export-for-classify.js가 뽑은 178건의 제목을
// 실제로 하나하나 읽고 판단한 결과다(discovery_genre_hint를 맹신하지 않고 재검증 — 예: "카렌이
// 응징당하는" 영상은 검색어 힌트가 ANGER였어도 실제 정서는 SATISFYING/사이다에 더 가깝다는 식).
// 정치인/실명 공인이 등장하거나 문화전쟁성 소재("woke ~ owned" 류), 미성년자+공권력, 인종 관련
// 언급이 들어간 항목은 §18 원칙대로 자동 승인하지 않고 needsReview=true로 보냈다(하드블록은 아님
// — 뉴스 가치 판단이 필요한 영역이라 사람 검토로).
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const inputFile = path.join(__dirname, '..', 'data', 'classify-input.json');
const items = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// video_id -> { primaryGenre, secondaryGenres, needsReview, reviewReason, language }
const OVERRIDES = {
  'youtube_shorts:I4bxOuhl8TE': { primaryGenre: 'AMAZING', secondaryGenres: ['SHOCK'] },
  'youtube_shorts:OctCzIo6unU': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:ef-AC3T3KYY': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:TUcvtZ53ELg': { primaryGenre: 'FUNNY', secondaryGenres: ['ANGER'] },
  'youtube_shorts:W19zTOzzSa0': { primaryGenre: 'AMAZING', secondaryGenres: ['TOUCHING'] },
  'youtube_shorts:o2V-JJpJH_I': { primaryGenre: 'AMAZING', secondaryGenres: [] },
  'youtube_shorts:UtS-v-Vm55U': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '정치/문화전쟁성 소재("woke~owned") — 뉴스가치 판단 필요' },
  'youtube_shorts:q3VErv0K10E': { primaryGenre: 'AMAZING', secondaryGenres: ['SHOCK'] },
  'youtube_shorts:RCiSIgKJzqE': { primaryGenre: 'FUNNY', secondaryGenres: ['SHOCK'] },
  'youtube_shorts:dfnJKxkdOr4': { primaryGenre: 'FUNNY', secondaryGenres: ['SATISFYING'] },
  'youtube_shorts:T5aHa-uCWlA': { primaryGenre: 'SHOCK', secondaryGenres: ['ANGER'] },
  'youtube_shorts:O_JJCz1Q8LY': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:6Ke7OYFz4TQ': { primaryGenre: 'FUNNY', secondaryGenres: [] },
  'youtube_shorts:MeC2ZEr1a80': { primaryGenre: 'SATISFYING', secondaryGenres: ['SHOCK'] },
  'youtube_shorts:fuUyLwwkfqk': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:imufpipoW3w': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:c1CmwNHU8WM': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:iXbAncMI6A4': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '정치/문화전쟁성 소재 — 뉴스가치 판단 필요' },
  'youtube_shorts:DE8giZARZWg': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER', 'TOUCHING'] },
  'youtube_shorts:yeF3-szW7Gs': { primaryGenre: 'FUNNY', secondaryGenres: ['ANGER'] },
  'youtube_shorts:Pmr0O4x3E04': { primaryGenre: 'SATISFYING', secondaryGenres: ['ANGER'] },
  'youtube_shorts:n_K4Z2TFvac': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '정치/문화전쟁성 소재 — 뉴스가치 판단 필요' },
  'youtube_shorts:L79NKmdyaFU': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '실명 정치인사 등장 — 뉴스가치/명예훼손 리스크 검토 필요' },
  'youtube_shorts:7ANsIEQcwnA': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '정치/문화전쟁성 소재 — 뉴스가치 판단 필요' },
  'youtube_shorts:M8VcTwnzerM': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '정치적 시민감시(First Amendment audit) 소재 — 법적/뉴스가치 판단 필요' },
  'youtube_shorts:5rPcClOF1jA': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '실명 정치인+젠더 이슈 — 민감도 높아 사람 검토 필수' },
  'youtube_shorts:RWWnreEBZQw': { primaryGenre: 'TOUCHING', secondaryGenres: [], needsReview: true, reviewReason: '국가주의적 프레이밍(애국 콘텐츠) — 정치적 오독 소지 검토' },
  'youtube_shorts:nqZREnUiSYA': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '인도 지역 공무원 대상 실명 시위 영상, 힌디어 — 사실관계/명예훼손 검토 필요', language: 'hi' },
  'youtube_shorts:g9snZJ94XVk': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '실명 정치인(영국 총리) 등장 — 뉴스가치 판단 필요' },
  'youtube_shorts:nGtLKf8aem0': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '인도 지역 공무원 실명 대상 군중 시위 — 명예훼손 리스크 검토 필요' },
  'youtube_shorts:VlRN-3gL18o': { primaryGenre: 'SHOCK', secondaryGenres: ['ANGER'], needsReview: true, reviewReason: '미성년자 대상 공권력 물리력 소재 — 자동승인 절대 불가, 사람 검토 필수' },
  'youtube_shorts:RoTVf61QhBk': { primaryGenre: 'FUNNY', secondaryGenres: [] },
  'youtube_shorts:4slS3VtBXZE': { primaryGenre: 'SHOCK', secondaryGenres: ['ANGER'] },
  'youtube_shorts:rz8k8x55Ji0': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '인종 관련 갈등 소재 — 뉴스가치/민감도 검토 필요' },
  'youtube_shorts:waOZJEa3M64': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '로드레이지(도로 위 분쟁) 소재 — 안전/자극성 검토 필요' },
  'youtube_shorts:-JuF39oLcr0': { primaryGenre: 'SHOCK', secondaryGenres: ['ANGER'] },
  'youtube_shorts:1j9-4WemXfM': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '인도 지역 정치 소재(정당 후보 실명) — 뉴스가치 판단 필요' },
  'youtube_shorts:yG6W9f06X7I': { primaryGenre: 'FUNNY', secondaryGenres: [] },
  'youtube_shorts:4CTbdWVTw78': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '텔루구어, 실명 정치인 비판 소재 — 명예훼손/오정보 리스크 검토 필요', language: 'te' },
  'youtube_shorts:z_HCGyB6DuI': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '인종 관련 갈등 소재 — 뉴스가치/민감도 검토 필요' },
  'youtube_shorts:9ejFA1Hhdas': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '실명 해외 정치인 등장 — 뉴스가치 판단 필요' },
  'youtube_shorts:wPnumwzii2w': { primaryGenre: 'ANGER', secondaryGenres: [], needsReview: true, reviewReason: '협박/위협 소재("Threatens") — 안전 검토 필요' },
  'youtube_shorts:LALZuLSyqic': { primaryGenre: 'ANGER', secondaryGenres: ['SHOCK'], needsReview: true, reviewReason: '음주운전 체포(DUI) 소재 — 법적 민감도 검토 필요' },

  // ── TikTok (Creative Center Top Contents, 2026-09-09 신규) ─────────────────
  // 대부분 명시적 광고/브랜드 협찬(#ad, #PR, #◯◯partner) — safety-filter.js의 AD_CONTENT_PATTERNS가
  // 자동으로 needs_review 처리하므로 여기선 genre만 최선으로 채운다(광고라도 장르 태그 자체는
  // 참고 가치가 있어 기록은 남긴다). RESEARCH.md "TikTok Creative Center 감사" 참고.
  'tiktok:7665337718389345567': { primaryGenre: 'FUNNY', secondaryGenres: [] }, // Samsung ad, 자기소개 유머 톤
  'tiktok:7664452151229336852': { primaryGenre: 'AMAZING', secondaryGenres: [], needsReview: true, reviewReason: '캡션 없음 — 장르 판단 근거 부족' },
  'tiktok:7664451958194867477': { primaryGenre: 'AMAZING', secondaryGenres: [], needsReview: true, reviewReason: '캡션 없음 — 장르 판단 근거 부족' },
  'tiktok:7678646965332102421': { primaryGenre: 'AMAZING', secondaryGenres: [] }, // 게임 10주년 기념 공식 홍보
  'tiktok:7668626193385557255': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // 의약품 광고(인도네시아어)
  'tiktok:7665338027799104781': { primaryGenre: 'AMAZING', secondaryGenres: [] }, // Samsung 신제품 광고
  'tiktok:7608671292362935566': { primaryGenre: 'FUNNY', secondaryGenres: [] }, // Shopify 광고, 자조 유머
  'tiktok:7665798019874344222': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // Tostitos 레시피 광고
  'tiktok:7675624098520665362': { primaryGenre: 'FUNNY', secondaryGenres: [] }, // 게임 유머 밈
  'tiktok:7670840490715204885': { primaryGenre: 'AMAZING', secondaryGenres: [], needsReview: true, reviewReason: 'TikTok 자체 기능(LIVE) 홍보 콘텐츠 — 유기적 바이럴 아님' },
  'tiktok:7675624102488575239': { primaryGenre: 'FUNNY', secondaryGenres: [] }, // 게임 유머 밈
  'tiktok:7671133838315146517': { primaryGenre: 'TOUCHING', secondaryGenres: [] }, // 주택 상담 서비스 광고(일본어), 감성적 톤
  'tiktok:7673533935481113874': { primaryGenre: 'AMAZING', secondaryGenres: [] }, // 오토바이 소개
  'tiktok:7677267334846827784': { primaryGenre: 'AMAZING', secondaryGenres: [] },
  'tiktok:7663076169142603022': { primaryGenre: 'FUNNY', secondaryGenres: [], needsReview: true, reviewReason: '캡션이 짧아 판단 근거 부족' },
  'tiktok:7678243772953677063': { primaryGenre: 'FUNNY', secondaryGenres: [], needsReview: true, reviewReason: 'SHEIN 제품 광고(#PR) 겸 개인정보성 쿠폰코드 포함' },
  'tiktok:7659600436659326216': { primaryGenre: 'AMAZING', secondaryGenres: [] },
  'tiktok:7669932109284314382': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // 반려동물 용품 광고
  'tiktok:7663927822657899796': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // 구강청결제 광고(인도네시아어)
  'tiktok:7661736097436667166': { primaryGenre: 'AMAZING', secondaryGenres: [] }, // 코스프레
  'tiktok:7681293968562294024': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // 뷰티 제품 광고(인도네시아어)
  'tiktok:7670441484469947668': { primaryGenre: 'FUNNY', secondaryGenres: [] },
  'tiktok:7659560446122331406': { primaryGenre: 'SATISFYING', secondaryGenres: [] }, // 단백질 스무디 레시피 광고
  'tiktok:7666544567277161749': { primaryGenre: 'FUNNY', secondaryGenres: [], needsReview: true, reviewReason: '캡션이 짧아 판단 근거 부족' },
};

const GENRES = ['FUNNY', 'TOUCHING', 'ANGER', 'SHOCK', 'SATISFYING', 'AMAZING'];

function scoreFor(primary, secondaries) {
  const scores = {};
  for (const g of GENRES) scores[g] = 0.03;
  scores[primary] = 0.8;
  for (const s of secondaries || []) scores[s] = 0.35;
  return scores;
}

function summaryTemplate(genre, title) {
  const t = title.length > 60 ? title.slice(0, 60) + '…' : title;
  const label = {
    FUNNY: '웃긴', TOUCHING: '훈훈한', ANGER: '분통 터지는', SHOCK: '황당한',
    SATISFYING: '사이다', AMAZING: '놀라운',
  }[genre] || '화제의';
  return `${label} 영상: ${t}`;
}

let applied = 0, reviewCount = 0;
for (const item of items) {
  const override = OVERRIDES[item.video_id];
  const primaryGenre = override?.primaryGenre || item.discovery_genre_hint || 'FUNNY';
  const secondaryGenres = override?.secondaryGenres ?? [];
  const needsReview = Boolean(override?.needsReview);
  if (needsReview) reviewCount++;

  const patch = {
    video_id: item.video_id,
    primary_genre: primaryGenre,
    secondary_genres: secondaryGenres,
    genre_scores: scoreFor(primaryGenre, secondaryGenres),
    genre_confidence: needsReview ? 0.5 : 0.8,
    summary_ko: summaryTemplate(primaryGenre, item.title || ''),
    source_status: needsReview ? 'needs_review' : 'ok',
    language: override?.language || null,
    editorial_review_reason: override?.reviewReason || null,
    classified_by: 'claude_session_manual_2026-09-09', // ANTHROPIC_API_KEY 없어 이 세션의 Claude가 직접 분류(§classify.js 주석 참고)
  };
  db.upsertVideo(patch);
  applied++;
}

console.log(`분류 반영 완료: ${applied}건 (needsReview 표시 ${reviewCount}건)`);
