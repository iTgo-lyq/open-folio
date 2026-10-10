import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { preview } from "vite";
import { chromium } from "playwright";
import { expect } from "@playwright/test";
const server = await preview({
  configFile: "packages/ui/vite.config.ts",
  preview: { port: 10684, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({ headless: true, chromiumSandbox: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:10684");
  await page.getByLabel("项目名称", { exact: true }).fill("工程协作");
  await expect(page.getByLabel("项目名称", { exact: true })).toHaveValue(
    "工程协作",
  );
  await page.getByLabel("项目说明", { exact: true }).fill("组件预览");
  await expect(page.getByLabel("无效输入", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("不可编辑字段", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "保存更改" }).click();
  assert(await page.getByRole("button", { name: "保存中" }).isDisabled());
  await page.getByText("更改已保存", { exact: true }).waitFor();
  await page.getByRole("button", { name: "增加计数", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByText("计数 1", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "显示示例内容" }).click();
  await page.getByRole("button", { name: "恢复空状态" }).click();
  await page.getByRole("heading", { name: "还没有预览页面" }).waitFor();
  const buttonTabs = page.getByRole("tablist", { name: "按钮示例视图" });
  await buttonTabs.getByRole("tab", { name: "预览", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    buttonTabs.getByRole("tab", { name: "代码", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#button pre")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  const sampleTabs = page.getByRole("tablist", { name: "项目示例" });
  await sampleTabs.getByRole("tab", { name: "概览", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("heading", { name: "为真实使用而准备" }).waitFor();
  await page.keyboard.press("ArrowRight");
  await expect(
    sampleTabs.getByRole("tab", { name: "概览", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("textbox", { name: "搜索组件" }).fill("TabbedCard");
  await expect(page.locator(".component-section")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "搜索组件" })
    .fill("no matching component");
  await page.getByRole("heading", { name: "没有找到组件" }).waitFor();
  await page.getByRole("button", { name: "清除搜索" }).click();
  await expect(page.locator(".component-section")).toHaveCount(7);
  await mkdir("artifacts", { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "artifacts/ui-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole("link", { name: "状态标签" }).click();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: "artifacts/ui-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "UI production preview: loading, keyboard tabs, disabled tab skipping, search, empty-state, 320px and console checks passed",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
