import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { htmlIssues, sandboxCsp } from '../../.agents/skills/spec-trail/prototype/scripts/html.mjs';
const html = await readFile(new URL('dist/quiet-changes/index.html', import.meta.url), 'utf8');
assert.deepEqual(htmlIssues(html), []);
const server = createServer((req,res) => {
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url.startsWith('/frame')) { res.setHeader('Content-Security-Policy',sandboxCsp); return res.end(html); }
  const hash = new URL(req.url,'http://localhost').searchParams.get('hash');
  res.end(`<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/frame#${hash}"></iframe>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const out=new URL('../../artifacts/deferred-requirement/',import.meta.url);
await mkdir(out,{recursive:true});
let browser,page; const errors=[],checks=[];
try {
  browser=await chromium.connectOverCDP('http://127.0.0.1:9222');
  page=await browser.contexts()[0].newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(5000);
  for(const theme of ['light','dark']) for(const [width,height] of [[1440,900],[834,1194],[390,844],[320,720]]) {
    await page.setViewportSize({width,height});
    await page.goto(`${origin}/?hash=${encodeURIComponent('/changes?scene=deferred&theme='+theme)}`);
    const f=page.frames()[1]; const el=s=>f.locator(s);
    const action=async(name,arg)=>el(`[data-action="${name}"]${arg?`[data-arg="${arg}"]`:''}`).first().click();
    await el('.change-row').first().waitFor();
    assert.match(await el('.group-h').allTextContents().then(x=>x.join()),/暂缓/);
    const row=el('[data-key="row:templates-from-history"]');
    assert.match(await row.innerText(),/暂缓 · 先记录需求/);
    assert.equal(await row.evaluate(e=>e.closest('ul').previousElementSibling.textContent.trim()),'暂缓1');
    await page.screenshot({path:new URL(`list-${theme}-${width}.png`,out).pathname});
    if(width>=834) {
      await action('display-menu'); await action('set-display','view:board'); await page.keyboard.press('Escape');
      const paused=el('.board-col[aria-label="暂缓"]');
      assert.equal(await paused.locator('.card').count(),1);
      assert.match(await paused.innerText(),/先记录需求/);
      assert.equal(await el('.board-col[aria-label="受阻"] [data-arg="templates-from-history"]').count(),0);
      await page.screenshot({path:new URL(`board-${theme}-${width}.png`,out).pathname});
      await action('open-change','templates-from-history');
    } else await row.click();
    await el('.callout').first().waitFor();
    assert.match(await el('.callout').first().innerText(),/暂缓/);
    assert.match(await el('.callout').first().innerText(),/明确恢复后再推进/);
    assert.equal(await el('.callout.warn,.callout.bad').count(),0);
    assert.match(await el('.qa').innerText(),/是否支持合并/);
    assert.deepEqual(await f.evaluate(()=>[document.documentElement,...document.querySelectorAll('.page,.doc-article')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className)),[]);
    await page.screenshot({path:new URL(`detail-${theme}-${width}.png`,out).pathname});
    await page.goto(`${origin}/?hash=${encodeURIComponent('/changes/templates-from-history/tasks?theme='+theme)}`);
    assert.match(await page.frames()[1].locator('article').innerText(),/需求已记录，暂未安排任务/);
    checks.push(`${theme} ${width}: list, ${width>=834?'board, ':''}detail, empty tasks`);
  }
  await page.goto(`${origin}/?hash=${encodeURIComponent('/changes/timezone-drift-fix')}`);
  assert.match(await page.frames()[1].locator('.callout.bad').innerText(),/等待测试设备/);
  assert.deepEqual(errors,[]);
  await writeFile(new URL('checks.json',out),JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
} finally {
  await page?.close();
  await browser?.close(); // Disconnect this CDP client; the shared browser remains running.
  server.closeAllConnections();
  server.close();
}
