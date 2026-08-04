// lib/topics.ts를 node에서 그대로 불러오는 로더(테스트·운영 점검 공용).
//
// 왜 필요한가: lib/topics.ts는 TS이고 supabase 클라이언트를 import한다. 예전에는 파일에서
// 순수 함수 구간만 정규식으로 잘라내 평가했는데, 두 번 깨졌다 —
//  (1) 추출 범위 안에 DB 조회 함수를 새로 넣었을 때 원인 불명 크래시
//  (2) 타입 표기 제거 정규식이 `: string[]`을 지우다 `function f(x)[] {`를 만들었을 때 구문 오류
// 정규식으로 TS를 다루는 접근 자체가 문제였다. TypeScript 컴파일러로 정식 트랜스파일하고
// supabase만 스텁으로 바꿔치기하면, 파일 구조가 어떻게 바뀌어도 깨지지 않는다.
//
// 네트워크는 타지 않는다: createClient가 스텁이라 DB 호출 함수는 애초에 동작하지 않는다.
// 순수 함수(pickHeroTopic/assignClusterKeys/diversifyForIndex/pickSideTopics)만 쓰는 용도다.
const fs = require('fs');
const path = require('path');
const tsc = require('typescript');

function loadTopicsModule() {
  const tsPath = path.resolve(__dirname, '../../lib/topics.ts');
  const source = fs.readFileSync(tsPath, 'utf8');
  const { outputText } = tsc.transpileModule(source, {
    compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2020 },
    fileName: 'topics.ts',
  });

  const stubRequire = (id) => {
    if (id === '@supabase/supabase-js') {
      // 호출되면 즉시 알아채도록 던진다 — 순수 함수만 쓰는 용도임을 강제한다.
      return { createClient: () => { throw new Error('load-topics-module: DB 조회 함수는 이 로더에서 쓸 수 없습니다'); } };
    }
    return require(id);
  };

  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(stubRequire, mod, mod.exports);
  return mod.exports;
}

module.exports = { loadTopicsModule };
