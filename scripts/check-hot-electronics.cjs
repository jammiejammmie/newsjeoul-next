const {spawn}=require('node:child_process')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright')
const entries=require('../docs/hot-electronics-20261026.json').entries
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3111'],{stdio:'ignore'})
;(async()=>{let browser;try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3111')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 const page=await browser.newPage({viewport:{width:375,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 const links=new Set(),results=[]
 for(const e of entries){
  const response=await page.goto(e.url.replace('https://newsjeoul.co.kr','http://127.0.0.1:3111'),{waitUntil:'networkidle'})
  assert.equal(response.status(),200);assert.equal(await page.locator('h1').innerText(),e.title)
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),e.url)
  assert.equal(await page.locator('[data-affiliate-position="bottom"]').count(),1)
  for(const slot of e.slots) assert.equal(await page.locator('[data-affiliate-position="bottom"] a[href="/go/'+slot+'"]').count(),1)
  const internal=await page.locator('article a[href^="/hub/"]').evaluateAll(as=>as.map(a=>a.getAttribute('href')))
  assert.ok(internal.length>=3,e.url);internal.forEach(x=>links.add(x))
  assert.ok(!(await page.locator('article').innerText()).includes('](/hub/'))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),e.url)
  results.push({url:e.url,internalLinks:internal,ads:e.slots})
 }
 for(const p of links){const resp=await fetch('http://127.0.0.1:3111'+p);assert.equal(resp.status,200,p)}
 await page.goto('http://127.0.0.1:3111/hub/lg-gram-2026/ram-ssd-1sey4q',{waitUntil:'networkidle'})
 await page.screenshot({path:'/tmp/newsjeoul-hot-mobile.png',fullPage:true})
 assert.deepEqual(errors,[])
 fs.writeFileSync('/tmp/newsjeoul-hot-qa.json',JSON.stringify(results,null,2))
 console.log('PASS: '+entries.length+' articles; '+links.size+' internal destinations; affiliate slots, canonicals, rendered internal anchors, mobile width, no JS errors')
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1})
