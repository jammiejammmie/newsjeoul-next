#!/usr/bin/env node
/**
 * 허브 제휴 슬롯의 targetUrl을 쿠팡 파트너스 검색 API 결과로 채운다.
 *
 * 왜 스크립트인가: 추적 URL은 길고 사람이 옮겨 적으면 반드시 틀린다. 잘못된 제휴 링크는
 * 독자를 엉뚱한 상품으로 보내고 약관 위반이 된다(설계서 §8.1). 링크가 바뀌거나 상품이
 * 단종되면 이 스크립트를 다시 돌려 갱신한다 — 허브 파일을 손으로 고치지 않는다.
 *
 * 상품 선택 방식: 검색 상위 1개를 그대로 쓰지 않는다. 슬롯마다 이름 검증 조건(must/exclude)을
 * 두고 통과한 첫 상품만 채택하며, 통과가 없으면 슬롯을 비워둔다. 실측에서 'S25 울트라'
 * 검색에 S25 Edge가, '삼성 비스포크'에 DJI 제품이 상위로 잡혔다 — 검증 없이 쓰면 그대로 나간다.
 * 빈 슬롯은 /go/{slot}이 404와 안내를 반환하므로(app/go/[slot]/route.ts) 죽은 링크가 되지 않는다.
 *
 * 검색 API의 productUrl은 이미 파트너스 추적 파라미터(lptag)가 붙은 링크라 딥링크 API를
 * 따로 거치지 않는다.
 *
 * 사용법:
 *   COUPANG_ACCESS_KEY=... COUPANG_SECRET_KEY=... node scripts/update-coupang-slots.js
 *   node scripts/update-coupang-slots.js --dry     (파일을 고치지 않고 결과만 출력)
 *
 * 키는 절대 커밋하지 않는다. 환경변수로만 받는다.
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ACCESS = process.env.COUPANG_ACCESS_KEY
const SECRET = process.env.COUPANG_SECRET_KEY
const DRY = process.argv.includes('--dry')
const HUB_DIR = path.join(__dirname, '..', 'lib', 'hubs')

const DOMAIN = 'https://api-gateway.coupang.com'
const SEARCH_PATH = '/v2/providers/affiliate_open_api/apis/openapi/products/search'
const LIMIT = 10 // 11 이상은 400 "limit is out of range"

/** 슬롯 → 검색 조건. 허브 파일의 slot 값과 정확히 일치해야 한다. */
const SLOT_QUERIES = {
  'flip8-body':    { file: 'galaxy-z-flip8.ts',    kw: '갤럭시 Z 플립8 자급제',            must: [['플립8', 'flip8', 'z플립8'], ['자급제', 'sm-f']], exclude: ['플립7', 'flip7', '케이스', '필름'] },
  'flip8-case':    { file: 'galaxy-z-flip8.ts',    kw: '갤럭시 Z 플립8 케이스',            must: [['플립8', 'flip8', 'z플립8'], ['케이스']], exclude: ['플립7', 'flip7'] },
  'flip8-film':    { file: 'galaxy-z-flip8.ts',    kw: '갤럭시 Z 플립8 강화유리 필름',      must: [['플립8', 'flip8', 'z플립8'], ['필름', '강화유리']], exclude: ['플립7'] },

  's25u-body':     { file: 'galaxy-s25-ultra.ts',  kw: '갤럭시 S25 울트라 자급제 512GB',    must: [['s25울트라', 's25ultra', 'sm-s938'], ['자급제', 'sm-s938']], exclude: ['edge', '플러스', '케이스', '필름', 's24'] },
  's25u-spen':     { file: 'galaxy-s25-ultra.ts',  kw: '갤럭시 S25 울트라 정품 S펜',        must: [['s25'], ['s펜', 'spen']], exclude: ['s24', '케이스'] },
  's25u-film':     { file: 'galaxy-s25-ultra.ts',  kw: '갤럭시 S25 울트라 강화유리 보호필름', must: [['s25'], ['필름', '강화유리']], exclude: ['케이스', '충전'] },

  'book5-body':    { file: 'galaxy-book5-pro.ts',  kw: '갤럭시북5 프로 NT960XHA',          must: [['갤럭시북5', 'nt960xha', 'nt940xha'], ['프로', 'pro']], exclude: ['파우치', '케이스', '키스킨', '필름', '북4'] },
  'book5-hub':     { file: 'galaxy-book5-pro.ts',  kw: '노트북 USB C 멀티허브 HDMI 이더넷', must: [['허브', 'hub'], ['hdmi', 'c타입', 'usb']], exclude: [] },
  'book5-pouch':   { file: 'galaxy-book5-pro.ts',  kw: '갤럭시북5 프로 파우치',            must: [['갤럭시북', '노트북'], ['파우치', '슬리브', '케이스']], exclude: [] },

  'gram26-body':   { file: 'lg-gram-2026.ts',      kw: 'LG 그램 프로 16Z95U 2026',         must: [['그램', 'gram'], ['16z90u', '16z95u', '17z90u', '17z95u', '2026']], exclude: ['키스킨', '파우치', '필름', '그램북'] },
  'gram26-hub':    { file: 'lg-gram-2026.ts',      kw: 'LG 그램 USB C 멀티허브 HDMI',      must: [['허브', 'hub'], ['hdmi', 'c타입', 'usb']], exclude: [] },
  'gram26-skin':   { file: 'lg-gram-2026.ts',      kw: 'LG 그램 16 키스킨 2026',           must: [['그램', 'gram'], ['키스킨', '파우치', '필름']], exclude: [] },

  'ip17p-body':    { file: 'iphone-17-pro.ts',     kw: '아이폰 17 Pro 자급제',             must: [['아이폰17', 'iphone17'], ['pro', '프로'], ['자급제']], exclude: ['케이스', '필름', '충전기'] },
  'ip17p-charger': { file: 'iphone-17-pro.ts',     kw: '맥세이프 무선충전기 아이폰 17',     must: [['맥세이프', 'magsafe'], ['충전']], exclude: [] },
  'ip17p-film':    { file: 'iphone-17-pro.ts',     kw: '아이폰 17 프로 액정보호필름',       must: [['아이폰17', 'iphone17'], ['필름']], exclude: ['케이스'] },

  'buds4-body':    { file: 'galaxy-buds4.ts',      kw: '삼성전자 갤럭시 버즈4',            must: [['버즈4', 'buds4']], exclude: ['케이스', '이어팁', '커버', '버즈3', '스킨'] },
  'buds4-case':    { file: 'galaxy-buds4.ts',      kw: '갤럭시 버즈4 케이스',              must: [['버즈4', 'buds4'], ['케이스', '커버']], exclude: ['버즈3'] },
  'buds4-tips':    { file: 'galaxy-buds4.ts',      kw: '갤럭시 버즈4 이어팁',              must: [['버즈4', 'buds4'], ['이어팁', '이어캡']], exclude: [] },

  'rv26-roborock': { file: 'robot-vacuum-2026.ts', kw: '로보락 S10 MaxV Ultra',           must: [['로보락', 'roborock'], ['s10', 's9']], exclude: ['소모품', '필터', '먼지봉투'] },
  'rv26-dreame':   { file: 'robot-vacuum-2026.ts', kw: '드리미 로봇청소기 물걸레 자동세척', must: [['드리미', 'dreame'], ['로봇청소기']], exclude: ['소모품', '먼지봉투', '호환', '필터'] },
  'rv26-parts':    { file: 'robot-vacuum-2026.ts', kw: '로보락 소모품 물걸레 필터 먼지봉투', must: [['소모품', '물걸레', '필터', '먼지봉투']], exclude: [] },
}

function authHeader(method, urlPath, query) {
  const d = new Date(), p = (n) => String(n).padStart(2, '0')
  const dt = String(d.getUTCFullYear()).slice(2) + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) +
    'T' + p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z'
  const sig = crypto.createHmac('sha256', SECRET).update(dt + method + urlPath + query).digest('hex')
  return `CEA algorithm=HmacSHA256, access-key=${ACCESS}, signed-date=${dt}, signature=${sig}`
}

async function search(keyword) {
  const q = `keyword=${encodeURIComponent(keyword)}&limit=${LIMIT}`
  const res = await fetch(`${DOMAIN}${SEARCH_PATH}?${q}`, {
    headers: { Authorization: authHeader('GET', SEARCH_PATH, q), 'Content-Type': 'application/json' },
  })
  if (!res.ok) return []
  const j = await res.json()
  return (j?.data?.productData || []).map((p) => ({ name: p.productName, price: p.productPrice, url: p.productUrl }))
}

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '')
function pick(items, must, exclude) {
  return items.find((it) => {
    const n = norm(it.name)
    if ((exclude || []).some((x) => n.includes(norm(x)))) return false
    return (must || []).every((m) => (Array.isArray(m) ? m : [m]).some((x) => n.includes(norm(x))))
  }) || null
}

/** 허브 파일에서 해당 slot의 targetUrl을 설정/교체한다. */
function writeSlot(source, slot, url) {
  // { slot: 'xxx', label: '...', network: 'coupang' } 형태의 한 줄을 찾는다.
  const re = new RegExp(`(\\{\\s*slot:\\s*'${slot}'[^}]*?)(,\\s*targetUrl:\\s*'[^']*')?(\\s*\\})`, 'm')
  if (!re.test(source)) return { source, ok: false }
  return { source: source.replace(re, (_m, head, _old, tail) => `${head}, targetUrl: '${url}'${tail}`), ok: true }
}

;(async () => {
  if (!ACCESS || !SECRET) {
    console.error('COUPANG_ACCESS_KEY / COUPANG_SECRET_KEY 환경변수가 필요합니다.')
    process.exit(1)
  }
  const byFile = {}
  for (const [slot, cfg] of Object.entries(SLOT_QUERIES)) (byFile[cfg.file] ||= []).push([slot, cfg])

  let filled = 0, empty = 0
  for (const [file, entries] of Object.entries(byFile)) {
    const full = path.join(HUB_DIR, file)
    let source = fs.readFileSync(full, 'utf8')
    for (const [slot, cfg] of entries) {
      const hit = pick(await search(cfg.kw), cfg.must, cfg.exclude)
      if (!hit) { console.log(`  [빈슬롯] ${slot} — 검증 통과 상품 없음`); empty++; await sleep(400); continue }
      const r = writeSlot(source, slot, hit.url)
      if (!r.ok) { console.log(`  [경고]  ${slot} — ${file}에서 슬롯을 찾지 못함`); empty++; await sleep(400); continue }
      source = r.source
      filled++
      console.log(`  [채움]  ${slot.padEnd(14)} ${String(hit.price).padStart(9)}원  ${hit.name.slice(0, 40)}`)
      await sleep(400) // rate limit 여유
    }
    if (!DRY) fs.writeFileSync(full, source, 'utf8')
  }
  console.log(`\n${DRY ? '[dry-run] ' : ''}채움 ${filled} · 비움 ${empty}`)
})()

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }
