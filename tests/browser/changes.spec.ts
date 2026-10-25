import { defaultRepositoryViews } from "../../src/lib/change-views";
import {
  test,
  expect,
  repositoryQuery,
  changeDisplay,
  changeLinks,
  changeRow,
  openMaterial,
  backToChanges,
} from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("planning children await creation without reading issues and preserve parent materials", async ({
  page,
  request,
  personal,
}) => {
  const response = await request.get(personal.url("workbench"));
  expect(response.ok()).toBe(true);
  const data: Snapshot = await response.json();
  const parent = data.changes.find((g) => g.id === "workspace-rollout")!;
  expect(parent.diagnostics).toEqual([]);
  expect(primaryRecord(parent)!.diagnostics).toEqual([]);
  expect(
    parent.relations.find((r) => r.target === "future-child"),
  ).toMatchObject({
    pendingCreation: true,
    exists: false,
    process: "unknown",
    diagnostics: [],
  });

  await page.goto(`/?${repositoryQuery}&m=changes&issues=1`);
  await expect(
    page.getByRole("link", { name: "打开 需要核对的来源记录", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开 工程工作台整体交付", exact: true }),
  ).toHaveCount(0);

  await page.goto(`/?${repositoryQuery}&m=changes&c=workspace-rollout`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("progressbar", { name: "子 Change 结束数" }),
  ).toHaveAttribute("aria-valuenow", "0");
  await expect(main.getByText("0 / 2 子项结束", { exact: true })).toBeVisible();
  await expect(main.getByText("来源待核对", { exact: true })).toHaveCount(0);
  await openMaterial(page, "子项");
  await expect(
    main.getByRole("button", {
      name: "future-child future-child",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(main.getByText("待创建", { exact: true })).toBeVisible();
  await expect(main.getByText("流程未知", { exact: true })).toHaveCount(0);
  await expect(
    main.getByRole("button", { name: /支持手机端连续阅读/ }),
  ).toBeEnabled();

  await openMaterial(page, "需求");
  await expect(
    main.getByRole("heading", { name: "工程工作台整体交付", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByText("建立清晰、可追溯的工程阅读体验。", { exact: true }),
  ).toBeVisible();
  await openMaterial(page, "技术方案");
  await expect(
    main.getByText("从已推送提交建立一致的文档快照。", { exact: true }),
  ).toBeVisible();
  await openMaterial(page, "原型");
  const preview = page.frameLocator('iframe[title="原型：订单列表"]');
  await expect(
    preview.getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await preview.getByRole("button", { name: "0", exact: true }).click();
  await expect(
    preview.getByRole("button", { name: "1", exact: true }),
  ).toBeVisible();
});

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
      recommendation: "保留推荐依据",
      answer: "保留在正文底部。",
      withdrawn: "已由统一目录方案替代",
    },
    Q2: {
      round: 1,
      question: "是否记住阅读位置？",
      recommendation: "保留推荐依据",
    },
    Q1: {
      round: 1,
      question: "目录如何显示？",
      recommendation: "保留推荐依据",
      answer: "最初回答",
      source: "不要展示来源",
    },
  };
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  const section = page.getByRole("region", { name: "澄清问答" });
  await expect(section.locator("dt code")).toHaveText(["Q1", "Q2", "Q10"]);
  await expect(section.getByText("最初回答", { exact: true })).toBeVisible();

  const finalAnswer = `默认收起。\n完整链接：https://example.test/${"reference".repeat(30)}\n<img src=x onerror=alert(1)>`;
  state.clarifications.Q1.answer = finalAnswer;
  await page.reload();
  const items = section.locator("dl > div");
  await expect(items.nth(0).locator("dd")).toHaveText(finalAnswer);
  await expect(section).not.toContainText("最初回答");
  await expect(items.nth(1).locator("dd")).toHaveText("未回答");
  await expect(items.nth(2)).toContainText("已撤回");
  await expect(items.nth(2).locator("dd")).toHaveText("保留在正文底部。");
  await expect(section).not.toContainText("不要展示来源");
  await expect(
    section.getByText("推荐：保留推荐依据", { exact: true }),
  ).toHaveCount(3);
  await expect(items.nth(2)).toContainText("第 2 轮");
  await expect(items.nth(2)).toContainText("已撤回：已由统一目录方案替代");
  await expect(section.locator("img")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/clarifications-desktop.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  await section.scrollIntoViewIfNeeded();
  expect(
    await page
      .getByRole("region", { name: "阅读正文", exact: true })
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
  await expect(page.getByRole("main").getByText("交付已归档")).toBeVisible();
  const section = page.getByRole("region", { name: "澄清问答" });
  await expect(section).toHaveCount(0);
  archived.clarifications = {};
  await page.reload();
  await expect(page.getByRole("main").getByText("交付已归档")).toBeVisible();
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
  const drawer = page.getByRole("main");
  await expect(
    drawer.getByRole("heading", { name: "默认串行的任务安排", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("region", { name: "类型与紧急程度", exact: true }),
  ).not.toContainText("来源提示");
  await expect(drawer.getByText("等待默认串行验收")).toBeVisible();
  await openMaterial(page, "任务");
  await expect(
    drawer.getByText("默认按任务编号串行执行。", { exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("region", { name: "执行顺序", exact: true }),
  ).toContainText("无前置");
  await expect(
    drawer.getByRole("region", { name: "执行顺序", exact: true }),
  ).toContainText("T1");
  await page.screenshot({
    path: "artifacts/default-serial-change.png",
    fullPage: true,
  });
  await backToChanges(page);
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader&ct=tasks`);
  await expect(
    page
      .getByRole("main")
      .getByText("按 Plan 中的显式执行顺序执行。", { exact: true }),
  ).toBeVisible();
});

test("list filters, inline materials and task order preserve context", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes&scope=active`);
  const row = page.getByRole("link", {
    name: "打开 让工程文档成为清晰的阅读体验",
    exact: true,
  });
  await expect(row).toBeVisible();
  await row.click();
  const drawer = page.getByRole("main");
  await expect(
    drawer.getByRole("heading", {
      name: "让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await expect(drawer.getByText("等待阅读样式验收")).toBeVisible();
  await openMaterial(page, "任务");
  await expect(
    drawer
      .getByRole("list", { name: "实现任务", exact: true })
      .getByText("读取与校验项目来源", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "查看 Plan 原文依据" }).click();
  await expect(page).toHaveURL(/ct=plan/);
  await expect(
    page.getByRole("heading", { name: "实施计划", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/ct=tasks/);
  await backToChanges(page);
  await expect(row).toBeFocused();
  await changeDisplay(page, "看板");
  await expect(
    page
      .getByRole("region", { name: "按阶段看板（只读）" })
      .locator(":scope > section"),
  ).toHaveCount(5);
  await page.screenshot({
    path: "artifacts/changes-board-desktop.png",
    fullPage: true,
  });
  await changeDisplay(page, "列表");
  await expect(row).toBeVisible();
  await expect(
    page.getByRole("combobox", {
      name: /筛选规模|筛选任务状态|筛选阶段|筛选等待事项/,
    }),
  ).toHaveCount(0);
});
test("dependencies, parent children, cancellation, archived evidence and invalid source", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&view=dependencies&c=document-reader`,
  );
  await expect(page).not.toHaveURL(/view=dependencies/);
  await expect(page.getByText("流程已满足").first()).toBeVisible();
  await backToChanges(page);
  await page
    .getByRole("link", { name: "打开 工程工作台整体交付", exact: true })
    .click();
  await openMaterial(page, "子项");
  await expect(
    page.getByRole("main").getByRole("button", { name: /支持手机端连续阅读/ }),
  ).toBeVisible();
  await backToChanges(page);
  await page.getByRole("tab", { name: /已取消/ }).click();
  await page
    .getByRole("link", { name: "打开 导航布局实验", exact: true })
    .click();
  await expect(
    page.getByRole("main").getByText("收敛为统一工作台"),
  ).toBeVisible();
  await backToChanges(page);
  await page.getByRole("tab", { name: /已完成/ }).click();
  await page
    .getByRole("link", { name: "打开 接入中心仓库与来源追踪", exact: true })
    .click();
  await openMaterial(page, "依据");
  await expect(page.getByText("人工验收通过", { exact: true })).toBeVisible();
  await expect(page.getByText("归档目录完整", { exact: true })).toBeVisible();
  await backToChanges(page);
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await page
    .getByRole("link", { name: "打开 需要核对的来源记录", exact: true })
    .click();
  await expect(
    page
      .getByRole("main")
      .getByText("schemaVersion：Invalid literal value, expected 1"),
  ).toBeVisible();
  await openMaterial(page, "依据");
  await page.getByRole("button", { name: /流程状态原文/ }).click();
  await expect(page.getByRole("dialog").last().locator("pre")).toContainText(
    '"schemaVersion": 2',
  );
});
test("mobile Change reading, URL restore and 320px fit", async ({ page }) => {
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
  await backToChanges(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("link", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    })
    .click();
  await openMaterial(page, "任务");
  await page.reload();
  await expect(page).toHaveURL(/ct=tasks/);
  await expect(
    page.getByRole("list", { name: "实现任务", exact: true }),
  ).toBeVisible();
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
  await page.route("**/api/repositories/second/change-views*", (route) =>
    route.fulfill({ json: defaultRepositoryViews() }),
  );
  await page.goto(
    `/?${repositoryQuery}&m=changes&spec=platform&noTypes=1&urgency=normal&sort=urgency`,
  );
  await expect(
    page.getByRole("link", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^当前仓库：/ }).click();
  await page.getByRole("menuitemradio", { name: "第二项目" }).click();
  await expect(page).not.toHaveURL(/spec=|types=|noTypes=|urgency=|sort=/);
  await expect(page.getByRole("tab", { name: /^我的/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: /进行中/ }).click();
  await expect(
    page.getByRole("link", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
});

test("material navigation distinguishes missing, unreadable and not-yet-required files", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=execution`,
  );
  await expect(
    page
      .getByRole("navigation", { name: "Change 材料" })
      .getByRole("link", { name: /^执行记录/ }),
  ).toContainText("缺失");
  await expect(
    page.getByRole("alert").filter({ hasText: "文件缺失" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Change 材料" })
      .getByRole("link", { name: /^评审记录/ }),
  ).toContainText("不可读");
  await page.goto(`/?${repositoryQuery}&m=changes&c=mobile-reading&ct=plan`);
  await expect(page.getByText(/plan.md.*当前规模不要求/)).toBeVisible();
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=delivery-review&ct=technical`,
  );
  await expect(page.getByText(/technical.md.*当前阶段尚未要求/)).toBeVisible();
});

test("only active Changes use the board and completed rows retain archive evidence", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&view=board&stage=execution&wait=confirmation`,
  );
  const scopes = page.getByRole("tablist", {
    name: "Change 状态",
    exact: true,
  });
  await expect(scopes.getByRole("tab")).toHaveCount(5);
  await expect(page).not.toHaveURL(/stage=|wait=/);
  await page
    .getByRole("link", {
      name: "打开 让工程文档成为清晰的阅读体验",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("list", { name: "阶段", exact: true }),
  ).toBeVisible();
  await backToChanges(page);
  await scopes.getByRole("tab", { name: /已完成/ }).click();
  await expect(page).toHaveURL(/scope=completed/);
  await expect(page).not.toHaveURL(/view=board/);
  const row = changeRow(page, "接入中心仓库与来源追踪");
  await expect(row.locator("time").first()).toHaveAttribute(
    "datetime",
    "2026-10-02T08:00:00+08:00",
  );
  await page
    .getByRole("link", { name: "打开 接入中心仓库与来源追踪", exact: true })
    .click();
  const drawer = page.getByRole("main");
  await expect(drawer.getByRole("progressbar")).toHaveCount(0);
  await expect(
    drawer.getByText("交付已归档", { exact: true }).locator(".."),
  ).toContainText("人工验收通过");
  await drawer.getByRole("button", { name: "查看验收依据" }).click();
  await expect(drawer.getByText("归档目录完整", { exact: true })).toBeVisible();
  await openMaterial(page, "任务");
  await expect(
    drawer.getByRole("list", { name: "实现任务", exact: true }),
  ).toContainText("已完成");
});

test("invalid and retired filters preserve deep links and scope navigation", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=invalid&c=source-connect`,
  );
  await expect(page).not.toHaveURL(/scope=invalid/);
  await expect(page).toHaveURL(/c=source-connect/);
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "接入中心仓库与来源追踪", exact: true }),
  ).toBeVisible();
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=completed&stage=execution&wait=pause&size=medium&level=tasks&taskStatus=doing&view=board`,
  );
  await expect(page).not.toHaveURL(/stage=|wait=|size=|level=|taskStatus=/);
  await expect(changeLinks(page)).toHaveCount(2);
  await page.getByRole("tab", { name: /进行中/ }).click();
  await page.goBack();
  await expect(page.getByRole("tab", { name: /已完成/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("combobox", {
      name: /筛选规模|筛选阶段|筛选等待事项|筛选任务状态/,
    }),
  ).toHaveCount(0);
});

test("cancelled and invalid records focus on reasons and retain history at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/?${repositoryQuery}&m=changes&scope=cancelled`);
  const cancelled = page.getByRole("link", {
    name: "打开 导航布局实验",
    exact: true,
  });
  await expect(changeRow(page, "导航布局实验")).toContainText(
    "收敛为统一工作台",
  );
  await expect(
    changeRow(page, "导航布局实验").locator("time").first(),
  ).toHaveAttribute("datetime", "2026-10-02T08:00:00+08:00");
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
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.getByRole("main").getByText("已取消", { exact: true }),
  ).toBeVisible();
  await openMaterial(page, "依据");
  await expect(
    page.getByText("取消时阶段：执行", { exact: true }),
  ).toBeVisible();
  await backToChanges(page);
  await page.getByRole("button", { name: "查看", exact: true }).click();
  const invalid = page.getByRole("link", {
    name: "打开 需要核对的来源记录",
    exact: true,
  });
  await expect(changeRow(page, "需要核对的来源记录")).toContainText(
    "schemaVersion",
  );
  await expect(page.getByRole("button", { name: "看板视图" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await invalid.click();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(
    page.getByRole("main").getByText("来源待核对", { exact: true }),
  ).toBeVisible();
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
  await page.goto(`/?${repositoryQuery}&m=changes&scope=active`);
  await expect(
    page.getByText("暂无进行中的 Change", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "清除筛选" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "查看", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/?${repositoryQuery}&m=changes&issues=1`);
  await expect(
    page.getByText("目前没有来源异常", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /已完成/ }).click();
  await expect(
    page.getByRole("link", {
      name: "打开 接入中心仓库与来源追踪",
      exact: true,
    }),
  ).toBeVisible();
});
