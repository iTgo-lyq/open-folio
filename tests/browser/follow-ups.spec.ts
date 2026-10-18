import { test, expect, repositoryQuery } from "./connected";
import {
  primaryRecord,
  type ChangeGroup,
  type Snapshot,
} from "../../src/lib/model";

test("continuations fold archived deliveries while keeping active members, filters and deep links", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const root = data.changes.find((g) => g.id === "source-connect")!;
  root.title = "技术方案问询";
  primaryRecord(root)!.state!.title = root.title;
  const next: ChangeGroup = structuredClone(root);
  next.id = "technical-budget";
  next.title = "需求与技术额度分别计算";
  next.primary = "technical-budget";
  const record = next.candidates[0];
  record.key = next.primary;
  record.id = next.id;
  record.title = next.title;
  record.state = {
    ...record.state!,
    id: next.id,
    title: next.title,
    size: "medium",
    followUpOf: root.id,
  };
  const active = data.changes.find((g) => g.id === "document-reader")!;
  primaryRecord(active)!.state!.followUpOf = next.id;
  const cancelled = data.changes.find((g) => g.id === "layout-experiment")!;
  primaryRecord(cancelled)!.state!.followUpOf = root.id;
  data.changes = [root, next, active, cancelled];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=completed`);
  const group = page.getByRole("region", { name: "技术方案问询 的连续交付" });
  await expect(page.locator(".follow-up-group")).toHaveCount(1);
  await expect(group).toContainText("4 次交付记录 · 当前匹配 2 条");
  await expect(group).toContainText("1 项调整进行中");
  const toggle = group.getByRole("button", {
    name: "展开 技术方案问询 的交付记录",
  });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({
    path: "artifacts/follow-ups-collapsed-desktop.png",
    fullPage: true,
  });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(
    group.getByRole("button", { name: "打开 技术方案问询", exact: true }),
  ).toBeVisible();
  await expect(
    group.getByRole("button", {
      name: "打开 需求与技术额度分别计算",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/follow-ups-expanded-desktop.png",
    fullPage: true,
  });
  await page.getByRole("combobox", { name: "筛选规模" }).selectOption("medium");
  await expect(group).toContainText("当前匹配 1 条");
  await expect(
    group.getByRole("button", { name: "打开 技术方案问询", exact: true }),
  ).toHaveCount(0);
  await group
    .getByRole("button", { name: "打开 需求与技术额度分别计算", exact: true })
    .click();
  const context = page.getByRole("region", { name: "连续交付", exact: true });
  await expect(context).toContainText("延续自");
  await expect(context).toContainText(active.title);
  await context
    .getByRole("button", { name: "技术方案问询", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/c=source-connect/);
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(group).toContainText(`进行中：${active.title}`);
  await group.getByRole("button", { name: "查看进行中", exact: true }).click();
  await expect(page).toHaveURL(/c=document-reader/);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "连续交付", exact: true }),
  ).toContainText("需求与技术额度分别计算");
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  await group.getByRole("button", { name: /展开/ }).click();
  await expect(
    group.getByRole("button", { name: `打开 ${active.title}`, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/follow-ups-mobile.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /已取消/ }).click();
  await expect(group).toContainText("当前匹配 1 条");
  await group.getByRole("button", { name: /展开/ }).click();
  await expect(
    group.getByRole("button", { name: `打开 ${cancelled.title}`, exact: true }),
  ).toBeVisible();
});

test("broken follow-up references show a warning without hiding delivery evidence", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const root = data.changes.find((g) => g.id === "source-connect")!;
  primaryRecord(root)!.state!.followUpOf = "missing-predecessor";
  data.changes = [root];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=completed`);
  await expect(page.locator(".follow-up-warning")).toContainText(
    "missing-predecessor",
  );
  await page
    .getByRole("button", { name: `打开 ${root.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "连续交付", exact: true }),
  ).toContainText("延续关系不可用");
  await expect(page.getByText("交付已归档", { exact: true })).toBeVisible();
  const record = primaryRecord(root)!;
  delete record.state!.followUpOf;
  record.diagnostics.push({
    code: "FOLLOW_UP_INVALID",
    message: "前序关联格式不合法，请检查 followUpOf；原交付事实仍可阅读。",
    severity: "warning",
  });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "连续交付", exact: true }),
  ).toContainText("前序关联格式不合法");
  await expect(page.getByText("交付已归档", { exact: true })).toBeVisible();
});
