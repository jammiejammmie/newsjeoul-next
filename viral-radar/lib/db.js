// viral-radar/lib/db.js
//
// 로컬 JSON 파일 기반 저장소. 프로덕션 Supabase에는 아직 손대지 않는다(§27 기존 시스템 보호 —
// 이 세션엔 SUPABASE_SERVICE_KEY가 없어 쓰기 권한도 없다). supabase/viral_radar_schema.sql에
// 정의된 것과 동일한 테이블 모양을 JSON 파일로 흉내 낸 것 — 나중에 서비스 키가 생기면
// 이 모듈의 함수 시그니처를 그대로 유지한 채 내부만 Supabase REST 호출로 바꾸면 된다
// (호출부 — collect/classify/rank 스크립트 — 는 수정할 필요 없게 설계).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const VIDEOS_DIR = path.join(DATA_DIR, 'videos'); // video_id별 최신 상태(전체 후보 마스터)
const CANDIDATES_DIR = path.join(DATA_DIR, 'candidates'); // 날짜별 그날 수집분 원본 로그
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.jsonl'); // append-only metrics snapshot
const RANKINGS_DIR = path.join(DATA_DIR, 'rankings');

for (const d of [VIDEOS_DIR, CANDIDATES_DIR, RANKINGS_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

function todayKst() {
  // KST = UTC+9. 서버 타임존과 무관하게 항상 KST 날짜를 쓴다(PRODUCT.md §20 DAILY CUTOFF가 KST 기준).
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function safeFileId(videoId) {
  return videoId.replace(/[:/]/g, '__');
}

/** 오늘 수집분 원본을 그대로 로그로 남긴다(감사 추적용, 덮어쓰지 않고 append). */
function appendCandidateLog(dateStr, entry) {
  const file = path.join(CANDIDATES_DIR, `${dateStr}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(entry) + '\n');
}

/** video_id 마스터 레코드 upsert. 이미 있으면 병합(새 값이 null이 아니면 덮어씀, 최초 발견 시각은 보존). */
function upsertVideo(video) {
  const file = path.join(VIDEOS_DIR, `${safeFileId(video.video_id)}.json`);
  let merged = video;
  if (fs.existsSync(file)) {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    merged = {
      ...prev,
      ...Object.fromEntries(Object.entries(video).filter(([, v]) => v !== null && v !== undefined)),
      first_detected_at: prev.first_detected_at, // 최초 포착 시각은 절대 덮어쓰지 않음
    };
  }
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
  return merged;
}

function getAllVideos() {
  return fs.readdirSync(VIDEOS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(VIDEOS_DIR, f), 'utf8')));
}

function getVideo(videoId) {
  const file = path.join(VIDEOS_DIR, `${safeFileId(videoId)}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function appendSnapshot(snapshot) {
  fs.appendFileSync(SNAPSHOTS_FILE, JSON.stringify(snapshot) + '\n');
}

function getSnapshots(videoId) {
  if (!fs.existsSync(SNAPSHOTS_FILE)) return [];
  return fs.readFileSync(SNAPSHOTS_FILE, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((s) => s.video_id === videoId);
}

function saveRanking(dateStr, ranking) {
  const file = path.join(RANKINGS_DIR, `${dateStr}.json`);
  fs.writeFileSync(file, JSON.stringify(ranking, null, 2));
}

function loadRanking(dateStr) {
  const file = path.join(RANKINGS_DIR, `${dateStr}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 2026-09-09 추가 — provider별 수집 퍼널(원시 후보→시간조건 통과→숏폼 확인→최종)을 그대로
// 보존한다(§Observability, "코드를 많이 만들었다가 아니라 실제로 신뢰할 수 있게 가져왔는가").
const FUNNEL_FILE = path.join(DATA_DIR, 'funnel-log.jsonl');
function saveFunnel(dateStr, providerName, funnel) {
  fs.appendFileSync(FUNNEL_FILE, JSON.stringify({ date: dateStr, provider: providerName, ...funnel, logged_at: new Date().toISOString() }) + '\n');
}

module.exports = {
  todayKst, upsertVideo, getAllVideos, getVideo,
  appendSnapshot, getSnapshots, appendCandidateLog,
  saveRanking, loadRanking, saveFunnel,
};
