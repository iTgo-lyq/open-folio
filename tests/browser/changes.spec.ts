import { test, expect } from "@playwright/test";
test("list filters, drawer, tasks and stacked document focus preserve context", async ({
  page,
}) => {
  await page.goto("/?project=fixture&m=changes");
  const row = page.getByRole("button", {
    name: "打开 让工程文档成为清晰的阅读体验",
    exact: true,
  });
  await expect(row).toBeVisible();
  await row.click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", {
      name: "让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await expect(drawer.getByText("等待阅读样式验收")).toBeVisible();
  await drawer.getByRole("tab", { name: "任务", exact: true }).click();
  await expect(
    drawer
      .locator(".task-detail")
      .getByText("读取与校验项目来源", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "查看 Plan 原文依据" }).click();
  await expect(page.locator("[role=dialog]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "查看 Plan 原文依据" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toBeFocused();
  await page.getByRole("button", { name: "看板视图" }).click();
  await expect(page.locator(".board-column")).toHaveCount(5);
  await page.screenshot({
    path: "artifacts/changes-board-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await expect(page.locator(".board-column")).toHaveCount(4);
  await expect(page.getByText("等待阅读区域尺寸确认")).toBeVisible();
  await page.getByRole("button", { name: "变更", exact: true }).click();
  await page.getByRole("button", { name: "列表视图" }).click();
  await page.getByRole("combobox", { name: "筛选规模" }).selectOption("small");
  await expect(
    page.getByRole("button", { name: "打开 支持手机端连续阅读", exact: true }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
});
test("dependencies, parent children, cancellation, archived evidence and invalid source", async ({
  page,
}) => {
  await page.goto("/?project=fixture&m=changes&view=dependencies");
  await expect(page.getByText("流程已满足")).toBeVisible();
  await expect(page.getByText("可用性待核实").first()).toBeVisible();
  await page
    .getByRole("button", { name: /工程工作台整体交付.*workspace-rollout/ })
    .last()
    .click();
  await page.getByRole("tab", { name: "子项", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: /支持手机端连续阅读/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /已取消/ }).click();
  await page.getByRole("button", { name: /旧版导航实验.*old-layout/ }).click();
  await expect(page.getByText("收敛为统一工作台")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /已归档/ }).click();
  await page
    .getByRole("button", { name: /接入中心仓库与来源追踪.*source-connect/ })
    .click();
  await page.getByRole("tab", { name: "依据", exact: true }).click();
  await expect(page.getByText("人工验收通过", { exact: true })).toBeVisible();
  await expect(page.getByText("归档目录完整", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /来源异常/ }).click();
  await page
    .getByRole("button", { name: /需要核对的来源记录.*invalid-state/ })
    .click();
  await expect(
    page.getByText("schemaVersion：Invalid literal value, expected 1"),
  ).toBeVisible();
  await page.getByRole("tab", { name: "文档", exact: true }).click();
  await page.getByRole("button", { name: /流程状态原文/ }).click();
  await expect(page.getByRole("dialog").last().locator("pre")).toContainText(
    '"schemaVersion": 2',
  );
});
test("mobile Change drawer, URL restore and 320px fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?project=fixture&m=changes&c=document-reader&ct=overview");
  await expect(
    page.getByRole("heading", {
      name: "让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/change-detail-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    })
    .click();
  await page.getByRole("tab", { name: "任务", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "任务", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
