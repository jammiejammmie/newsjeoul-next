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
const humidifier = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/humidifier-20261027.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:humidifier})
const carbonMat = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/carbon-mat-20261027.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:carbonMat})
const gramDisplay = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/lg-gram-display-20261027.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:gramDisplay})
const fold8Charging = {}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/hubs/editorial/fold8-charging-20261027.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:fold8Charging})
vm.runInNewContext(compiled, { exports: moduleExports, require: id => id.includes('fold8-charging') ? fold8Charging : id.includes('lg-gram-display') ? gramDisplay : id.includes('carbon-mat-') ? carbonMat : id.includes('humidifier-') ? humidifier : id.includes('flip-widget') ? flip : id.includes('buds-recovery') ? recovery : id.includes('energy-voucher') ? energy : id.includes('hot-electronics') ? hot : id.includes('refresh-') ? refresh : practical })
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
const carbonDoc = EDITORIAL_DOCUMENTS['carbon-heated-mat'][0]
assert.equal(carbonDoc.affiliateSlotIds.length, 0)
assert.ok(carbonDoc.sourceNote.includes('newsId=156734593'))
assert.ok(carbonDoc.blocks.some(block => block.content.includes('39~64℃')))
const gramDisplayDoc = EDITORIAL_DOCUMENTS['lg-gram-2026'].find(item => item.slug === 'howto-d3qn0e')
assert.ok(gramDisplayDoc)
assert.deepEqual(Array.from(gramDisplayDoc.affiliateSlotIds), ['gram26-hub'])
assert.ok(gramDisplayDoc.sourceNote.includes('16z95u-gs5wk'))
assert.ok(gramDisplayDoc.blocks.some(block => block.content.includes('Thunderbolt 4')))
const fold8ChargingDoc = EDITORIAL_DOCUMENTS['galaxy-z-fold8'].find(item => item.slug === '45w-charger-pps-cable')
assert.ok(fold8ChargingDoc)
assert.deepEqual(Array.from(fold8ChargingDoc.affiliateSlotIds), ['fold8-charger'])
assert.ok(fold8ChargingDoc.sourceNote.includes('EP-TA845'))
assert.ok(fold8ChargingDoc.blocks.some(block => block.content.includes('30분에 최대 63%')))
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
assert.ok(find('탄소매트 전기료').some(item => item.slug === 'carbon-heated-mat/buying-temperature-wash-cost'))
assert.ok(find('그램 모니터 2대').some(item => item.slug === 'lg-gram-2026/howto-d3qn0e'))
assert.ok(find('폴드8 45W 충전기').some(item => item.slug === 'galaxy-z-fold8/45w-charger-pps-cable'))
console.log('PASS: guide search, Korean multi-word query, Unicode normalization, empty query and limits')
