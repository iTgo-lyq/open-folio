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
  await expect(page.locator(".component-section")).toHaveCount(12);
  // 菜单：方向键移动、单选与多选、Escape 关闭后焦点回到触发控件。
  const menuTrigger = page.getByRole("button", { name: "显示与筛选" });
  await menuTrigger.click();
  const menu = page.getByRole("menu", { name: "显示与筛选" });
  await menu.getByRole("menuitemradio", { name: "看板" }).click();
  await page.getByText(/^看板 · 新功能/).waitFor();
  await menuTrigger.click();
  await menu.getByRole("menuitemcheckbox", { name: "修复" }).click();
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "修复" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(menuTrigger).toBeFocused();
  await page.getByText(/新功能、修复/).waitFor();
  // 弹层与对话框：Escape 或关闭后焦点回到触发控件。
  const popoverTrigger = page.getByRole("button", { name: "已同步" });
  await popoverTrigger.click();
  await page.getByRole("dialog", { name: "同步状态" }).waitFor();
  await page.keyboard.press("Escape");
  await expect(popoverTrigger).toBeFocused();
  const unbind = page.getByRole("button", { name: "解绑 Token" });
  await unbind.click();
  const confirm = page.getByRole("dialog", { name: "解绑“日常阅读”？" });
  await expect(confirm.getByRole("button", { name: "取消" })).toBeFocused();
  await confirm.getByRole("button", { name: "确认解绑" }).click();
  await page.getByText("已解绑", { exact: true }).waitFor();
  await expect(unbind).toBeFocused();
  await page.getByRole("button", { name: "查看详情" }).click();
  const sheet = page.getByRole("dialog", { name: "离线地图下载管理" });
  await expect(sheet).toBeVisible();
  assert.notEqual(
    await sheet.evaluate((el) => getComputedStyle(el).backdropFilter),
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // 分段控件用方向键切换；开关即时生效；图标按钮聚焦时显示名称。
  await page.getByRole("radio", { name: "桌面" }).focus();
  // Radix 在下一轮事件中移动焦点，并以“方向键仍按下”判断是否同时选中；模拟真实按键时长。
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(50);
  await page.keyboard.up("ArrowRight");
  await expect(page.getByRole("radio", { name: "平板" })).toBeChecked();
  await page.getByRole("switch", { name: "减少动态效果" }).click();
  await expect(
    page.getByRole("switch", { name: "减少动态效果" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "增加计数", exact: true }).focus();
  await expect(page.getByRole("tooltip", { name: "增加计数" })).toBeVisible();
  await page.getByRole("radio", { name: "深色" }).click();
  await page.waitForTimeout(300); // 等待控件颜色过渡结束再截图
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "dark",
  );
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
    "UI production preview: loading, keyboard tabs, disabled tab skipping, search, empty-state, menu, popover, dialog, sheet, segmented, switch, tooltip, dark theme, 320px and console checks passed",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
