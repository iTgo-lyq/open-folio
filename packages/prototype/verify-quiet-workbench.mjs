// 工作台新设计的浏览器验证：七个入口 × 两套主题 × 四档尺寸的布局，以及主要交互与状态。
// 在仅授予 allow-scripts 的 iframe 与项目 CSP 下运行，结果与截图输出到 Git 忽略的 artifacts/quiet-workbench/。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { htmlIssues, sandboxCsp } from "../../.agents/skills/spec-trail/prototype/scripts/html.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const entries = {
  home: "quiet-home",
  specs: "quiet-specs",
  changes: "quiet-changes",
  prototypes: "quiet-prototypes",
  account: "quiet-credentials",
  public: "quiet-public",
  share: "quiet-share",
};
const html = Object.fromEntries(await Promise.all(Object.entries(entries).map(async ([k, id]) => [k, await readFile(resolve(root, `dist/${id}/index.html`), "utf8")])));
for (const [k, source] of Object.entries(html)) assert.deepEqual(htmlIssues(source), [], `${k} static contract`);

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (url.pathname === "/frame") {
    res.setHeader("Content-Security-Policy", sandboxCsp);
    return res.end(html[url.searchParams.get("e")]);
  }
  if (url.pathname === "/favicon.ico") return res.writeHead(204).end();
  res.end(`<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/frame?e=${url.searchParams.get("e")}#${url.searchParams.get("h") || ""}"></iframe>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = resolve(root, "../../artifacts/quiet-workbench");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ chromiumSandbox: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });

const checks = [],
  failures = [],
  errors = [];
let page, frame;
async function open(entry, hash = "", size = [1440, 900]) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  page.on("pageerror", (e) => errors.push(`${entry}${hash}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${entry}${hash}: ${m.text()}`));
  await page.route("**/*", (r) => (new URL(r.request().url()).origin === origin ? r.continue() : (errors.push("External request: " + r.request().url()), r.abort())));
  await page.goto(`${origin}/?e=${entry}&h=${encodeURIComponent(hash)}`);
  frame = page.frames()[1];
  await frame.waitForSelector("#app > *, .auth, .public-shell");
  await page.waitForTimeout(150);
}
const $ = (s) => frame.locator(s).first();
const count = (s) => frame.locator(s).count();
const text = (s) => $(s).innerText();
const wait = (ms = 250) => page.waitForTimeout(ms);
async function check(name, fn) {
  try {
    await fn();
    checks.push(name);
  } catch (e) {
    failures.push(`${name}: ${e.message.split("\n")[0]}`);
  }
}
const overflow = () =>
  frame.evaluate(() => {
    const els = [document.documentElement, ...document.querySelectorAll(".page, .doc-scroll, .surface-body, .toolbar, .pub-bar, .list-bar")];
    return els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className || el.tagName);
  });

// 布局矩阵
const sizes = [[1440, 900], [834, 1194], [390, 844], [320, 720]];
const starts = { home: "/home", specs: "/specs/maps/offline", changes: "/changes", prototypes: "/prototypes", account: "/account", public: "/public/offline-maps", share: "/share/offline-map-regions" };
const extra = [["detail", "changes", "/changes/offline-map-regions"], ["diff", "changes", "/changes/map-style-dark/integration"], ["viewer", "prototypes", "/prototypes/offline-maps"], ["login", "home", "/login"]];
for (const theme of ["light", "dark"])
  for (const [w, h] of sizes)
    for (const [name, entry, hash] of [...Object.entries(starts).map(([k, v]) => [k, k, v]), ...extra])
      await check(`布局 ${name} ${theme} ${w}×${h}`, async () => {
        await open(entry, `${hash}${theme === "dark" ? "?theme=dark" : ""}`, [w, h]);
        assert.deepEqual(await overflow(), []);
        if (["home", "changes", "specs", "detail", "viewer"].includes(name) && w === 1440) await page.screenshot({ path: `${output}/${name}-${theme}-desktop.png` });
        if (["home", "changes", "detail", "share"].includes(name) && w === 390) await page.screenshot({ path: `${output}/${name}-${theme}-mobile.png` });
        if (["changes", "specs"].includes(name) && w === 834) await page.screenshot({ path: `${output}/${name}-${theme}-tablet.png` });
      });

// 侧栏：Logo 收起为悬浮胶囊，再次点击展开；平板默认收起
await open("changes", "/changes");
await check("侧栏 Logo 收起为胶囊并可展开", async () => {
  await $(".logo").click();
  await wait(320);
  assert.equal(await count(".app.is-collapsed"), 1);
  assert.equal(await $(".logo").getAttribute("aria-expanded"), "false");
  assert.equal(await count(".side-rail:not([inert]) .capsule .cap-item[aria-label]"), 4);
  assert.equal(await $('.cap-item[aria-current="page"]').getAttribute("aria-label"), "Changes");
  assert.equal(await count(".tb-repo"), 1);
  assert.equal(await $(".tb-repo").isVisible(), true);
  await page.screenshot({ path: `${output}/collapsed-light-desktop.png` });
  await $(".logo").click();
  await wait(320);
  assert.equal(await count(".app.is-collapsed"), 0);
  assert.equal(await $(".tb-repo").isVisible(), false);
});
await check("侧栏可用键盘切换（Enter 与 ⌘\\）", async () => {
  await $(".logo").focus();
  await page.keyboard.press("Enter");
  await wait(300);
  assert.equal(await count(".app.is-collapsed"), 1);
  assert.equal(await frame.evaluate(() => document.activeElement.classList.contains("logo")), true);
  await page.keyboard.press("Control+Backslash");
  await wait(300);
  assert.equal(await count(".app.is-collapsed"), 0);
});
await check("胶囊导航切换模块", async () => {
  await $(".logo").click();
  await wait(300);
  await $('.cap-item[aria-label="Specs"]').click();
  await wait();
  assert.equal(await $('.cap-item[aria-current="page"]').getAttribute("aria-label"), "Specs");
  assert.equal(await count(".app.is-collapsed"), 1);
});
await check("平板默认收起为胶囊，手机使用底部导航", async () => {
  await open("changes", "/changes", [834, 1194]);
  assert.equal(await count(".app.is-collapsed"), 1);
  await open("changes", "/changes", [390, 844]);
  assert.equal(await count(".side"), 0);
  assert.equal(await count(".mnav .mnav-item"), 4);
});

// 账号菜单与 Token 切换
await open("home", "/home");
await check("账号菜单：Escape 关闭并恢复焦点", async () => {
  await $('[data-key="account"]').click();
  assert.equal(await count('.pop [role="menuitemradio"]'), 2);
  await page.keyboard.press("Escape");
  assert.equal(await count(".pop"), 0);
  assert.equal(await frame.evaluate(() => document.activeElement.dataset.key), "account");
});
await check("从账号菜单切换 Token", async () => {
  await $('[data-key="account"]').click();
  await $('[data-key="use-token-menu:t2"]').click();
  await wait();
  assert.match(await text('[data-key="account"]'), /团队仓库/);
  assert.match(await text("#toast"), /团队仓库/);
});
await check("仓库页：正常仓库与需要处理分组，无冗余筛选", async () => {
  await open("home", "/home");
  assert.equal(await count(".repo-list a.repo-row"), 3);
  assert.equal(await count(".issue-group .repo-row"), 2);
  assert.equal(await count('.page [role="tablist"]'), 0);
  await $('[data-action="more-repos"]').click();
  assert.equal(await count(".repo-list a.repo-row"), 5);
});
await check("添加仓库：格式错误与检查结果", async () => {
  await $('[data-key="add-repo:"]').click();
  await $("#repo-url").fill("github.com/x");
  await page.keyboard.press("Enter");
  assert.match(await text(".field-error"), /https:\/\/github.com/);
  await $("#repo-url").fill("https://github.com/demo-studio/atlas");
  await $('[data-action="check-repo"]').click();
  await wait(900);
  assert.match(await text(".check-result"), /可以阅读/);
  await page.keyboard.press("Escape");
  await wait(100);
  assert.equal(await frame.evaluate(() => document.querySelector("#dlg").open), false);
});

// Changes 列表
await open("changes", "/changes");
await check("Changes：按处理状态分组并显示创建者", async () => {
  const groups = await frame.locator(".group-h").allInnerTexts();
  assert.deepEqual(groups.map((g) => g.replace(/\s*\d+$/, "")), ["等待确认", "受阻", "推进中"]);
  assert.ok((await count(".change-row .cell-who .av")) >= 8);
  assert.equal(await count(".list-bar select"), 0);
  assert.equal(await count('.list-bar [role="tab"]'), 3);
});
await check("筛选：按创建者筛选、标签移除与清除", async () => {
  const before = await count(".change-row");
  await $('[data-key="filter-menu"]').click();
  await $('[data-key="f:creators:lin"]').click();
  assert.equal(await count(".change-row"), 3);
  assert.ok(before > 3);
  await page.keyboard.press("Escape");
  assert.equal(await count(".chip"), 1);
  await $(".chip").click();
  assert.equal(await count(".change-row"), before);
});
await check("显示：看板只读五列，排序可切换", async () => {
  await $('[data-key="display-menu"]').click();
  await $('[data-key="v:board"]').click();
  assert.equal(await count(".board-col"), 5);
  await $('[data-key="v:list"]').click();
  await $('[data-key="d:group:none"]').click();
  await $('[data-key="d:sort:urgency"]').click();
  await page.keyboard.press("Escape");
  assert.equal(await count(".group-h"), 0);
  assert.match(await $(".change-row .row-title").innerText(), /紧急/);
});
await check("已完成按交付分组，来源异常仅在提示中出现", async () => {
  await $('[data-key="scope:completed"]').click();
  const groups = await frame.locator(".group-h").allInnerTexts();
  assert.deepEqual(groups.map((g) => g.replace(/\s*\d+$/, "")), ["待发布", "已发布"]);
  assert.ok((await frame.locator(".change-row .tag", { hasText: "待发布" }).count()) >= 1);
  await $('[data-key="scope:active"]').click();
  await $('[data-action="show-issues"]').click();
  assert.match(await text(".change-row"), /无法完整读取|校验失败/);
});
await check("打开详情并返回原位置", async () => {
  await open("changes", "/changes");
  await $('[data-key="row:offline-map-regions"]').click();
  await wait();
  assert.match(await text(".doc h1"), /离线地图按区域下载/);
  assert.equal(await count(".flow li"), 5);
  await $('[data-key="back-to-list"]').click();
  await wait(300);
  assert.equal(await frame.evaluate(() => document.activeElement.dataset.key), "row:offline-map-regions");
});

// Change 详情与分享
await open("changes", "/changes/offline-map-regions");
await check("详情：材料目录、文档目录与缺失材料", async () => {
  assert.ok((await count(".mats .tree-item")) >= 10);
  assert.equal(await count(".mats .tree-item.absent"), 2);
  await $('[data-key="mat:technical"]').click();
  await wait();
  assert.equal(await count(".toc .toc-link"), 3);
  await $('[data-key="toc:verify"]').click();
  await wait(600);
  assert.equal(await $('.toc-link[aria-current]').getAttribute("data-arg"), "verify");
});
await check("详情：任务状态用图标与文字，不伪装为复选框", async () => {
  await $('[data-key="mat:tasks"]').click();
  await wait();
  assert.equal(await count(".task"), 5);
  assert.equal(await count('.task input, .task [role="checkbox"]'), 0);
  assert.match(await text(".task.doing small"), /进行中/);
});
await check("分享弹层：链接、复制失败兜底与焦点恢复", async () => {
  await $('[data-key="share-menu"]').click();
  assert.match(await $('.pop input').inputValue(), /share\/github.com\/demo-studio\/atlas\/changes\/offline-map-regions/);
  await $('.pop [data-action="copy-share"]').click();
  await wait();
  assert.equal(await frame.evaluate(() => document.querySelector("#dlg").open), true);
  assert.match(await $("#dlg input").inputValue(), /offline-map-regions/);
  await page.keyboard.press("Escape");
  await wait(100);
  assert.equal(await frame.evaluate(() => document.activeElement?.dataset.key), "share-menu");
});
await check("打开分享页：匿名阅读，不含工作台导航与账号", async () => {
  await $('[data-key="share-menu"]').click();
  await $('.pop [data-action="open-share"]').click();
  await wait();
  assert.equal(await count(".public-shell"), 1);
  assert.equal(await count(".side, .account-btn, .mnav"), 0);
  assert.match(await text(".doc h1"), /离线地图按区域下载/);
  await $('[data-key="mat:prototypes"]').click();
  await wait();
  assert.equal(await count(".inline-canvas .device"), 1);
});
await check("分享页：不存在与同步失败", async () => {
  await open("share", "/share/offline-map-regions?scene=not-found");
  assert.match(await text(".empty h2"), /不存在或暂不可读/);
  assert.equal(await count(".doc"), 0);
  await open("share", "/share/offline-map-regions?scene=sync-failed");
  assert.match(await text(".banner"), /同步失败/);
  assert.equal(await count(".doc h1"), 1);
});
await check("合入变更：文件切换与 diff 局部滚动", async () => {
  await open("changes", "/changes/map-style-dark/integration");
  assert.equal(await count(".file-item"), 5);
  await $('[data-key="file:apps/mobile/src/theme/useColorScheme.ts"]').click();
  assert.match(await text(".diff-file"), /useColorScheme/);
  await open("changes", "/changes/map-style-dark/integration?scene=integration-error");
  assert.match(await text(".callout.bad"), /无法核对/);
});

// Specs
await open("specs", "/specs/maps/offline");
await check("Specs：目录、相关 Change 与原文", async () => {
  assert.equal(await count('.tree-item[aria-current="page"]'), 1);
  assert.equal(await count(".mini-row"), 2);
  await $('[data-key="spec-more"]').click();
  await $('[data-key="view-raw"]').click();
  assert.match(await text(".raw"), /# 离线地图/);
  await page.keyboard.press("Escape");
  await $('[data-key="spec:trips/editor"]').click();
  await wait();
  assert.match(await text(".doc h1"), /行程编辑/);
});
await check("Specs 手机：目录面板列出能力树与本页目录", async () => {
  await open("specs", "/specs/maps/offline", [390, 844]);
  await $('[data-action="pane-sheet"]').click();
  assert.ok((await count("#dlg .tree-item")) > 10);
  assert.ok((await count("#dlg .toc-link")) >= 4);
});

// 原型
await open("prototypes", "/prototypes");
await check("原型：设备切换缩略图，组件始终显示", async () => {
  assert.equal(await count(".proto-card"), 5);
  await $('[data-key="pd:ipad"]').click();
  assert.equal(await count(".proto-card"), 3);
  assert.equal(await count(".thumb.ipad"), 2);
});
await check("原型：卡片主体打开详情，缩略图打开画布", async () => {
  await $('[data-key="card:offline-maps"]').click();
  assert.match(await text("#dlg .sheet-title"), /离线地图下载管理/);
  await page.keyboard.press("Escape");
  await $('[data-key="thumb:offline-maps"]').click();
  await wait();
  assert.equal(await count("[data-canvas] .device"), 1);
});
await check("画布：设备、旋转、100% 与公开链接", async () => {
  await $('[data-key="vd:mobile"]').click();
  assert.equal(await $(".device").getAttribute("data-w"), "390");
  await $('[data-action="viewer-rotate"]').click();
  assert.equal(await $(".device").getAttribute("data-w"), "844");
  await $('[data-key="zoom:100"]').click();
  assert.equal(await count(".canvas.actual"), 1);
  await $('[data-key="public-menu"]').click();
  assert.match(await text(".pop"), /任何人都能匿名打开/);
});
await check("公开原型页：不存在、已撤回且无私有内容", async () => {
  await open("public", "/public/offline-maps?scene=revoked");
  assert.match(await text(".empty h2"), /已撤回/);
  await open("public", "/public/offline-maps?scene=not-found");
  assert.match(await text(".empty h2"), /没有找到/);
  await open("public", "/public/offline-maps");
  assert.equal(await count(".side, .account-btn"), 0);
  assert.equal(await count("[data-canvas] .device"), 1);
});

// 账号与 Token
await open("account", "/account");
await check("Token：验证失败不保存，示例 Token 可添加并选用", async () => {
  await $('[data-key="add-token-head"]').click();
  await $("#tok-value").fill("ghp_wrong");
  await $('[data-action="save-token"]').click();
  await wait(900);
  assert.match(await text(".field-error"), /拒绝/);
  await $("#tok-label").fill("备用");
  await $("#tok-value").fill("demo");
  await $('[data-action="save-token"]').click();
  await wait(900);
  assert.equal(await frame.locator(".set-list").first().locator(".set-row").count(), 3);
  assert.match(await text(".set-row .tag.accent"), /当前使用/);
});
await check("Token 菜单：非当前 Token 不能复制，解绑需确认", async () => {
  await $('[data-key="token-more:t1"]').click();
  assert.equal(await $('[data-key="copytok:t1"]').isDisabled(), true);
  await $('[data-key="unbind:t1"]').click();
  assert.match(await text("#dlg .dlg-title"), /解绑/);
  await $('#dlg [data-action="confirm-unbind"]').click();
  await wait();
  assert.equal(await count('[data-key="token-more:t1"]'), 0);
});
await check("设备：当前设备只标记，其他设备可退出；切换失败保留原 Token", async () => {
  await open("account", "/account");
  assert.equal(await count('.set-row [data-action="revoke-device"]'), 2);
  await $('[data-key="revoke-device:d3"]').click();
  await $('#dlg [data-action="confirm-revoke"]').click();
  await wait();
  assert.equal(await count('.set-row [data-action="revoke-device"]'), 1);
  await open("account", "/account?scene=switch-failed");
  await $('[data-key="use-token:t2"]').click();
  assert.match(await text("#toast"), /仍在使用「日常阅读」/);
});
await check("登录与注册：错误、成功及首个 Token 引导", async () => {
  await open("home", "/login");
  await $("#auth-pass").fill("wrong-pass");
  await page.keyboard.press("Enter");
  await wait();
  assert.match(await text(".field-error"), /不正确/);
  await $("#auth-pass").fill("demo12345");
  await $('[data-action="do-login"]').click();
  await wait();
  assert.equal(await count(".app"), 1);
  await open("home", "/register");
  await $("#auth-user").fill("lin");
  await $("#auth-pass").fill("demo12345");
  await $("#auth-pass2").fill("demo12345");
  await $('[data-action="do-register"]').click();
  assert.match(await text(".field-error"), /已被使用/);
  await $("#auth-user").fill("new-user");
  await $('[data-action="do-register"]').click();
  await wait();
  assert.match(await text(".onboard h2"), /绑定一个 GitHub Token/);
  assert.equal(await count(".cap-item[aria-disabled]"), 3);
  assert.equal(await $(".side-group").isVisible(), false);
});

// 状态与降级
await check("离线保留内容，无权限清除私有内容，过期回到登录", async () => {
  await open("changes", "/changes?scene=offline");
  assert.match(await text(".banner"), /离线/);
  assert.ok((await count(".change-row")) > 0);
  await open("changes", "/changes?scene=denied");
  assert.equal(await count(".change-row"), 0);
  assert.match(await text(".empty h2"), /无法读取/);
  await open("changes", "/changes?scene=expired");
  assert.equal(await count(".auth-card"), 1);
  assert.match(await text(".auth-card"), /私有内容已清除/);
});
await check("减少透明度与减少动态效果", async () => {
  await open("changes", "/changes?side=collapsed");
  const glass = () => frame.evaluate(() => getComputedStyle(document.querySelector(".capsule")).backdropFilter);
  assert.notEqual(await glass(), "none");
  await $('[data-key="review-settings"]').click();
  await $('[data-key="toggle-transparency:"]').click();
  await $('[data-key="toggle-motion:"]').click();
  await page.keyboard.press("Escape");
  assert.equal(await glass(), "none");
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector(".app")).transitionDuration), "0s");
});
await check("墨色框架与平面单色标志", async () => {
  for (const theme of ["light", "dark"]) {
    await open("changes", `/changes${theme === "dark" ? "?theme=dark" : ""}`);
    assert.equal(await frame.evaluate(() => document.documentElement.dataset.accent), "ink");
    assert.equal(await count(".logo svg.mark"), 1);
    assert.equal(await count("img.mark"), 0);
    const [accent, ink, icon] = await frame.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), getComputedStyle(document.body).color, getComputedStyle(document.querySelector(".nav-item[aria-current] .i")).color]);
    assert.equal(accent, theme === "dark" ? "#ececea" : "#1d1d1b");
    assert.equal(icon, ink);
  }
});
await check("评审栏切换强调色并保留在链接中", async () => {
  await open("changes", "/changes");
  await $('[data-key="review-settings"]').click();
  assert.equal(await count(".icon-preview img"), 3);
  await $('[data-key="accent:clay"]').click();
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.accent), "clay");
  assert.match(await frame.evaluate(() => location.hash), /accent=clay/);
  await $('[data-key="accent:blue"]').click();
  assert.equal(await count(".logo img.mark"), 1);
  await page.keyboard.press("Escape");
  await open("changes", "/changes?accent=clay&theme=dark");
  assert.equal(await frame.evaluate(() => document.documentElement.dataset.accent), "clay");
});
await check("强调色与状态色对比度（三种强调色 × 两套主题）", async () => {
  const low = [];
  for (const accent of ["ink", "clay", "blue"])
    for (const theme of ["light", "dark"]) {
      await open("changes", `/changes?theme=${theme}&accent=${accent}`);
      const pairs = await frame.evaluate(() => {
        const probe = document.body.appendChild(document.createElement("i"));
        const rgba = (v) => {
          probe.style.color = `var(${v})`;
          const [r, g, b, a = 1] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
          return [r, g, b, a];
        };
        const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
        const lum = (c) => c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        const surface = rgba("--surface").slice(0, 3),
          win = rgba("--win").slice(0, 3),
          on = (fg, bg = surface) => over(rgba(fg), bg),
          out = {
            "主按钮文字": [ratio(on("--on-accent", on("--accent")), on("--accent")), 4.5],
            "链接与选中文字": [ratio(on("--accent-ink"), surface), 4.5],
            "选中底上的文字": [ratio(on("--accent-ink"), on("--accent-soft")), 4.5],
            "焦点框对内容区": [ratio(on("--accent"), surface), 3],
            "焦点框对窗口底": [ratio(on("--accent", win), win), 3],
          };
        for (const tone of ["amber", "red", "green"]) out[`${tone} 状态文字`] = [ratio(on(`--${tone}`, on(`--${tone}-soft`)), on(`--${tone}-soft`)), 4.5];
        probe.remove();
        return out;
      });
      for (const [name, [value, min]] of Object.entries(pairs)) if (value < min) low.push(`${accent}/${theme} ${name} ${value.toFixed(2)} < ${min}`);
    }
  assert.deepEqual(low, [], low.join("；"));
});
await check("跳过链接聚焦主内容且不改变路由", async () => {
  await open("specs", "/specs/maps/offline");
  await page.keyboard.press("Tab");
  assert.equal(await frame.evaluate(() => document.activeElement.className), "skip-link");
  await page.keyboard.press("Enter");
  assert.equal(await frame.evaluate(() => document.activeElement.id), "main");
  assert.match(await frame.evaluate(() => location.hash), /specs\/maps\/offline/);
});
await check("手机详情顶栏不溢出", async () => {
  for (const [w, h] of [[390, 844], [320, 720]]) {
    await open("changes", "/changes/offline-map-regions", [w, h]);
    assert.deepEqual(await overflow(), []);
    assert.equal(await count(".toolbar .tb-repo"), 0);
  }
});

await page?.close();
await browser.close();
server.close();
const result = { checked: checks.length, failed: failures.length, errors: [...new Set(errors)], failures, checks };
await writeFile(`${output}/verification.json`, JSON.stringify(result, null, 2));
console.log(`${checks.length} passed, ${failures.length} failed, ${result.errors.length} browser errors`);
if (failures.length || result.errors.length) {
  console.log([...failures, ...result.errors].join("\n"));
  process.exitCode = 1;
}
