import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";
import { sandboxCsp } from "../../.agents/skills/spec-trail/scripts/prototype/html.mjs";

const root = new URL("./", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("prototype.json", root), "utf8"),
);
const { values } = parseArgs({
  options: {
    entry: { type: "string" },
    "interactions-only": { type: "boolean" },
  },
});
if (
  values.entry &&
  !manifest.entries.some((entry) => entry.id === values.entry)
)
  throw Error("Unknown entry");
const pages = new Map(
  await Promise.all(
    manifest.entries.map(async (entry) => [
      entry.id,
      await readFile(new URL(`dist/${entry.id}/index.html`, root)),
    ]),
  ),
);
const server = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  if (request.url === "/favicon.ico") return response.writeHead(204).end();
  const match = request.url?.match(/^\/(quiet-[a-z]+)(\/frame)?$/);
  if (!match || !pages.has(match[1])) return response.writeHead(404).end();
  if (match[2]) {
    response.setHeader("Content-Security-Policy", sandboxCsp);
    return response.end(pages.get(match[1]));
  }
  response.end(
    `<style>html,body{height:100%;margin:0}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="allow-scripts" src="/${match[1]}/frame"></iframe>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const output = new URL("../../artifacts/prototype-fragments/", root);
await mkdir(output, { recursive: true });
let browser;
let checks = 0;
try {
  browser = await chromium.launch({
    chromiumSandbox: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  async function open(id, viewport, check) {
    if (values.entry && values.entry !== id) return;
    const page = await browser.newPage({ viewport });
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        failures.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (!url.startsWith(`${origin}/`)) {
        failures.push(`Unexpected network request: ${url}`);
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      window.prototypeStorageAccess = 0;
      Storage.prototype.getItem = Storage.prototype.setItem = () => {
        window.prototypeStorageAccess++;
        throw Error("Real browser storage accessed");
      };
    });
    try {
      await page.goto(`${origin}/${id}`, { waitUntil: "networkidle" });
      const frame = page.frameLocator("iframe");
      await expect(frame.locator(".prototype-toolbar")).toBeVisible();
      await expect(frame.locator(".prototype-surface")).not.toBeEmpty();
      await check(frame, page);
      assert.equal(
        await frame
          .locator("body")
          .evaluate(() => window.prototypeStorageAccess),
        0,
        "persistent storage must not be accessed",
      );
      assert.deepEqual(failures, [], id);
      checks++;
    } catch (error) {
      await page.screenshot({
        path: fileURLToPath(new URL(`${id}-failure.png`, output)),
      });
      console.error(failures);
      throw error;
    } finally {
      await page.close();
    }
  }
  let count = 0;
  for (const entry of values["interactions-only"] ? [] : manifest.entries) {
    if (values.entry && values.entry !== entry.id) continue;
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 834, height: 1194 },
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await open(entry.id, viewport, async (frame, page) => {
        for (const theme of ["light", "dark"]) {
          await frame.getByLabel("原型主题").selectOption(theme);
          await expect(frame.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          const overflow = await frame
            .locator("body")
            .evaluate((body) => body.scrollWidth > innerWidth + 1);
          assert.equal(
            overflow,
            false,
            `${entry.id} ${viewport.width} ${theme}`,
          );
          const clipped = await frame
            .locator(".prototype-surface > :first-child")
            .evaluate(
              (element) =>
                element.getBoundingClientRect().bottom > innerHeight + 1,
            );
          assert.equal(
            clipped,
            false,
            `${entry.id} has a clipped fragment container`,
          );
          await page.locator("iframe").screenshot({
            path: fileURLToPath(
              new URL(`${entry.id}-${viewport.width}-${theme}.png`, output),
            ),
            animations: "disabled",
          });
          count++;
        }
        const scenes = await frame
          .getByLabel("原型场景")
          .locator("option")
          .evaluateAll((options) => options.map((option) => option.value));
        for (const scene of scenes) {
          await frame.getByLabel("原型场景").selectOption(scene);
          await expect(frame.locator(".prototype-surface")).not.toBeEmpty();
          if (scene === "error")
            await expect(frame.getByText(/演示.*失败/).first()).toBeVisible();
          if (scene === "loading")
            await expect(
              frame.getByText(/正在(发现仓库|读取分享|打开工作台)/).first(),
            ).toBeVisible();
          if (scene === "login")
            await expect(
              frame.getByRole("heading", { name: "登录 OpenFolio" }),
            ).toBeVisible();
          if (scene === "unavailable")
            await expect(
              frame.getByRole("heading", { name: "没有找到这个公开版本" }),
            ).toBeVisible();
          if (scene === "empty") {
            const text =
              entry.id === "quiet-home"
                ? "绑定一个 GitHub Token"
                : entry.id === "quiet-credentials"
                  ? "还没有绑定 Token"
                  : entry.id === "quiet-prototypes"
                    ? "这个仓库还没有原型"
                    : entry.id === "quiet-specs"
                      ? "这里还没有已实现的 Specs"
                      : entry.id === "quiet-share"
                        ? "内容不存在或暂不可读"
                        : "暂无你创建的 Change";
            await expect(frame.getByText(text, { exact: true })).toBeVisible();
          }
        }
      });
    }
  }
  const desktop = { width: 1440, height: 900 };
  await open("quiet-home", desktop, async (frame) => {
    await expect(
      frame.getByRole("heading", { name: "我的仓库", exact: true }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "收起侧栏", exact: true }).click();
    await expect(
      frame.getByRole("button", { name: "展开侧栏", exact: true }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "展开侧栏", exact: true }).click();
    await frame.getByRole("button", { name: "添加仓库", exact: true }).click();
    await frame
      .getByLabel("GitHub HTTPS 仓库地址")
      .fill("https://example.invalid/demo/atlas");
    await frame.getByRole("button", { name: "检查仓库", exact: true }).click();
    await expect(
      frame.getByText("已接入，可以阅读", { exact: true }),
    ).toBeVisible();
  });
  await open("quiet-specs", desktop, async (frame) => {
    await frame.getByRole("link", { name: "行程规划", exact: true }).click();
    await expect(
      frame.getByRole("heading", { name: "行程规划", exact: true }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "阅读设置", exact: true }).click();
    await expect(
      frame.getByRole("dialog", { name: "阅读设置", exact: true }),
    ).toBeVisible();
  });
  await open("quiet-changes", desktop, async (frame) => {
    await frame.getByRole("button", { name: "管理视图", exact: true }).click();
    await expect(
      frame.getByRole("dialog", { name: "管理视图", exact: true }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "编辑 我的", exact: true }).click();
    await frame.getByLabel("视图名称").fill("取消的草稿");
    await frame.getByRole("button", { name: "完成编辑", exact: true }).click();
    await frame.getByRole("button", { name: "取消", exact: true }).click();
    await expect(frame.getByRole("tab", { name: /我的/ })).toBeVisible();
    await expect(frame.getByRole("tab", { name: /取消的草稿/ })).toHaveCount(0);
    await frame.getByRole("button", { name: "管理视图", exact: true }).click();
    await frame.getByRole("button", { name: "编辑 我的", exact: true }).click();
    await frame.getByLabel("视图名称").fill("演示工作");
    await frame.getByRole("button", { name: "完成编辑", exact: true }).click();
    await frame.getByRole("button", { name: "确认", exact: true }).click();
    await expect(frame.getByRole("tab", { name: /演示工作/ })).toBeVisible();
    await frame.getByRole("button", { name: "显示", exact: true }).click();
    await frame
      .getByRole("menuitemradio", { name: "看板", exact: true })
      .click();
    await expect(
      frame.getByRole("region", { name: "按处理状态看板（只读）" }),
    ).toBeVisible();
    await frame
      .getByRole("link", { name: "打开 支持离线地图", exact: true })
      .click();
    await frame
      .getByRole("navigation", { name: "Change 材料" })
      .getByRole("link", { name: "需求", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", {
        name: "支持离线地图 · requirement",
        exact: true,
      }),
    ).toBeVisible();
    await frame.getByRole("button", { name: "分享", exact: true }).click();
    await expect(
      frame.getByRole("dialog", { name: "分享这个 Change" }),
    ).toBeVisible();
    await expect(frame.getByRole("textbox").first()).toHaveValue(
      /\/share\/demo-atlas$/,
    );
  });
  await open("quiet-prototypes", desktop, async (frame) => {
    await frame.locator("[data-prototype-cover]").click();
    await expect(frame.locator("[data-mock-preview]")).toBeVisible();
    await frame
      .getByRole("button", { name: "保存演示行程", exact: true })
      .click();
    await expect(
      frame.getByRole("button", { name: "已保存到本页内存", exact: true }),
    ).toBeVisible();
    await frame
      .getByRole("button", { name: "返回原型总览", exact: true })
      .click();
    await expect(frame.locator("[data-prototype-cover]")).toBeVisible();
  });
  await open("quiet-credentials", desktop, async (frame) => {
    await frame.getByLabel("原型场景").selectOption("login");
    await frame.getByLabel("账号", { exact: true }).fill("demo-lin");
    await frame.getByLabel("密码", { exact: true }).fill("demo12345");
    await frame.getByLabel("密码", { exact: true }).press("Enter");
    await expect(
      frame.getByRole("heading", { name: "账号与 Token", exact: true }),
    ).toBeVisible();
    await frame
      .getByRole("button", { name: "添加 Token", exact: true })
      .click();
    await frame.getByLabel("GitHub Token", { exact: true }).fill("not-demo");
    await frame
      .getByRole("button", { name: "验证并添加", exact: true })
      .click();
    await expect(
      frame.getByText("原型只接受虚构 Token：demo 或 demo-work。"),
    ).toBeVisible();
    await frame.getByLabel("GitHub Token", { exact: true }).fill("demo");
    await frame
      .getByRole("button", { name: "验证并添加", exact: true })
      .click();
    await expect(
      frame.getByText("新增演示 Token", { exact: false }).first(),
    ).toBeVisible();
  });
  await open("quiet-public", desktop, async (frame) => {
    await frame.getByRole("radio", { name: "iPad", exact: true }).click();
    await frame.getByRole("button", { name: "旋转视口", exact: true }).click();
    await expect(frame.getByText(/1194 × 834/)).toBeVisible();
    await frame
      .getByRole("button", { name: "保存演示行程", exact: true })
      .click();
    await expect(
      frame.getByRole("button", { name: "已保存到本页内存", exact: true }),
    ).toBeVisible();
  });
  await open("quiet-share", desktop, async (frame) => {
    await expect(
      frame.getByRole("heading", {
        name: "支持离线地图 · requirement",
        exact: true,
      }),
    ).toBeVisible();
    await frame
      .getByRole("navigation", { name: "Change 材料" })
      .getByRole("link", { name: "技术方案", exact: true })
      .click();
    await expect(
      frame.getByRole("heading", {
        name: "支持离线地图 · technical",
        exact: true,
      }),
    ).toBeVisible();
    await frame
      .getByRole("navigation", { name: "Change 材料" })
      .getByRole("link", { name: "原型", exact: true })
      .click();
    await expect(frame.locator("[data-mock-preview]")).toBeVisible();
  });
  const mobile = { width: 320, height: 720 };
  await open("quiet-specs", mobile, async (frame) => {
    await frame.getByRole("button", { name: /^能力目录：/ }).click();
    await frame.getByRole("link", { name: "行程规划", exact: true }).click();
    await expect(
      frame.getByRole("heading", { name: "行程规划", exact: true }),
    ).toBeVisible();
  });
  await open("quiet-changes", mobile, async (frame) => {
    await frame
      .getByRole("link", { name: "打开 支持离线地图", exact: true })
      .click();
    await frame.getByRole("button", { name: /^Change 材料：/ }).click();
    await frame.getByRole("link", { name: "需求", exact: true }).click();
    await expect(
      frame.getByRole("heading", {
        name: "支持离线地图 · requirement",
        exact: true,
      }),
    ).toBeVisible();
    await frame
      .getByRole("button", { name: "返回 Changes 列表", exact: true })
      .click();
    await expect(
      frame.getByRole("link", { name: "打开 支持离线地图", exact: true }),
    ).toBeFocused();
  });
  await open("quiet-credentials", mobile, async (frame) => {
    await frame.getByLabel("原型场景").selectOption("login");
    await frame.getByLabel("账号", { exact: true }).fill("demo-lin");
    await frame.getByLabel("密码", { exact: true }).fill("demo12345");
    await frame.getByRole("button", { name: "登录", exact: true }).click();
    await expect(
      frame.getByRole("heading", { name: "账号与 Token", exact: true }),
    ).toBeVisible();
  });
  await open("quiet-public", mobile, async (frame) => {
    await frame.getByRole("radio", { name: "移动设备", exact: true }).click();
    await frame.getByRole("button", { name: "旋转视口", exact: true }).click();
    await expect(frame.getByText(/844 × 390/)).toBeVisible();
  });
  console.log(
    `Passed ${count} entry/theme/viewport combinations and ${checks - count / 2} interaction flows${values["interactions-only"] ? "" : ", including all declared scenes"}.`,
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
