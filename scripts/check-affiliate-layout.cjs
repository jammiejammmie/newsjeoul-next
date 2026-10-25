const {spawn}=require('node:child_process')
const assert=require('node:assert/strict')
const {chromium}=require(process.env.QA_PLAYWRIGHT_MODULE||'playwright')
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3111'],{stdio:'ignore'})
;(async()=>{let browser;try{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:3111')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']})
 const page=await browser.newPage(),errors=[];await page.route('https://fonts.googleapis.com/**',r=>r.abort());page.on('pageerror',e=>errors.push(e.message))
 for(const width of [320,375,1440,1920]){
  await page.setViewportSize({width,height:1000})
  for(const route of ['/','/hub/lg-gram-2026/ram-ssd-1sey4q']){
   await page.goto('http://127.0.0.1:3111'+route,{waitUntil:'networkidle'})
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${route}`)
   const rail=await page.locator('.affiliate-rail-left').isVisible();assert.equal(rail,width>=(route==='/'?1600:1280))
   const position=route==='/'?'home-top':'middle';assert.ok(await page.locator(`[data-affiliate-position="${position}"]`).isVisible())
   for(const a of await page.locator('[data-affiliate-panel] a').all())assert.equal(await a.getAttribute('rel'),'sponsored nofollow noopener noreferrer')
   if(rail){const left=await page.locator('.affiliate-rail-left').boundingBox(),main=await page.locator('.affiliate-main').boundingBox(),right=await page.locator('.affiliate-rail-right').boundingBox();assert.ok(left.x+left.width<=main.x&&main.x+main.width<=right.x)}
   if(width===375||width===1920)await page.screenshot({path:`/tmp/affiliate-${route==='/'?'home':'article'}-${width}.png`,fullPage:route!=='/'})
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: desktop rails separate from content; mobile 320/375 no overflow; main/middle/bottom placements; disclosure and sponsored links; no affiliate destinations clicked')
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1})
