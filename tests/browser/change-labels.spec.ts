import { test, expect, repositoryQuery } from "./connected";
import {
  primaryRecord,
  type Snapshot,
  type ChangeState,
} from "../../src/lib/model";

const special = '数据, "迁移"';
const longType = "自定义".repeat(45);
const htmlType = "<img src=x onerror=alert(1)>";

function labeled(data: Snapshot) {
  const original = data.changes.find((g) => g.id === "document-reader")!;
  const labels: Partial<ChangeState>[] = [
    {},
    { types: ["体验"], urgency: "normal" },
    { types: ["修复", "none"], urgency: "high" },
    { types: ["修复", special, longType, htmlType], urgency: "urgent" },
    { types: [special], urgency: "low" },
  ];
  data.changes = labels.map((labels, i) => {
    const group = structuredClone(original);
    group.id = group.primary = `labeled-${i}`;
    group.title = ["历史记录", "体验调整", "修复问题", "紧急修复", "数据迁移"][
      i
    ];
    group.diagnostics = [];
    group.relations = [];
    const record = primaryRecord(original)!;
    group.candidates = [
      {
        ...structuredClone(record),
        key: group.primary,
        id: group.id,
        title: group.title,
        diagnostics: [],
        state: {
          ...record.state!,
          id: group.id,
          title: group.title,
          tasks: {
            T1: { title: `${group.title}任务一`, status: "todo" },
            T2: { title: `${group.title}任务二`, status: "todo" },
          },
          ...labels,
        },
      },
    ];
    return group;
  });
  return data;
}

test("labels filter with OR and AND, preserve URL navigation and default to normal", async ({
  page,
  request,
  personal,
}) => {
  const data = labeled(
    await (await request.get(personal.url("workbench"))).json(),
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes`);
  const rows = page.locator(".change-row");
  const titles = rows.locator(".change-row-title strong");
  await expect(titles).toHaveText(data.changes.map((g) => g.title));
  await expect(rows.nth(0).locator(".change-labels")).toHaveCount(0);
  await expect(rows.nth(1).locator(".change-urgency")).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "筛选紧急程度" })
    .selectOption("normal");
  await expect(titles).toHaveText(["历史记录", "体验调整"]);
  await rows.first().click();
  await expect(page.getByRole("region", { name: "类型与紧急程度" })).toHaveText(
    "类型与紧急程度无类型标签普通",
  );
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await expect(rows.first()).toBeFocused();
  await page.getByRole("combobox", { name: "筛选紧急程度" }).selectOption("");

  const trigger = page.getByRole("button", { name: "筛选类型" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "无类型标签", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await page.getByRole("checkbox", { name: "修复", exact: true }).check();
  await page.getByRole("checkbox", { name: special, exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAccessibleName("筛选类型，已选 3 项");
  await expect(titles).toHaveText([
    "历史记录",
    "修复问题",
    "紧急修复",
    "数据迁移",
  ]);
  expect(new URL(page.url()).searchParams.get("types")).toBe(
    JSON.stringify(["修复", special]),
  );
  await page.reload();
  await expect(titles).toHaveText([
    "历史记录",
    "修复问题",
    "紧急修复",
    "数据迁移",
  ]);
  await page
    .getByRole("combobox", { name: "筛选紧急程度" })
    .selectOption("high");
  await expect(titles).toHaveText(["修复问题"]);
  await page.goBack();
  await expect(titles).toHaveCount(4);
  await page.goForward();
  await expect(titles).toHaveText(["修复问题"]);
  await rows.first().click();
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await expect(rows.first()).toBeFocused();
  await expect(page).toHaveURL(/urgency=high/);
  await page
    .getByRole("combobox", { name: "筛选紧急程度" })
    .selectOption("normal");
  await expect(titles).toHaveText(["历史记录"]);
  await trigger.click();
  await page.getByRole("button", { name: "清除类型", exact: true }).click();
  await page.getByRole("checkbox", { name: "none", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("没有符合条件的记录", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "变更排序" })
    .selectOption("urgency");
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page).not.toHaveURL(/types=|noTypes=|urgency=/);
  await expect(page).toHaveURL(/sort=urgency/);
  await expect(titles).toHaveText([
    "紧急修复",
    "修复问题",
    "历史记录",
    "体验调整",
    "数据迁移",
  ]);
});

test("all views share filtered stable urgency order without reordering tasks", async ({
  page,
  request,
  personal,
}) => {
  const data = labeled(
    await (await request.get(personal.url("workbench"))).json(),
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  const types = encodeURIComponent(JSON.stringify(["修复"]));
  await page.goto(`/?${repositoryQuery}&m=changes&types=${types}&sort=urgency`);
  await expect(page.locator(".change-row-title strong")).toHaveText([
    "紧急修复",
    "修复问题",
  ]);
  await page.getByRole("button", { name: "看板视图" }).click();
  await expect(page.locator(".change-card > strong")).toHaveText([
    "紧急修复",
    "修复问题",
  ]);
  await expect(
    page.locator(".change-card").first().getByLabel("紧急程度：紧急"),
  ).toBeVisible();
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await page.getByRole("button", { name: "列表视图" }).click();
  await expect(page.locator(".task-title strong")).toHaveText([
    "紧急修复任务一",
    "紧急修复任务二",
    "修复问题任务一",
    "修复问题任务二",
  ]);
  await page.getByRole("button", { name: "变更", exact: true }).click();
  await page.getByRole("button", { name: "依赖视图" }).click();
  await expect(page.locator(".dependency-source strong")).toHaveText([
    "紧急修复",
    "修复问题",
  ]);
});

test("free labels render as text and fit desktop and narrow layouts including the popover", async ({
  page,
  request,
  personal,
}) => {
  const data = labeled(
    await (await request.get(personal.url("workbench"))).json(),
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&sort=urgency`);
  const urgent = page.getByRole("button", {
    name: "打开 紧急修复",
    exact: true,
  });
  await expect(urgent.getByText(htmlType, { exact: true })).toBeVisible();
  await expect(urgent.locator("img")).toHaveCount(0);
  await page.screenshot({
    path: "artifacts/change-labels-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(urgent).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await urgent.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "筛选类型" }).click();
  const popover = page.getByRole("dialog", { name: "类型筛选" });
  await expect(
    popover.getByRole("checkbox", { name: special, exact: true }),
  ).toBeVisible();
  expect(await popover.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const bounds = await popover.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: "artifacts/change-labels-mobile-filter.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await urgent.click();
  const section = page.getByRole("region", { name: "类型与紧急程度" });
  await expect(section.getByText(longType, { exact: true })).toBeVisible();
  expect(
    await page
      .locator(".drawer-body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/change-labels-mobile-detail.png",
    fullPage: true,
  });
});

test("invalid label queries normalize without losing deep links and absent selected names stay removable", async ({
  page,
  request,
  personal,
}) => {
  const data = labeled(
    await (await request.get(personal.url("workbench"))).json(),
  );
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(
    `/?${repositoryQuery}&m=changes&types=broken&noTypes=yes&urgency=none&sort=bad&c=labeled-0`,
  );
  await expect(page).not.toHaveURL(/types=|noTypes=|urgency=|sort=/);
  await expect(page).toHaveURL(/c=labeled-0/);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "历史记录", exact: true }),
  ).toBeVisible();
  const missing = "当前无匹配";
  await page.goto(
    `/?${repositoryQuery}&m=changes&types=${encodeURIComponent(JSON.stringify([missing]))}`,
  );
  await expect(
    page.getByText("没有符合条件的记录", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "筛选类型" }).click();
  await expect(
    page.getByRole("checkbox", { name: missing, exact: true }),
  ).toBeChecked();
  // This URL-only choice disappears as soon as it is deselected.
  await page.getByRole("checkbox", { name: missing, exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: missing, exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".change-row")).toHaveCount(5);
});
