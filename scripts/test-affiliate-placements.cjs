const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const cache = new Map()
function load(file) {
 file = path.resolve(file)
 if (!fs.existsSync(file)) file = fs.existsSync(file+'.ts') ? file+'.ts' : path.join(file,'index.ts')
 if(fs.statSync(file).isDirectory())file=path.join(file,'index.ts')
 if(cache.has(file))return cache.get(file)
 const exports={};cache.set(file,exports)
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 vm.runInNewContext(code,{exports,process,require:id=>id.startsWith('@/')?load(id.slice(2)):id.startsWith('.')?load(path.resolve(path.dirname(file),id)):require(id)},{filename:file})
 return exports
}
const {searchEntryPlacement}=load('lib/affiliate-placements.ts')
const {findAffiliateSlot}=load('lib/hubs/index.ts')
const Panel=load('components/editorial/AffiliatePanel.tsx').default
const {renderToStaticMarkup}=require('react-dom/server')
const paths=[
 '/hub/melon-streaming/family-account','/topic/yoo-jaesuk-son-jiho-update',
 '/hub/youth-savings-account/job-change','/hub/melon-streaming/streaming-light-vs-regular',
 '/hub/galaxy-z-flip8/cover-widget-missing','/hub/galaxy-buds4/single-bud-replacement',
 '/hub/galaxy-s25-ultra/s-1xzjlx','/hub/melon-streaming',
 // Prefix policy covers every existing Melon document without renaming any slug.
 '/hub/melon-streaming/any-existing-document',
]
for(const p of paths){
 const placement=searchEntryPlacement(p);assert.ok(placement,p)
 for(const id of placement.slots){
  const entry=findAffiliateSlot(id)?.entry;assert.ok(entry?.targetUrl,id)
  const url=new URL(entry.targetUrl);assert.equal(url.hostname,'link.coupang.com');assert.equal(url.searchParams.get('lptag'),'AF3904190')
 }
 const html=renderToStaticMarkup(Panel({placement}))
 assert.equal((html.match(/data-affiliate-panel/g)||[]).length,1)
 assert.ok(html.includes('sponsored nofollow noopener noreferrer'))
 assert.ok(html.indexOf('수수료')<html.indexOf('href='))
 assert.ok(!html.includes('최저가'))
}
assert.equal(searchEntryPlacement('/hub/melon-streaming-other/article'),null)
assert.equal(searchEntryPlacement('/topic/unrelated'),null)
assert.equal(renderToStaticMarkup(Panel({placement:null})), '')
console.log('PASS: search-entry coverage, real registered tracking targets, server-rendered disclosure, unrelated paths excluded; no affiliate destinations requested')

const Hot=load('lib/hubs/editorial/hot-electronics-20261026.ts').HOT_ELECTRONICS_20261026
for(const docs of Object.values(Hot))for(const doc of docs)for(const slot of doc.affiliateSlotIds){
 const u=new URL(findAffiliateSlot(slot).entry.targetUrl)
 assert.equal(u.hostname,'link.coupang.com');assert.equal(u.searchParams.get('lptag'),'AF3904190')
}
const Text=load('components/editorial/ArticleText.tsx').default
const safe=renderToStaticMarkup(Text({text:'읽기 [램 비교](/hub/lg-gram-2026/ram-ssd-1sey4q)'}))
assert.ok(safe.includes('href="/hub/lg-gram-2026/ram-ssd-1sey4q"'))
const unsafe=renderToStaticMarkup(Text({text:'[x](javascript:alert(1)) <script>bad()</script>'}))
assert.ok(!unsafe.includes('<a'));assert.ok(!unsafe.includes('<script>'))
console.log('PASS: hot-product affiliate ownership, internal link rendering, unsafe markup remains plain escaped text')
