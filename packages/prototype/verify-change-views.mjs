// 动态视图交互验证：使用不透明 sandbox，全部数据为本地虚构数据。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { htmlIssues, sandboxCsp } from '../../.agents/skills/spec-trail/prototype/scripts/html.mjs';
const root = new URL('.', import.meta.url);
const html = await readFile(new URL('dist/quiet-changes/index.html', root), 'utf8');
assert.deepEqual(htmlIssues(html), []);
const server = createServer((req,res) => {
  const u = new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(u.pathname === '/frame') { res.setHeader('Content-Security-Policy',sandboxCsp); return res.end(html); }
  res.end(`<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/frame#${u.searchParams.get('hash') || '/changes'}"></iframe>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const output=resolve('artifacts/change-views'); await mkdir(output,{recursive:true});
const browser=await chromium.launch({chromiumSandbox:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
const checks=[],errors=[]; let page, frame;
async function open(hash='/changes',width=1440,height=900) {
  await page?.close(); page=await browser.newPage({viewport:{width,height}});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():(errors.push('Unexpected external request'),r.abort()));
  await page.goto(`${origin}/?hash=${encodeURIComponent(hash)}`);
  page.setDefaultTimeout(5000); frame=page.frames()[1]; await frame.locator('.view-tabs').waitFor();
}
const el=s=>frame.locator(s);
const action=(name,arg)=>el(`[data-action="${name}"]${arg!==undefined?`[data-arg="${arg}"]`:''}`).first().click();
const toggleFilter=async arg=>{ await action('filter-menu'); await action('toggle-filter',arg); await page.keyboard.press('Escape'); };
const selected=()=>el('.view-tabs [aria-selected="true"]').innerText();
const rowCount=()=>el('.change-row').count();
const overflow=()=>frame.evaluate(()=>[document.documentElement,...document.querySelectorAll('.page,.views-toolbar,.view-tab-bar,.pop')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.className||e.tagName));
async function check(name,run) { await run(); checks.push(name); console.log('PASS '+name); }
try {
  await check('浅深主题 × 桌面平板手机及 320px，管理与编辑无溢出',async()=>{
    for(const theme of ['light','dark']) for(const [w,h] of [[1440,900],[834,1194],[390,844],[320,720]]) {
      await open(`/changes?theme=${theme}&scene=views-saved`,w,h);
      assert.deepEqual(await overflow(),[]);
      await action('manage-views'); await page.waitForTimeout(180); assert.deepEqual(await overflow(),[]);
      await page.screenshot({path:`${output}/manager-${theme}-${w}.png`});
      await action('add-managed-view'); assert.deepEqual(await overflow(),[]);
      assert.equal(await el('[data-view-field="states"]').count(),4);
      await page.screenshot({path:`${output}/editor-${theme}-${w}.png`});
      assert.equal(await el('[data-action="apply-view-editor"]').isVisible(),true);
      const box=await el('[data-action="apply-view-editor"]').boundingBox(); assert.ok(box.y+box.height<=h, 'editor footer stays in viewport');
    }
  });
  await check('首次默认我的；临时修改、恢复及显式保存',async()=>{
    await open(); assert.match(await selected(),/我的/); assert.equal(await rowCount(),3);
    assert.equal(await el('.view-condition-chips').count(),0);
    assert.equal(await el('[data-key="filter-menu"] .badge-count').count(),0);
    await toggleFilter('urgency:high');
    assert.equal(await el('.chip').count(),1);
    assert.match(await el('.chip').innerText(),/紧急程度/);
    await action('drop-filter','urgency:high'); assert.equal(await rowCount(),3);
    assert.equal(await el('.view-condition-chips').count(),0);
    await toggleFilter('creators:@me'); assert.equal(await rowCount(),8);
    assert.equal(await el('.view-dirty-bar').count(),1);
    await action('restore-change-view'); assert.equal(await rowCount(),3);
    await toggleFilter('creators:@me'); await action('save-current-view');
    assert.equal(await el('.view-dirty-bar').count(),0);
    await action('select-change-view','system:archived'); assert.equal(await rowCount(),3);
    assert.equal(await el('.view-condition-chips').count(),0);
    await action('select-change-view','mine'); assert.equal(await rowCount(),8);
  });
  await check('添加继承当前筛选显示；取消不保存；状态并集与创建者交集',async()=>{
    await open(); await action('display-menu'); await action('set-display','sort:urgency');
    await action('manage-views'); await action('add-managed-view');
    assert.equal(await el('[data-view-select="sort"]').inputValue(),'urgency');
    assert.equal(await el('[data-view-field="creators"][value="@me"]').isChecked(),true);
    await el('#view-name').fill('我的交付');
    await el('[data-view-field="states"][value="archived"]').check();
    await action('apply-view-editor');
    assert.equal(await el('.view-tabs').getByText('我的交付',{exact:true}).count(),0);
    await action('cancel-view-manager');
    await action('manage-views'); assert.equal(await el('.managed-view-label').getByText('我的交付',{exact:true}).count(),0);
    await action('add-managed-view'); await el('#view-name').fill('我的交付');
    await el('[data-view-field="states"][value="archived"]').check();
    await action('apply-view-editor'); await action('confirm-view-manager');
    assert.match(await selected(),/我的交付/); assert.equal(await rowCount(),4);
    await action('manage-views'); await el('.managed-view').filter({hasText:'我的交付'}).getByRole('button',{name:'编辑 我的交付',exact:true}).click();
    assert.equal(await el('[data-view-field="states"][value="archived"]').isChecked(),true);
    await el('[data-view-field="states"][value="active"]').uncheck();
    await el('[data-view-field="states"][value="archived"]').uncheck();
    await el('[data-view-select="view"]').selectOption('board');
    await action('apply-view-editor'); await action('confirm-view-manager');
    assert.equal(await rowCount(),4); assert.match(await el('.view-layout-note').innerText(),/保留已选看板设置/);
  });
  await check('名称校验、编辑已有配置不受临时条件覆盖',async()=>{
    await open(); await action('manage-views'); await action('add-managed-view'); await action('apply-view-editor');
    assert.match(await el('.view-editor-error').innerText(),/请输入/);
    await el('#view-name').fill('我的'); await action('apply-view-editor'); assert.match(await el('.view-editor-error').innerText(),/同名/);
    await action('cancel-view-editor'); await action('cancel-view-manager');
    await toggleFilter('creators:@me'); await action('manage-views'); await action('edit-managed-view','mine');
    assert.equal(await el('[data-view-field="creators"][value="@me"]').isChecked(),true);
  });
  await check('排序、显隐、删除及键盘/触屏替代，确认才生效',async()=>{
    await open('/changes?scene=views-saved'); await action('manage-views');
    await el('[data-view-drag="high"]').focus(); await page.keyboard.press('Alt+ArrowUp');
    assert.equal(await el('[data-view-row]').first().getAttribute('data-view-row'),'high');
    await action('view-visibility','mine');
    assert.equal(await el('.view-tabs [data-arg="mine"]').count(),1);
    await action('confirm-view-manager'); assert.equal(await el('.view-tabs [data-arg="mine"]').count(),0);
    assert.match(await selected(),/进行中/);
    await action('manage-views'); await action('view-visibility','mine'); await action('confirm-view-manager');
    assert.equal(await el('.view-tabs [data-arg="mine"]').count(),1);
    await action('select-change-view','mine'); await action('manage-views'); await action('delete-managed-view','mine'); await action('confirm-view-manager');
    assert.match(await selected(),/进行中/); await action('manage-views'); assert.equal(await el('[data-view-row="mine"]').count(),0);
    await page.keyboard.press('Escape'); assert.equal(await el('.pop').count(),0);
    assert.equal(await el('[data-key="manage-views"]').evaluate(e=>e===document.activeElement),true);
    await action('manage-views');
    await el('[data-view-drag="shipped"]').dragTo(el('[data-view-row="high"]'));
    assert.equal(await el('[data-view-row]').first().getAttribute('data-view-row'),'shipped');
  });
  await check('取消为零隐藏快捷入口，状态选项保留；已完成与已归档互斥',async()=>{
    await open('/changes?scene=views-no-cancelled'); assert.equal(await el('.view-tabs [data-arg="system:cancelled"]').count(),0);
    await action('manage-views'); await action('add-managed-view'); assert.equal(await el('[data-view-field="states"][value="cancelled"]').isEnabled(),true);
    await page.keyboard.press('Escape');
    await action('select-change-view','system:completed'); assert.equal(await rowCount(),1); assert.match(await el('.rows').innerText(),/费用导出/);
    await action('select-change-view','system:archived'); assert.equal(await rowCount(),3);
    assert.equal(await el('.view-condition-chips').count(),0); assert.doesNotMatch(await el('.table').innerText(),/费用导出/);
  });
  await check('保存失败保留草稿，重试成功后更新 tab',async()=>{
    await open('/changes?scene=views-save-error'); await action('manage-views'); await action('edit-managed-view','mine'); await el('#view-name').fill('我的工作'); await action('apply-view-editor'); await action('confirm-view-manager');
    assert.match(await el('.view-save-error').innerText(),/修改仍在这里/); assert.match(await selected(),/我的/);
    await action('confirm-view-manager'); assert.match(await selected(),/我的工作/); assert.equal(await el('.pop').count(),0);
  });
  await check('窄屏切换右侧 tab 后选中项保持可见',async()=>{
    await open('/changes?scene=views-saved',320,720);
    await action('select-change-view','system:archived'); await page.waitForTimeout(100);
    const visible=await el('.view-tabs').evaluate(t=>{const b=t.getBoundingClientRect(),a=t.querySelector('[aria-selected="true"]').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;});
    assert.equal(visible,true);
  });
  await check('详情返回保持视图，手机列表降级不覆盖看板选择',async()=>{
    await open(); await action('display-menu'); await action('set-display','view:board'); await page.keyboard.press('Escape'); await action('save-current-view');
    await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(200);
    assert.equal(await el('.board').count(),0); assert.equal(await rowCount(),3);
    await action('manage-views'); await action('edit-managed-view','mine'); assert.equal(await el('[data-view-select="view"]').inputValue(),'board'); await page.keyboard.press('Escape');
    await el('.change-row').first().click(); await page.waitForTimeout(100); await frame.evaluate(()=>history.back()); await el('.view-tabs').waitFor(); assert.match(await selected(),/我的/);
  });
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/verification.json`,JSON.stringify({checks,errors},null,2));
  console.log(`${checks.length} checks passed; no console/page errors.`);
} catch(error) { await page?.screenshot({path:`${output}/failure.png`}); await writeFile(`${output}/failure.html`,await frame.content()); console.error('Runtime errors:',errors); throw error; } finally { await browser.close(); await new Promise(r=>server.close(r)); }
