// viral-radar/lib/dedupe.js
// PRODUCT.md §14 "중복 제거" 단계 구현.
//
// 실제로 구현한 단계: 1) exact platform ID  2) canonical URL  3) title/caption 유사도 클러스터링
// 아직 구현 안 한 단계(문서화만): 4) thumbnail perceptual similarity  5) content embedding
//   → 이유: 이번 POC 공급망이 YouTube 단일 플랫폼(§ MVP 조사 결과, TikTok/Instagram은
//   유료 공급자 계약 전이라 실데이터가 없음)이라 "같은 클립이 여러 플랫폼에 동시 존재"하는
//   케이스 자체가 아직 안 생긴다. 여러 플랫폼을 실제로 붙이는 시점에 4·5단계를 추가한다
//   (이미지 임베딩엔 별도 라이브러리/모델 호출 비용이 들어가므로 그때 가서 필요성을 재확인).

function normalizeTitle(s) {
  return (s || '')
    .toLowerCase()
    .replace(/#\S+/g, '') // 해시태그 제거
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// 길이<2 단어는 원래 걸렀는데, 그러면 "Part 2" / "Part 3"처럼 숫자 하나로만 갈리는 연재물
// 시리즈의 회차 번호가 통째로 사라져 서로 다른 회차가 같은 클립으로 오인될 위험이 있었다
// (테스트로 실제 재현됨, scripts/test-pipeline.js). 숫자 토큰은 길이 무관하게 남긴다.
function titleWords(title) {
  return normalizeTitle(title).split(' ').filter((w) => w.length >= 2 || /^\d+$/.test(w));
}

/** 단어 집합 Jaccard 유사도 (buzz-engine.js의 titleSimilarity와 같은 계열 접근) */
function titleSimilarity(a, b) {
  const wa = new Set(titleWords(a));
  const wb = new Set(titleWords(b));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 0 : inter / union;
}

const TITLE_MATCH_THRESHOLD = 0.6; // instagram-publish.js REPOST_SIMILARITY(0.75)보다 살짝 관대 —
// 여긴 "같은 근원 클립"만 걸러내면 되고, 서로 다른 업로더가 자막을 바꿔 올리는 경우가 흔해서다.
// 단 비율만 보면 짧은 제목(5~6단어)은 단어 1개만 달라도 0.6을 넘어 서로 다른 영상이 같은
// 클립으로 오인될 수 있다(테스트로 실제 재현됨) — 그래서 절대 겹침 단어 수도 함께 요구한다.
const TITLE_MIN_OVERLAP_WORDS = 3;

// 시리즈물(Part 2 vs Part 3 등)은 제목 전체가 템플릿처럼 똑같고 회차번호만 다르다 — 그 경우
// 겹침 단어 수/비율이 둘 다 높게 나와도 서로 다른 영상일 확률이 높다. "차이 나는 단어가
// 전부 숫자뿐"이면 훨씬 엄격한 기준(NUMERIC_DIFF_THRESHOLD)을 추가로 요구한다.
const NUMERIC_DIFF_THRESHOLD = 0.92; // 숫자만 다를 때는 이 정도로 거의 동일해야만 같은 클립으로 본다

function titlesMatch(a, b) {
  const wa = new Set(titleWords(a));
  const wb = new Set(titleWords(b));
  if (!wa.size || !wb.size) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  if (inter < TITLE_MIN_OVERLAP_WORDS) return false;
  const union = wa.size + wb.size - inter;
  if (union === 0) return false;
  const ratio = inter / union;
  if (ratio < TITLE_MATCH_THRESHOLD) return false;

  const diff = [...wa].filter((w) => !wb.has(w)).concat([...wb].filter((w) => !wa.has(w)));
  const diffIsPurelyNumeric = diff.length > 0 && diff.every((w) => /^\d+$/.test(w));
  if (diffIsPurelyNumeric) return ratio >= NUMERIC_DIFF_THRESHOLD;
  return true;
}

/**
 * 1) exact platform ID(=video_id 자체가 provider별로 유일하므로 이미 dedupe됨, db.upsertVideo에서 처리)
 * 2) canonical_url 완전 일치
 * 3) title 유사도
 * 를 기준으로 비디오 배열을 클러스터로 묶는다. 각 클러스터의 대표(representative)는
 * "조회수가 가장 높은 variant"로 고른다(PRODUCT.md §14 정책 3안 채택 — 이유: 원본 판별은
 * 메타데이터만으론 신뢰 있게 못 하고, 데이터 신뢰도 랭킹도 아직 없어 조회수가 가장 객관적).
 */
function clusterVideos(videos) {
  const clusters = [];
  const usedUrl = new Map();

  for (const v of videos) {
    // 2) canonical URL 완전 일치
    if (usedUrl.has(v.canonical_url)) {
      clusters[usedUrl.get(v.canonical_url)].members.push(v);
      continue;
    }
    // 3) 기존 클러스터 대표와 제목 유사도 비교
    let matched = -1;
    for (let i = 0; i < clusters.length; i++) {
      const rep = clusters[i].members[0];
      if (titlesMatch(rep.title, v.title)) {
        matched = i;
        break;
      }
    }
    if (matched >= 0) {
      clusters[matched].members.push(v);
    } else {
      clusters.push({ members: [v] });
      usedUrl.set(v.canonical_url, clusters.length - 1);
    }
  }

  return clusters.map((c) => {
    const sorted = [...c.members].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    return {
      representative: sorted[0],
      variants: sorted,
      variant_count: sorted.length,
    };
  });
}

module.exports = { titleSimilarity, titlesMatch, clusterVideos, normalizeTitle, TITLE_MATCH_THRESHOLD, TITLE_MIN_OVERLAP_WORDS };
