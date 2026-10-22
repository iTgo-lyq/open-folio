import {
  test,
  expect,
  repositoryQuery,
  changeRow,
  openMaterial,
  backToChanges,
  openChangeFilters,
} from "./connected";
import {
  primaryRecord,
  type Snapshot,
  type Delivery,
  type PullRequest,
} from "../../src/lib/model";
function pr(number: number, release = false): PullRequest {
  return {
    number,
    title: release ? "正式版本 1.2" : "改进交付流程",
    url: `https://github.com/acme/fixture/pull/${number}`,
    state: "open",
    draft: false,
    base: {
      repositoryId: "1",
      branch: release ? "main" : "develop",
      commit: "a".repeat(40),
    },
    head: {
      repositoryId: "1",
      branch: release ? "develop" : "change/example",
      commit: "b".repeat(40),
    },
    mergeCommit: null,
    updatedAt: "2026-10-21T00:00:00Z",
    ...(release ? { version: "1.2" } : {}),
  };
}
test("delivery groups include archived Changes, combine labels and expose PRs without nested links", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const group = data.changes.find((g) => g.id === "integration-demo")!;
  const state = primaryRecord(group)!.state!;
  state.types = ["修复"];
  state.urgency = "high";
  const delivery: Delivery = {
    stage: "pendingIntegration",
    changePrs: [pr(1)],
    releasePrs: [],
    diagnostics: [],
    stale: false,
  };
  data.deliveryByChange = { [group.id]: delivery };
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&stage=execution&wait=pause`);
  await page.getByRole("tab", { name: /^已完成/ }).click();
  await expect(page).toHaveURL(/scope=completed/);
  await expect(page).not.toHaveURL(/stage=|wait=/);
  const row = page.getByRole("link", {
    name: `打开 ${group.title}`,
    exact: true,
  });
  await expect(row).toBeVisible();
  await expect(
    changeRow(page, group.title).getByText("待集成", { exact: true }),
  ).toBeVisible();
  await expect(changeRow(page, group.title).locator("a a")).toHaveCount(0);
  await expect(
    changeRow(page, group.title).getByRole("link", { name: "Change PR #1" }),
  ).toHaveAttribute("href", pr(1).url);
  const menu = await openChangeFilters(page);
  await menu.getByRole("menuitemcheckbox", { name: "高", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(row).toBeVisible();
  await row.click();
  const details = page.getByRole("region", { name: "交付进度" });
  await expect(
    details.getByRole("link", { name: /#1 改进交付流程/ }),
  ).toHaveAttribute("href", pr(1).url);
  delivery.changePrs[0].state = "closed";
  delivery.diagnostics = ["尚无待合入的关联 Change PR。"];
  await page.reload();
  await expect(details.getByText("PR 已关闭", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("main").getByText("交付已归档", { exact: true }),
  ).toBeVisible();
  delivery.stage = "pendingRelease";
  delivery.changePrs[0].state = "merged";
  delivery.releasePrs = [pr(2, true)];
  delivery.diagnostics = [];
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=pendingRelease&urgency=high&types=${encodeURIComponent(JSON.stringify(["修复"]))}`,
  );
  await expect(row).toBeVisible();
  await page.reload();
  await expect(page.getByRole("tab", { name: /^已完成/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await row.click();
  await expect(details.getByText("版本 1.2", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("link", { name: /#2 正式版本/ }),
  ).toHaveAttribute("target", "_blank");
  delivery.stage = "releaseMerged";
  delivery.releasePrs[0].state = "merged";
  await page.reload();
  await expect(details.getByText("已发布", { exact: true })).toBeVisible();
  await backToChanges(page);
  await expect(row).toBeVisible();
  await expect(page.getByRole("heading", { name: /^已发布/ })).toBeVisible();
});

test("delivery history, stale diagnostics and draft links stay readable on desktop and narrow screens", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const id = "document-reader";
  const item: Delivery = {
    changePrs: [
      { ...pr(2), draft: true },
      { ...pr(1), state: "closed" },
    ],
    releasePrs: [],
    diagnostics: [],
    stale: false,
  };
  data.deliveryByChange = { [id]: item };
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({
      json: { ...data, deliveryLastSuccess: "2026-10-21T00:00:00Z" },
    }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&c=${id}`);
  const details = page.getByRole("region", { name: "交付进度" });
  await expect(details.getByText("Draft PR", { exact: true })).toBeVisible();
  await expect(details.getByText("待集成", { exact: true })).toHaveCount(0);
  item.stage = "unknown";
  item.stale = true;
  item.diagnostics = [
    "PR 信息不可读，请检查 Pull requests: read 权限。",
    "存在多个待合入 PR，无法确定当前交付，请核对关联标记。",
  ];
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await expect(
      details.getByText("交付待核实", { exact: true }),
    ).toBeVisible();
    await expect(details.getByText(/最近成功读取/)).toBeVisible();
    await expect(
      details.getByText("PR 信息待核实", { exact: true }),
    ).toBeVisible();
    await expect(details.getByText("暂无关联 PR", { exact: true })).toHaveCount(
      0,
    );
    const history = details.locator("summary");
    await history.focus();
    await page.keyboard.press("Enter");
    await expect(details.getByRole("link", { name: /#1/ })).toBeVisible();
    await details.scrollIntoViewIfNeeded();
    expect(
      await page
        .getByRole("region", { name: "阅读正文", exact: true })
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `artifacts/delivery-${width}.png` });
    await openMaterial(page, "需求");
    await expect(page.getByRole("region", { name: "交付进度" })).toHaveCount(0);
    await openMaterial(page, "概览");
  }
});
