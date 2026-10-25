import {
  test,
  expect,
  repositoryQuery,
  changeDisplay,
  changeLinks,
  openChangeFilters,
} from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";
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
  await page.goto(`/?${repositoryQuery}&m=changes`);
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
    "archive-0": { stage: "pendingRelease", changePrs: [] },
    "archive-1": { stage: "releaseMerged", changePrs: [] },
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
