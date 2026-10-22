import {
  test,
  expect,
  repositoryQuery,
  changeDisplay,
  backToChanges,
  openChangeFilters,
} from "./connected";
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
  next.creator = { name: "后续作者" };
  root.creator = { name: "原始作者" };
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
  await expect(group).toHaveCount(1);
  await expect(group.getByRole("heading")).toHaveText("完善技术方案问询机制");
  await expect(group.getByRole("link")).toHaveCount(2);
  await expect(
    group.getByRole("link", { name: "打开 技术方案问询", exact: true }),
  ).toBeVisible();
  await expect(
    group.getByRole("link", {
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
  const first = await group.getByRole("link").first().boundingBox();
  expect(first!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
  await group
    .getByRole("link", { name: "打开 技术方案问询", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/c=source-connect/);
  await backToChanges(page);
  await changeDisplay(page, "紧急程度优先");
  await expect
    .poll(() =>
      group
        .getByRole("link")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("aria-label")),
        ),
    )
    .toEqual(["打开 需求与技术额度分别计算", "打开 技术方案问询"]);
  const menu = await openChangeFilters(page);
  await menu
    .getByRole("menuitemcheckbox", { name: "流程", exact: true })
    .click();
  await menu
    .getByRole("menuitemcheckbox", { name: "后续作者", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(group.getByRole("link")).toHaveCount(1);
  await expect(group.getByRole("heading")).toHaveText("完善技术方案问询机制");
  await expect(
    group.getByRole("link", { name: "打开 技术方案问询", exact: true }),
  ).toHaveCount(0);
  await group
    .getByRole("link", { name: "打开 需求与技术额度分别计算", exact: true })
    .click();
  const context = page.getByRole("region", { name: "连续交付", exact: true });
  await expect(context).toContainText("延续自");
  await expect(context).toContainText(active.title);
  await context
    .getByRole("button", { name: "技术方案问询", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/c=source-connect/);
  await backToChanges(page);
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await group
    .getByRole("link", { name: `打开 ${active.title}`, exact: true })
    .click();
  await expect(page).toHaveURL(/c=document-reader/);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "连续交付", exact: true }),
  ).toContainText("需求与技术额度分别计算");
  await backToChanges(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(
    group.getByRole("link", { name: `打开 ${active.title}`, exact: true }),
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
  await expect(group.getByRole("link")).toHaveCount(1);
  await expect(
    group.getByRole("link", { name: `打开 ${cancelled.title}`, exact: true }),
  ).toBeVisible();
  record.state.followUpTitle =
    "完善技术方案问询机制并保持需求与技术问询额度独立，覆盖后续持续交付";
  await page.reload();
  const longGroup = page.getByRole("region", {
    name: `${record.state.followUpTitle} 的连续交付`,
  });
  await expect(longGroup.getByRole("heading")).toHaveText(
    record.state.followUpTitle,
  );
  const wrapped = await longGroup.getByRole("heading").boundingBox();
  const row = await longGroup.getByRole("link").boundingBox();
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
  await expect(
    page.getByText(/延续关系不可用.*missing-predecessor/),
  ).toBeVisible();
  await page
    .getByRole("link", { name: `打开 ${root.title}`, exact: true })
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
