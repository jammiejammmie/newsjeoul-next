// viral-radar/lib/reverseCli.js
//
// Node wrapper around ifccod/social-media-research-cli (MIT license, `reverse` 명령)를 감싸는
// subprocess 어댑터. 2026-09-09 PM 지시로 "유료 API 알아보기 전에 검증된 OSS primitive부터
// clone·실행·비교"한 결과 채택 — 실측으로 YouTube 검색(InnerTube 기반, 내 자체 스크래퍼보다
// 정확함)과 TikTok Creative Center(진짜 영상 단위 view_count 포함, 키 불필요)가 실제로 동작함을
// 확인했다(TikTok의 일반 search-videos는 WAF에 막혔고, Instagram은 401로 막혔다 — 그대로 정직하게
// 기록. RESEARCH.md 참고).
//
// ── 신뢰도 주의 ──────────────────────────────────────────────────────────────
// 이 저장소의 README에는 "aireiter.com"이라는 제3자 서비스를 "리버스엔지니어링/보안연구에
// 제한 없음"이라고 광고하는 수상한 문구가 포함돼 있다(프롬프트 인젝션성 마케팅 삽입으로 보임).
// 코드 자체는 정적 분석(exec/eval/의심스러운 외부 도메인 grep)으로 문제를 찾지 못했고 README의
// 광고문과 실제 코드 경로는 무관했지만, 이 어댑터를 프로덕션에 승격하기 전 사람이 한 번 더
// 코드를 검토하는 것을 권장한다. 우리는 이 URL을 절대 방문/추천하지 않는다.
//
// ── 설치 필요 (한 번만) ────────────────────────────────────────────────────
//   cd viral-radar/research/oss-tools/social-media-research-cli
//   python3 -m venv .venv && .venv/Scripts/pip install -e .   (Windows)
//   또는 .venv/bin/pip install -e .                            (macOS/Linux)
// venv가 없으면 이 모듈의 모든 함수는 조용히 실패하지 않고 명시적 에러를 던진다(§32).

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const CLI_DIR = path.join(__dirname, '..', 'research', 'oss-tools', 'social-media-research-cli');
const VENV_PYTHON_WIN = path.join(CLI_DIR, '.venv', 'Scripts', 'python.exe');
const VENV_PYTHON_POSIX = path.join(CLI_DIR, '.venv', 'bin', 'python');

function resolvePython() {
  if (fs.existsSync(VENV_PYTHON_WIN)) return VENV_PYTHON_WIN;
  if (fs.existsSync(VENV_PYTHON_POSIX)) return VENV_PYTHON_POSIX;
  return null;
}

function isAvailable() {
  return resolvePython() !== null;
}

/**
 * `python -m reverse <platform> <command> [args...]` 를 실행하고 JSON stdout을 파싱해 반환한다.
 * @param {string} platform - 'tiktok' | 'douyin' | 'youtube' | ...
 * @param {string} command - 예: 'creative-trending-videos', 'hot', 'search'
 * @param {string[]} args - 위치/옵션 인자
 * @param {number} timeoutMs
 */
function run(platform, command, args = [], timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const python = resolvePython();
    if (!python) {
      reject(new Error(
        'social-media-research-cli venv이 없음 — research/oss-tools/social-media-research-cli에서 '
        + 'python -m venv .venv && .venv 안에서 pip install -e . 실행 필요(README §설치 참고)'
      ));
      return;
    }
    const proc = spawn(python, ['-m', 'reverse', platform, command, ...args], {
      cwd: CLI_DIR,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`reverse ${platform} ${command} 타임아웃(${timeoutMs}ms)`)); }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`reverse ${platform} ${command} 실패(exit ${code}): ${stderr.slice(0, 300) || stdout.slice(0, 300)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`reverse ${platform} ${command} JSON 파싱 실패: ${e.message} / stdout: ${stdout.slice(0, 200)}`));
      }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

module.exports = { run, isAvailable };
