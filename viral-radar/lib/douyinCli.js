// viral-radar/lib/douyinCli.js
//
// tamnd/douyin-cli(공식 저장소, MIT 계열 라이선스는 저장소 LICENSE 참고) — 지시받은 원래
// 5개 저장소 중 하나. Go 툴체인이 이 환경에 없어 GitHub Release의 공식 Windows amd64
// prebuilt 바이너리를 받아서 썼다(체크섬 검증 완료, checksums.txt 대조).
//   버전: v0.1.1, 다운로드: https://github.com/tamnd/douyin-cli/releases/tag/v0.1.1
//   경로: research/oss-tools/douyin-cli-bin/douyin.exe
//
// 실측 결과(RESEARCH.md 상세): `douyin hot`(realtime 토픽 차트)만 확실히 동작.
// `douyin hot --tab video/music/star`는 Douyin 서버가 "Url doesn't match"로 명시 응답
// (지역 차단 아님, douyin-cli 쪽 엔드포인트가 stale한 것으로 판단) — RESEARCH.md 참고.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BIN_PATH = path.join(__dirname, '..', 'research', 'oss-tools', 'douyin-cli-bin', 'douyin.exe');

function isAvailable() {
  return fs.existsSync(BIN_PATH);
}

/** @param {string[]} args - 예: ['hot', '--tab', 'realtime', '-n', '30', '-o', 'json'] */
function run(args, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!isAvailable()) {
      reject(new Error(`douyin-cli 바이너리 없음(${BIN_PATH}) — GitHub Release에서 windows_amd64.zip 받아 압축 해제 필요`));
      return;
    }
    const proc = spawn(BIN_PATH, [...args, '-o', 'json'], { cwd: path.dirname(BIN_PATH) });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`douyin ${args.join(' ')} 타임아웃`)); }, timeoutMs);
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', () => {
      clearTimeout(timer);
      try {
        // 성공 시 JSON 배열만 stdout에 찍힌다. 실패 시 "fetching ..." 진행 로그 + ERROR 블록이
        // 섞여 나와 JSON.parse가 실패하므로 그 경우를 명시적 에러로 변환한다.
        const jsonMatch = stdout.match(/^\s*(\[[\s\S]*\]|\{[\s\S]*\})\s*$/) || stdout.match(/(\[[\s\S]*\])/);
        if (!jsonMatch) throw new Error('no JSON in output');
        resolve(JSON.parse(jsonMatch[1]));
      } catch (e) {
        reject(new Error(`douyin ${args.join(' ')} 실패: ${(stdout + stderr).replace(/\s+/g, ' ').slice(0, 200)}`));
      }
    });
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

module.exports = { run, isAvailable, BIN_PATH };
