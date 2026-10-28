import {
  test,
  expect,
  repositoryQuery,
  changeDisplay,
  changeLinks,
  openChangeFilters,
} from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("deferred requirements and stage dots match the accepted list, board and detail prototype", async ({
  page,
  request,
  personal,
}, testInfo) => {
  test.setTimeout(90000);
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const original = data.changes.find(
    (change) => change.id === "document-reader",
  )!;
  data.changes = ["待确认的需求", "受阻的实现", "正在推进", "暂缓的需求"].map(
    (title, index) => {
      const change = structuredClone(original),
        record = primaryRecord(change)!;
      change.id = index === 3 ? "document-reader" : `deferred-ui-${index}`;
      change.title = record.title = title;
      change.diagnostics = [];
      change.relations = [];
      record.state = {
        ...record.state!,
        id: change.id,
        title,
        status: "active",
        stage:
          index === 1 ? "execution" : index === 2 ? "technical" : "requirement",
        tasks: {},
        closure: {},
      };
      record.diagnostics = [];
      delete record.state.waitingFor;
      if (index === 0)
        record.state.waitingFor = {
          kind: "confirmation",
          summary: "等待确认范围",
        };
      if (index === 1)
        record.state.tasks = {
          T1: {
            title: "等待接口",
            status: "blocked",
            reason: "真实接口受阻原因",
          },
        };
      if (index === 3)
        record.state.waitingFor = {
          kind: "pause",
          summary: "只记录，短期不启动",
        };
      return change;
    },
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  for (const theme of ["light", "dark"] as const)
    for (const [width, height] of [
      [1440, 1000],
      [834, 1194],
      [390, 844],
      [320, 720],
    ]) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height });
      await page.goto(
        `/?${repositoryQuery}&m=changes&scope=active&changeView=system:active&creatorSelf=0`,
      );
      const paused = page.getByRole("region", { name: "暂缓", exact: true });
      await expect(paused).toContainText("只记录，短期不启动");
      await expect(paused.locator("[data-paused] svg")).toHaveCount(1);
      await expect(paused.getByTitle("暂未安排任务")).toHaveText("—");
      const stage = paused.locator('[data-stage-progress="requirement"]');
      await expect(stage.locator("i")).toHaveCount(5);
      await expect(stage.locator("i[data-current]")).toHaveCount(1);
      await expect(stage).toHaveAttribute(
        "aria-label",
        "阶段：需求，第 1 / 5 阶段",
      );
      await expect(
        page.getByRole("region", { name: "受阻", exact: true }),
      ).toContainText("真实接口受阻原因");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      if (width === 1440)
        await page.screenshot({
          path: testInfo.outputPath(`list-${theme}.png`),
          fullPage: true,
        });
      if (width >= 834) {
        await changeDisplay(page, "看板");
        await expect(
          page.getByRole("region", { name: "按处理状态看板（只读）" }),
        ).toBeVisible();
        await expect(
          page.getByRole("region", { name: "暂缓", exact: true }),
        ).toContainText("暂缓的需求");
        await changeDisplay(page, "阶段");
        const board = page.getByRole("region", { name: "按阶段看板（只读）" });
        await expect(board.locator(":scope > section")).toHaveCount(5);
        if (width === 1440)
          await page.screenshot({
            path: testInfo.outputPath(`stage-board-${theme}.png`),
            fullPage: true,
          });
        await changeDisplay(page, "列表");
      } else await expect(stage).toBeHidden();
    }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=overview&changeView=system:active`,
  );
  await expect(
    page.getByText("可继续补充需求，明确恢复后再推进。"),
  ).toBeVisible();
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader&ct=tasks`);
  await expect(
    page.getByText(
      "需求已记录，暂未安排任务。明确恢复推进后，再继续确认与规划。",
    ),
  ).toBeVisible();
});
test("processing groups expose real creators and creation order independently of urgency", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const original = data.changes.find(
    (change) => change.id === "document-reader",
  )!;
  data.changes = ["等待确认的交付", "接口受阻的交付", "正在推进的交付"].map(
    (title, i) => {
      const change = structuredClone(original),
        id = `directory-${i}`;
      change.id = change.primary = id;
      change.title = title;
      change.creator = { name: i === 1 ? "mei" : "lin" };
      change.collaborators = [change.creator];
      change.createdAt = `2026-10-${20 + i}T00:00:00.000Z`;
      change.diagnostics = [];
      change.relations = [];
      const record = change.candidates.find(
        (record) => record.key === original.primary,
      )!;
      record.key = record.id = id;
      record.title = title;
      record.diagnostics = [];
      record.state = {
        ...record.state!,
        id,
        title,
        stage: "execution",
        tasks: {},
        urgency: i === 1 ? "urgent" : "normal",
      };
      delete record.state.waitingFor;
      if (i === 0)
        record.state.waitingFor = {
          kind: "confirmation",
          summary: "请确认当前实现。",
        };
      if (i === 1)
        record.state.tasks = {
          T1: {
            title: "读取接口",
            status: "blocked",
            reason: "等待接口恢复。",
          },
        };
      return change;
    },
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=active`);
  for (const name of ["等待确认", "受阻", "推进中"])
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "受阻", exact: true }),
  ).toContainText("等待接口恢复。");
  await expect(
    page
      .getByRole("region", { name: "Change 列表", exact: true })
      .getByText("lin", { exact: true }),
  ).toHaveCount(2);
  await changeDisplay(page, "不分组");
  await expect
    .poll(() =>
      changeLinks(page).evaluateAll((links) =>
        links.map((link) => link.getAttribute("aria-label")),
      ),
    )
    .toEqual([
      "打开 正在推进的交付",
      "打开 接口受阻的交付",
      "打开 等待确认的交付",
    ]);
  await changeDisplay(page, "紧急程度优先");
  await expect(changeLinks(page).first()).toHaveAccessibleName(
    "打开 接口受阻的交付",
  );
  const menu = await openChangeFilters(page);
  await menu
    .getByRole("menuitemcheckbox", { name: "lin", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(changeLinks(page)).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get("creator")).toBe('["lin"]');
  await page.reload();
  await expect(changeLinks(page)).toHaveCount(2);
  await page
    .getByRole("button", { name: "移除筛选 创建者：lin", exact: true })
    .click();
  await expect(changeLinks(page)).toHaveCount(3);
});

test("published records move to archive and zero cancelled hides only the tab", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const original = data.changes.find(
    (change) => change.id === "document-reader",
  )!;
  data.changes = ["待发布记录", "已发布记录"].map((title, index) => {
    const change = structuredClone(original);
    change.id = `archive-${index}`;
    change.title = title;
    change.diagnostics = [];
    const record = primaryRecord(change)!;
    record.validCompleted = true;
    record.diagnostics = [];
    record.state!.status = "completed";
    return change;
  });
  data.deliveryByChange = {
    "archive-0": {
      stage: "pendingRelease",
      changePrs: [],
      releasePrs: [],
      diagnostics: [],
      stale: false,
    },
    "archive-1": {
      stage: "releaseMerged",
      changePrs: [],
      releasePrs: [],
      diagnostics: [],
      stale: false,
    },
  } as Snapshot["deliveryByChange"];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=completed`);
  await expect(changeLinks(page)).toHaveCount(1);
  await expect(changeLinks(page)).toHaveAccessibleName("打开 待发布记录");
  await expect(page.getByRole("tab", { name: /已取消/ })).toHaveCount(0);
  await page.getByRole("tab", { name: /已归档/ }).click();
  await expect(changeLinks(page)).toHaveAccessibleName("打开 已发布记录");
  await page.goto(`/?${repositoryQuery}&m=changes&scope=cancelled`);
  await expect(page.getByText("暂无已取消的 Change")).toBeVisible();
});
