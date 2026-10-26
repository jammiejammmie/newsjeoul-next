const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const compiled = ts.transpileModule(fs.readFileSync('lib/hubs/editorial/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const moduleExports = {}
const practical = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/practical-guides.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:practical})
const refresh = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/refresh-20261026.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:refresh})
const hot = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/hot-electronics-20261026.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:hot})
const energy = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/energy-voucher-20261026.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:energy})
const recovery = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/buds-recovery-20261026.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:recovery})
const flip = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/flip-widget-20261026.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:flip})
vm.runInNewContext(compiled, { exports: moduleExports, require: id => id.includes('flip-widget') ? flip : id.includes('buds-recovery') ? recovery : id.includes('energy-voucher') ? energy : id.includes('hot-electronics') ? hot : id.includes('refresh-') ? refresh : practical })
const { EDITORIAL_DOCUMENTS, mergeEditorialDocuments, mergeEditorialSitemap, editorialSlots } = moduleExports
const total = Object.values(EDITORIAL_DOCUMENTS).flat().length
const budsTotal = EDITORIAL_DOCUMENTS['galaxy-buds4'].length
const doc = EDITORIAL_DOCUMENTS['galaxy-buds4'][0]
assert.equal(mergeEditorialDocuments('galaxy-buds4', []).length, budsTotal)
const merged = mergeEditorialDocuments('galaxy-buds4', [{ ...doc, title: 'stale DB' }, { ...doc, slug: 'other' }])
assert.equal(merged.length, budsTotal + 1)
assert.equal(merged[0].title, doc.title)
assert.equal(mergeEditorialDocuments('unrelated', []).length, 0)
assert.equal(editorialSlots(doc, [
  { slot: 'buds4-body', targetUrl: 'https://example.com' },
  { slot: 'buds4-case', targetUrl: 'https://example.com' },
  { slot: 'buds4-body', targetUrl: null },
]).length, 1)
assert.equal(editorialSlots({ ...doc, affiliateSlotIds: [] }, [{ slot: 'buds4-body', targetUrl: 'https://example.com' }]).length, 0)
const url = 'https://newsjeoul.co.kr/hub/galaxy-buds4/single-bud-replacement'
const sitemap = mergeEditorialSitemap([{ url, lastModified: '2020-01-01' }, { url: 'https://newsjeoul.co.kr/' }])
assert.equal(sitemap.length, total + 1)
assert.equal(sitemap[0].lastModified, doc.updatedAt)
assert.equal(mergeEditorialSitemap([]).length, total)
assert.ok(doc.sourceNote.includes('https://www.samsungsvc.co.kr/solution/25084'))
console.log('PASS: offline availability, DB override, unrelated documents, affiliate scope, sitemap dedup/date')
const searchExports = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/search.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports:searchExports, require:()=>moduleExports})
const find = searchExports.searchEditorialDocuments
assert.equal(find('   ').length, 0)
assert.equal(find('액체').length, 1)
assert.equal(find('없는검색어').length, 0)
assert.equal(find('충전', 1).length, 1)
assert.equal(find('충전', 0).length, 0)
assert.ok(find('아이폰 케이블').every(item => item.type === 'guide' && item.slug.startsWith('iphone-17-pro/')))
assert.equal(find('ＵＳＢ').length, find('usb').length)
console.log('PASS: guide search, Korean multi-word query, Unicode normalization, empty query and limits')
