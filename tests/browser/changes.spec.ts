import { test, expect, repositoryQuery } from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("clarifications show final answers in numeric order across updates and narrow screens", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const group = data.changes.find((g) => g.id === "document-reader")!;
  const state = primaryRecord(group)!.state!;
  state.clarifications = {
    Q10: {
      round: 2,
      question: "是否保留翻页入口？",
      recommendation: "不要展示推荐",
      answer: "保留在正文底部。",
      withdrawn: "不要把撤回原因当成回答",
    },
    Q2: {
      round: 1,
      question: "是否记住阅读位置？",
      recommendation: "不要展示推荐",
    },
    Q1: {
      round: 1,
      question: "目录如何显示？",
      recommendation: "不要展示推荐",
      answer: "最初回答",
      source: "不要展示来源",
    },
  };
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  const section = page.getByRole("region", { name: "澄清问答" });
  await expect(section.locator(".clarification-id")).toHaveText([
    "Q1",
    "Q2",
    "Q10",
  ]);
  await expect(section.getByText("最初回答", { exact: true })).toBeVisible();

  const finalAnswer = `默认收起。\n完整链接：https://example.test/${"reference".repeat(30)}\n<img src=x onerror=alert(1)>`;
  state.clarifications.Q1.answer = finalAnswer;
  await page.reload();
  const items = section.locator(".clarification-item");
  await expect(items.nth(0).locator("dd")).toHaveText(finalAnswer);
  await expect(section).not.toContainText("最初回答");
  await expect(items.nth(1).locator("dd")).toHaveText("未回答");
  await expect(items.nth(2)).toContainText("已撤回");
  await expect(items.nth(2).locator("dd")).toHaveText("保留在正文底部。");
  await expect(section).not.toContainText("不要");
  await expect(section.locator("img")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/clarifications-desktop.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await section.scrollIntoViewIfNeeded();
  expect(
    await page
      .locator(".drawer-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await expect(items.nth(0).locator("dd")).toHaveCSS("white-space", "pre-wrap");
  await page.screenshot({ path: "artifacts/clarifications-mobile.png" });
});

test("clarifications are hidden for old and empty records and available in archives", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const archived = primaryRecord(
    data.changes.find((g) => g.id === "source-connect")!,
  )!.state!;
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&c=source-connect`);
  await expect(page.getByRole("dialog").getByText("交付已归档")).toBeVisible();
  const section = page.getByRole("region", { name: "澄清问答" });
  await expect(section).toHaveCount(0);
  archived.clarifications = {};
  await page.reload();
  await expect(page.getByRole("dialog").getByText("交付已归档")).toBeVisible();
  await expect(section).toHaveCount(0);
  archived.clarifications.Q1 = {
    round: 1,
    question: "首先接入哪个平台？",
    recommendation: "GitHub",
    answer: "先接入 GitHub。",
  };
  await page.reload();
  await expect(section.getByText("首先接入哪个平台？")).toBeVisible();
  await expect(
    section.getByText("先接入 GitHub。", { exact: true }),
  ).toBeVisible();
});

test("a narrative Plan uses default serial order without a source warning", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=default-serial&ct=overview`,
  );
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", { name: "默认串行的任务安排", exact: true }),
  ).toBeVisible();
  await expect(drawer.locator(".drawer-badges")).not.toContainText("来源提示");
  await expect(drawer.getByText("等待默认串行验收")).toBeVisible();
  await drawer.getByRole("tab", { name: "任务", exact: true }).click();
  await expect(
    drawer.getByText("默认按任务编号串行执行。", { exact: true }),
  ).toBeVisible();
  await expect(drawer.locator(".task-edge")).toContainText("无前置");
  await expect(drawer.locator(".task-edge")).toContainText("T1");
  await page.screenshot({
    path: "artifacts/default-serial-change.png",
    fullPage: true,
  });
  await drawer.getByRole("button", { name: "关闭变更详情" }).click();
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader&ct=tasks`);
  await expect(
    page
      .getByRole("dialog")
      .getByText("按 Plan 中的显式执行顺序执行。", { exact: true }),
  ).toBeVisible();
});

test("list filters, drawer, tasks and stacked document focus preserve context", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
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
  await page.goto(`/?${repositoryQuery}&m=changes&view=dependencies`);
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
  await page
    .getByRole("button", { name: /导航布局实验.*layout-experiment/ })
    .click();
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
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=overview`,
  );
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

test("changing projects clears filters that belong to the previous project", async ({
  page,
  request,
  personal,
}) => {
  const original = await (await request.get(personal.url("workbench"))).json();
  const second = {
    ...original,
    projectId: "second",
    projectName: "第二项目",
    changes: original.changes.map((g: { candidates: object[] }) => ({
      ...g,
      candidates: g.candidates.map((c) => ({
        ...c,
        relatedSpecs: [],
        specReferences: [],
      })),
    })),
  };
  await page.route("**/api/repositories?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        items: [
          ...body.items,
          {
            ...body.items[0],
            key: "second",
            repository: { ...body.items[0].repository, fullName: "第二项目" },
          },
        ],
      },
    });
  });
  await page.route("**/api/repositories/second/workbench*", (route) =>
    route.fulfill({ json: second }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&spec=platform`);
  await expect(
    page.getByRole("button", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "当前仓库" }).selectOption("second");
  await expect(page).not.toHaveURL(/spec=/);
  await expect(
    page.getByRole("button", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
});

test("document list distinguishes missing, unreadable and not required material", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=documents`,
  );
  await expect(
    page.locator(".document-missing").filter({ hasText: "execution.md" }),
  ).toContainText("缺失");
  await expect(
    page.getByRole("button", { name: /独立评审.*review.md/ }),
  ).toContainText("不可读");
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=mobile-reading&ct=documents`,
  );
  await expect(
    page.locator(".document-missing").filter({ hasText: "plan.md" }),
  ).toContainText("当前规模不要求");
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=delivery-review&ct=documents`,
  );
  await expect(
    page.locator(".document-missing").filter({ hasText: "technical.md" }),
  ).toContainText("当前阶段尚未要求");
});

test("only active Changes use stage filters and the stage board", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&view=board&stage=execution&wait=confirmation`,
  );
  const scopes = page.getByRole("tablist", {
    name: "Change 状态",
    exact: true,
  });
  await expect(scopes.getByRole("tab")).toHaveCount(4);
  await expect(scopes.getByRole("tab", { name: /全部/ })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "筛选阶段" })).toHaveValue(
    "execution",
  );
  await page
    .getByRole("button", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    })
    .click();
  await expect(page.locator(".stage-flow")).toBeVisible();
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await scopes.getByRole("tab", { name: /已归档/ }).click();
  await expect(page).toHaveURL(/scope=completed/);
  await expect(page).not.toHaveURL(/stage=|wait=|view=board/);
  await expect(page.getByRole("combobox", { name: "筛选阶段" })).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "筛选等待事项" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "看板视图" })).toHaveCount(0);
  const row = page.getByRole("button", {
    name: "打开 接入中心仓库与来源追踪",
    exact: true,
  });
  await expect(row).toContainText("人工验收通过");
  await expect(row.locator("time")).toHaveAttribute(
    "datetime",
    "2026-10-02T08:00:00+08:00",
  );
  await expect(row.locator(".task-progress, .badge")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/changes-archived-desktop.png",
    fullPage: true,
  });
  await row.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.locator(".stage-flow, .overview-progress")).toHaveCount(
    0,
  );
  await expect(drawer.locator(".drawer-badges")).toHaveText("已归档Small");
  await expect(drawer.locator(".archive-outcome")).toContainText(
    "人工验收通过",
  );
  await page.screenshot({
    path: "artifacts/change-archived-detail.png",
    fullPage: true,
  });
  await drawer.getByRole("button", { name: "查看验收依据" }).click();
  await expect(
    drawer.getByText("归档前阶段：验收", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByText("归档目录完整", { exact: true })).toBeVisible();
  await drawer.getByRole("tab", { name: "任务", exact: true }).click();
  await expect(drawer.locator(".task-detail")).toContainText("已完成");
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await page.getByRole("button", { name: "看板视图" }).click();
  await expect(page.locator(".board-column")).toHaveCount(4);
  await page.getByRole("button", { name: "变更", exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(row).toBeVisible();
});

test("invalid scopes preserve Change deep links and inactive filters normalize", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=invalid&c=source-connect`,
  );
  await expect(page).toHaveURL(/scope=active/);
  await expect(page).toHaveURL(/c=source-connect/);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "接入中心仓库与来源追踪", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stage-flow")).toHaveCount(0);
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=completed&stage=execution&wait=pause&view=board`,
  );
  await expect(page).not.toHaveURL(/stage=|wait=|view=board/);
  await expect(page.locator(".outcome-list .change-row")).toHaveCount(1);
  await page.getByRole("combobox", { name: "筛选规模" }).selectOption("medium");
  await expect(
    page.getByText("没有符合条件的记录", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page).toHaveURL(/scope=completed/);
  await expect(page.locator(".outcome-list .change-row")).toHaveCount(1);
  await page.getByRole("tab", { name: /进行中/ }).click();
  await expect(page.getByRole("combobox", { name: "筛选阶段" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("tab", { name: /已归档/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("combobox", { name: "筛选阶段" })).toHaveCount(0);
});

test("cancelled and invalid records focus on reasons and retain history at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/?${repositoryQuery}&m=changes&scope=cancelled`);
  const cancelled = page.getByRole("button", {
    name: "打开 导航布局实验",
    exact: true,
  });
  await expect(cancelled).toContainText("收敛为统一工作台");
  await expect(cancelled.locator("time")).toHaveAttribute(
    "datetime",
    "2026-10-02T08:00:00+08:00",
  );
  await page.screenshot({
    path: "artifacts/changes-cancelled-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cancelled.click();
  await expect(page.locator(".stage-flow, .overview-progress")).toHaveCount(0);
  await expect(page.locator(".drawer-badges")).toHaveText("已取消Large");
  await page.getByRole("tab", { name: "依据", exact: true }).click();
  await expect(
    page.getByText("取消时阶段：执行", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page.getByRole("tab", { name: /来源异常/ }).click();
  const invalid = page.getByRole("button", {
    name: "打开 需要核对的来源记录",
    exact: true,
  });
  await expect(invalid).toContainText("schemaVersion");
  await expect(page.getByRole("button", { name: "看板视图" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await invalid.click();
  await expect(page.locator(".stage-flow, .overview-progress")).toHaveCount(0);
  await expect(page.locator(".drawer-badges")).toContainText("来源待核对");
});

test("empty status scopes describe the scope without offering to reset it", async ({
  page,
  request,
  personal,
}) => {
  const data = await (await request.get(personal.url("workbench"))).json();
  data.changes = data.changes.filter(
    (group: { id: string }) => group.id === "source-connect",
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(
    page.getByText("暂无进行中的 Change", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "清除筛选" })).toHaveCount(0);
  await page.getByRole("tab", { name: /来源异常/ }).click();
  await expect(
    page.getByText("目前没有来源异常", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /已归档/ }).click();
  await expect(
    page.getByRole("button", {
      name: "打开 接入中心仓库与来源追踪",
      exact: true,
    }),
  ).toBeVisible();
});
