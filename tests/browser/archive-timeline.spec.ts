import {
  test,
  expect,
  repositoryQuery,
  changeLinks,
  openChangeFilters,
  backToChanges,
} from "./connected";
import {
  primaryRecord,
  type Snapshot,
  type PullRequest,
} from "../../src/lib/model";
import { completedChange } from "../integration-fixture";
import { writeFile } from "node:fs/promises";

test.use({ timezoneId: "Asia/Shanghai" });

test("archive timeline groups merge days and batches, filters, expands and restores detail focus", async ({
  page,
  request,
  personal,
}) => {
  test.setTimeout(60_000);
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const original = data.changes.find(
    (change) => change.id === "document-reader",
  )!;
  const titles = [
    "优化归档时间线",
    "统一交付状态文案",
    "完善移动端阅读体验",
    "修复长标题显示",
    "文档阅读体验",
    "增加原型设备预览",
    "改进项目切换",
    "历史交付补记",
  ];
  data.deliveryByChange = {};
  data.changes = titles.map((title, i) => {
    const change = structuredClone(original);
    const record = primaryRecord(change)!;
    const id = i === 4 ? original.id : `timeline-${i}`;
    change.id = change.primary = record.key = record.id = id;
    change.title = record.title = title;
    change.createdAt = `2026-10-${20 + i}T00:00:00Z`;
    change.creator = { name: i % 2 ? "lin" : "mei" };
    change.collaborators = [change.creator];
    change.diagnostics = record.diagnostics = [];
    record.validCompleted = true;
    record.state = {
      ...record.state!,
      id,
      title,
      status: "completed",
      closure: completedChange(id).closure as NonNullable<
        typeof record.state
      >["closure"],
      types: i % 2 ? ["修复"] : ["体验"],
    };
    const number = i < 5 ? 128 : i === 5 ? 130 : 120;
    const pr: PullRequest = {
      number,
      title: "合入版本",
      url: `https://github.com/acme/fixture/pull/${number}`,
      state: "merged",
      draft: false,
      base: { repositoryId: "1", branch: "main", commit: "a".repeat(40) },
      head: { repositoryId: "1", branch: "develop", commit: "b".repeat(40) },
      mergeCommit: "c".repeat(40),
      updatedAt: "2026-10-28T00:00:00Z",
      mergedAt:
        i < 5
          ? "2026-10-27T01:00:00Z"
          : i === 5
            ? "2026-10-27T08:00:00Z"
            : "2026-10-25T04:00:00Z",
      version: number === 128 ? "v0.8.0" : number === 130 ? "v0.8.1" : "v0.7.0",
    };
    data.deliveryByChange![id] = {
      stage: "releaseMerged",
      changePrs: [],
      releasePrs: i === 7 ? [] : [pr],
      ...(i === 7 ? {} : { releaseMergedPrNumber: number }),
      diagnostics: [],
      stale: false,
    };
    return change;
  });
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=archived&sort=urgency&group=stage&view=board`,
  );
  const day = page.getByRole("region", { name: "2026年10月27日", exact: true });
  await expect(day).toBeVisible();
  await expect(day).toContainText("6 个 Change");
  await expect(
    page.getByRole("button", { name: "显示", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: "创建者", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("menuitemradio")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "合入时间未知", exact: true }),
  ).toContainText("历史交付补记");
  const batch = page.getByRole("region", { name: "合入 PR #128", exact: true });
  await expect(batch.getByRole("link", { name: /^打开 / })).toHaveCount(3);
  await expect(day.getByRole("region").first()).toHaveAccessibleName(
    "合入 PR #130",
  );
  const expand = batch.getByRole("button", { name: "展开其余 2 项" });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(batch.getByRole("button", { name: "收起" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(batch.getByRole("link", { name: /^打开 / })).toHaveCount(5);
  const target = page.getByRole("link", {
    name: "打开 优化归档时间线",
    exact: true,
  });
  // This is the fifth member in creation-descending order, initially folded.
  await target.click();
  await expect(page.getByText("已合入", { exact: true }).first()).toBeVisible();
  await backToChanges(page);
  await expect(target).toBeFocused();
  await expect(batch.getByRole("link", { name: /^打开 / })).toHaveCount(5);
  await batch.getByRole("button", { name: "收起" }).click();
  await expect(batch.getByRole("link", { name: /^打开 / })).toHaveCount(3);
  const filters = await openChangeFilters(page);
  await filters
    .getByRole("menuitemcheckbox", { name: "修复", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(day).toContainText("3 个 Change");
  await expect(batch.getByRole("link", { name: /^打开 / })).toHaveCount(2);
  await expect(
    batch.getByRole("button", { name: /展开其余|收起/ }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await page.goto(`/?${repositoryQuery}&m=changes&scope=archived`);
  await writeFile(
    "artifacts/archive-timeline-fixture.json",
    JSON.stringify(data),
  );
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => document.documentElement.setAttribute("data-theme", theme),
      theme,
    );
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(day).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: `artifacts/archive-timeline-${theme}-${width}.png`,
        fullPage: true,
      });
    }
  }
  await page.goto(
    `/?${repositoryQuery}&m=changes&states=${encodeURIComponent('["active","archived"]')}`,
  );
  await expect(
    page.getByRole("button", { name: "显示", exact: true }),
  ).toBeVisible();
  await expect(changeLinks(page)).toHaveCount(8);
  await expect(
    page.getByRole("region", { name: "2026年10月27日", exact: true }),
  ).toHaveCount(0);

  // Earlier expanded batches must retain their height when a later item returns.
  for (let i = 0; i < 12; i++) {
    const change = structuredClone(data.changes[5]);
    const record = primaryRecord(change)!;
    const id = `more-${i}`;
    change.id = change.primary = record.id = record.key = id;
    change.title = record.title = record.state!.title = `同日批次补充 ${i + 1}`;
    record.state!.id = id;
    data.changes.push(change);
    data.deliveryByChange![id] = data.deliveryByChange!["timeline-5"];
  }
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto(`/?${repositoryQuery}&m=changes&scope=archived&sort=urgency`);
  const earlier = page.getByRole("region", {
    name: "合入 PR #130",
    exact: true,
  });
  await earlier.getByRole("button", { name: "展开其余 10 项" }).click();
  await batch.getByRole("button", { name: "展开其余 2 项" }).click();
  await target.click();
  await backToChanges(page);
  await expect(earlier.getByRole("link", { name: /^打开 / })).toHaveCount(13);
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport();
  const links = changeLinks(page);
  const secondId = new URL(
    (await links.nth(1).getAttribute("href"))!,
    page.url(),
  ).searchParams.get("c");
  await links.first().click();
  await expect(
    page.getByRole("button", { name: "上一个 Change", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "下一个 Change", exact: true })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("c"))
    .toBe(secondId);
});
