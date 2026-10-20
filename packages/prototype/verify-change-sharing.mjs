import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { sandboxCsp, htmlIssues } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const html = await readFile(new URL("./dist/change-sharing/index.html", import.meta.url), "utf8");
assert.deepEqual(htmlIssues(html), []);
const server = createServer((req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/favicon.ico") return res.writeHead(204).end();
  if (req.url === "/") return res.end('<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts" src="/preview"></iframe>');
  if (req.url !== "/preview") return res.writeHead(404).end();
  res.setHeader("Content-Security-Policy", sandboxCsp);
  res.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = `${root}artifacts/change-sharing-prototype`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  chromiumSandbox: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
});
const results = [];
try {
  for (const width of [1440, 834, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], requests = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", route => {
      requests.push(route.request().url());
      return new URL(route.request().url()).origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin);
    const frame = page.frameLocator("iframe");
    const openDirectory = async () => { if(width<700) await frame.locator('#open-directory').click(); };
    const chooseTab = async (tab, label) => {
      if(width<700) { await openDirectory(); await frame.locator(`#mobile-directory [data-view="${tab}"]`).click(); }
      else await frame.getByRole('tab',{name:label,exact:true}).click();
    };
    const chooseDoc = async id => { await openDirectory(); await frame.locator(`${width<700?'#mobile-directory':'.document-nav'} [data-doc="${id}"]`).click(); };
    const settings = async () => { if(!await frame.locator('.review-tools').evaluate(el=>el.open)) await frame.locator('.review-tools summary').click(); };
    await frame.getByRole("heading", { name: "技术方案", exact: true }).waitFor();
    assert.equal(await frame.locator("body").evaluate(el => el.scrollWidth <= innerWidth), true);
    const firstTitleTop = await frame.locator('.document-article h1').evaluate(el=>el.getBoundingClientRect().top);
    assert(firstTitleTop<240, `Document title starts too low: ${firstTitleTop}`);
    assert.equal(await frame.locator('.document-article').evaluate(el=>getComputedStyle(el).fontSize),'16px');
    await frame.locator('#font-size').click();
    assert.equal(await frame.locator('.document-article').evaluate(el=>getComputedStyle(el).fontSize),'18px');
    await frame.locator('#font-size').click();
    if(width<1200) await frame.locator('#open-outline').click();
    await frame.locator(`${width<1200?'#outline-dialog':'.page-outline'} [data-section="section-3"]`).click();
    assert.equal(await frame.locator('#section-3').evaluate(el=>el===document.activeElement),true);
    assert(await frame.locator('#reading-progress').evaluate(el=>el.value)>0);
    await frame.locator('#focus-reading').click();
    assert.equal(await frame.locator('.reader-sidebar').isVisible(),false);
    assert.equal(await frame.getByRole('heading',{name:'技术方案',exact:true}).count(),1);
    await frame.locator('#focus-reading').click();
    await frame.getByRole('navigation',{name:'前后文档'}).getByRole('button',{name:'下一篇 实施计划 →'}).click();
    await frame.getByRole('heading',{name:'实施计划',exact:true}).waitFor();
    await frame.getByRole('navigation',{name:'前后文档'}).getByRole('button',{name:'上一篇 ← 技术方案'}).click();
    await frame.getByRole('heading',{name:'技术方案',exact:true}).waitFor();

    await chooseTab("overview", "概览");
    await frame.getByText("Q1 · 筛选条件保留多久？").waitFor();
    await chooseTab("tasks", "任务 3");
    await frame.getByRole("heading", { name: "实施任务", exact: true }).waitFor();
    await chooseDoc("requirement");
    await frame.getByRole("heading", { name: "需求", exact: true }).waitFor();
    await chooseDoc("technical");
    await frame.getByRole("button", { name: "订单列表规范 ↗" }).click();
    await frame.getByRole("status").filter({ hasText: "此内容不在当前分享范围内" }).waitFor();
    await settings();
    await frame.getByRole("button", { name: "模拟新内容推送" }).click();
    await frame.locator(".review-tools summary").click();
    await frame.locator("#new-content").waitFor();
    await chooseTab("previews", "原型");
    await frame.getByRole("button", { name: "待处理 1", exact: true }).click();
    assert.equal(await frame.locator("#orders p:visible").count(), 1);
    await frame.getByRole("button", { name: "手机", exact: true }).click();
    assert.equal(await frame.locator(".order-demo.mobile").count(), 1);
    await chooseTab("integration", "合入变更");
    await frame.getByRole("button", { name: "src/orders/filter.css", exact: true }).click();
    await frame.locator("#diff-text").filter({ hasText: "flex-wrap" }).waitFor();
    if (width < 700) await frame.getByRole("button", { name: "返回文件列表" }).click();
    await chooseTab("evidence", "依据");
    await frame.getByRole("heading", { name: "确认与来源" }).waitFor();
    await settings();
    await frame.locator("#perspective").selectOption("owner");
    await frame.locator("#scene").selectOption("new");
    await frame.getByRole("button", { name: "分享", exact: true }).click();
    await frame.getByRole("button", { name: "创建分享链接", exact: true }).click();
    const oldLink = await frame.getByRole("textbox", { name: "当前分享链接" }).inputValue();
    if (width === 1440 || width === 390) await page.screenshot({ path: `${output}/share-dialog-${width}.png` });
    await frame.getByRole("button", { name: "停止分享", exact: true }).click();
    await frame.getByText("原链接已停止访问，重新分享会生成新链接。").waitFor();
    await frame.getByRole("button", { name: "关闭分享设置", exact: true }).click();
    await frame.locator("#perspective").selectOption("reader");
    await frame.getByRole("heading", { name: "分享已停止", exact: true }).waitFor();
    assert.equal(await frame.locator("#content").isVisible(), false);
    await settings();
    await frame.locator("#perspective").selectOption("owner");
    await frame.getByRole("button", { name: "分享", exact: true }).click();
    await frame.getByRole("button", { name: "创建分享链接", exact: true }).click();
    assert.notEqual(await frame.getByRole("textbox", { name: "当前分享链接" }).inputValue(), oldLink);
    await frame.getByRole("button", { name: "查看分享页 ↗", exact: true }).click();
    await frame.locator("#scene").selectOption("offline");
    await frame.locator("#sync-warning").waitFor();
    await frame.getByRole("button", { name: "重试", exact: true }).click();
    assert.equal(await frame.locator("#sync-warning").isVisible(), false);
    await frame.getByRole("button", { name: "复制链接", exact: true }).click();
    await frame.getByRole("dialog", { name: "复制分享链接" }).waitFor();
    await frame.getByRole("button", { name: "完成", exact: true }).click();
    await frame.locator("#scene").selectOption("unavailable");
    await frame.getByRole("heading", { name: "暂时无法读取内容", exact: true }).waitFor();
    await frame.getByRole("button", { name: "重新读取", exact: true }).click();
    if(width>=700) {
      await frame.getByRole("tab", { name: "概览", exact: true }).focus();
      await page.keyboard.press("End");
      assert.equal(await frame.getByRole("tab", { name: "依据", exact: true }).getAttribute("aria-selected"), "true");
    } else {
      await frame.locator('#open-directory').click(); await page.keyboard.press('Escape');
      assert.equal(await frame.locator('#open-directory').evaluate(el=>el===document.activeElement),true);
    }
    assert.equal(await frame.locator("body").evaluate(el => el.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    assert(requests.every(url => new URL(url).origin === origin));
    results.push({ width, firstTitleTop, readingFontSize:16, readingNavigation:true, passed: true, pageErrors: errors, externalRequests: 0 });
    await page.close();
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
