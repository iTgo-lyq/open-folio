import { test, expect, repositoryQuery } from "./connected";
import {
  primaryRecord,
  type ChangeGroup,
  type Snapshot,
} from "../../src/lib/model";

test("continuations show grouped deliveries directly while keeping spacing, filters and deep links", async ({
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
  primaryRecord(root)!.state!.types = ["流程"];
  primaryRecord(root)!.state!.urgency = "low";
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
    urgency: "high",
    followUpOf: root.id,
    followUpTitle: "完善技术方案问询机制",
  };
  const active = data.changes.find((g) => g.id === "document-reader")!;
  primaryRecord(active)!.state!.followUpOf = next.id;
  primaryRecord(active)!.state!.types = ["流程"];
  const cancelled = data.changes.find((g) => g.id === "layout-experiment")!;
  primaryRecord(cancelled)!.state!.followUpOf = root.id;
  const standalone = structuredClone(root);
  standalone.id =
    standalone.primary =
    standalone.candidates[0].key =
      "unrelated";
  standalone.title = standalone.candidates[0].title = "独立交付";
  standalone.candidates[0].id = standalone.candidates[0].state!.id =
    standalone.id;
  standalone.candidates[0].state!.title = standalone.title;
  data.changes = [root, next, active, cancelled, standalone];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=completed`);
  const group = page.getByRole("region", {
    name: "完善技术方案问询机制 的连续交付",
  });
  await expect(page.locator(".follow-up-group")).toHaveCount(1);
  await expect(group.getByRole("heading")).toHaveText("完善技术方案问询机制");
  await expect(group.getByRole("button")).toHaveCount(2);
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
    path: "artifacts/follow-ups-grouped-desktop.png",
    fullPage: true,
  });
  const frame = await group.boundingBox();
  const heading = await group.getByRole("heading").boundingBox();
  expect(heading!.y).toBeLessThan(frame!.y);
  expect(heading!.y + heading!.height).toBeGreaterThan(frame!.y);
  const separator = await group
    .locator(".change-row")
    .first()
    .evaluate((el) => {
      const style = getComputedStyle(el, "::after");
      return { left: parseFloat(style.left), right: parseFloat(style.right) };
    });
  expect(separator.left).toBeGreaterThanOrEqual(12);
  expect(separator.right).toBeGreaterThanOrEqual(12);
  const following = await page
    .getByRole("button", { name: "打开 独立交付", exact: true })
    .boundingBox();
  expect(following!.y - (frame!.y + frame!.height)).toBeGreaterThanOrEqual(12);
  await group
    .getByRole("button", { name: "打开 技术方案问询", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/c=source-connect/);
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page
    .getByRole("combobox", { name: "变更排序" })
    .selectOption("urgency");
  await expect(group.locator(".change-row-title strong")).toHaveText([
    "需求与技术额度分别计算",
    "技术方案问询",
  ]);
  await page.getByRole("button", { name: "筛选类型" }).click();
  await page.getByRole("checkbox", { name: "流程", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(group.getByRole("heading")).toHaveText("完善技术方案问询机制");
  await page.getByRole("combobox", { name: "筛选规模" }).selectOption("medium");
  await expect(group.getByRole("button")).toHaveCount(1);
  await expect(group.getByRole("heading")).toHaveText("完善技术方案问询机制");
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
  await group
    .getByRole("button", { name: `打开 ${active.title}`, exact: true })
    .click();
  await expect(page).toHaveURL(/c=document-reader/);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "连续交付", exact: true }),
  ).toContainText("需求与技术额度分别计算");
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await page.setViewportSize({ width: 320, height: 740 });
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
  await expect(group.getByRole("button")).toHaveCount(1);
  await expect(
    group.getByRole("button", { name: `打开 ${cancelled.title}`, exact: true }),
  ).toBeVisible();
  record.state.followUpTitle =
    "完善技术方案问询机制并保持需求与技术问询额度独立，覆盖后续持续交付";
  await page.reload();
  const longGroup = page.locator(".follow-up-group");
  await expect(longGroup.getByRole("heading")).toHaveText(
    record.state.followUpTitle,
  );
  const wrapped = await longGroup.getByRole("heading").boundingBox();
  const row = await longGroup.getByRole("button").boundingBox();
  expect(row!.y).toBeGreaterThanOrEqual(wrapped!.y + wrapped!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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
