import {
  test,
  expect,
  repositoryQuery,
  changeLinks,
  changeRow,
  openChangeFilters,
  changeDisplay,
  openMaterial,
  backToChanges,
} from "./connected";
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

const titles = async (page: import("@playwright/test").Page) =>
  changeLinks(page).evaluateAll((items) =>
    items.map((item) => item.getAttribute("aria-label")!.slice(3)),
  );
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
  await page.goto(`/?${repositoryQuery}&m=changes&scope=active`);
  await expect
    .poll(() => titles(page))
    .toEqual(data.changes.map((g) => g.title));
  let menu = await openChangeFilters(page);
  await menu
    .getByRole("menuitemcheckbox", { name: "普通", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect.poll(() => titles(page)).toEqual(["历史记录", "体验调整"]);
  await changeLinks(page).first().click();
  await expect(page.getByRole("region", { name: "类型与紧急程度" })).toHaveText(
    "无类型标签普通",
  );
  await backToChanges(page);
  await expect(changeLinks(page).first()).toBeFocused();
  menu = await openChangeFilters(page);
  await menu
    .getByRole("menuitemcheckbox", { name: "普通", exact: true })
    .click();
  await menu
    .getByRole("menuitemcheckbox", { name: "无类型标签", exact: true })
    .click();
  await menu
    .getByRole("menuitemcheckbox", { name: "修复", exact: true })
    .click();
  await menu
    .getByRole("menuitemcheckbox", { name: special, exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => titles(page))
    .toEqual(["历史记录", "修复问题", "紧急修复", "数据迁移"]);
  expect(new URL(page.url()).searchParams.get("types")).toBe(
    JSON.stringify(["修复", special]),
  );
  await page.reload();
  await expect
    .poll(() => titles(page))
    .toEqual(["历史记录", "修复问题", "紧急修复", "数据迁移"]);
  menu = await openChangeFilters(page);
  await menu.getByRole("menuitemcheckbox", { name: "高", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => titles(page)).toEqual(["修复问题"]);
  await page.goBack();
  await expect.poll(() => titles(page)).toHaveLength(4);
  await page.goForward();
  await expect.poll(() => titles(page)).toEqual(["修复问题"]);
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  menu = await openChangeFilters(page);
  await menu
    .getByRole("menuitemcheckbox", { name: "none", exact: true })
    .click();
  await menu
    .getByRole("menuitemcheckbox", { name: "普通", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("没有符合条件的 Change", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "清除筛选", exact: true })
    .first()
    .click();
  await expect.poll(() => titles(page)).toHaveLength(5);
});
test("list and board share stable urgency order and task detail keeps its original order", async ({
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
    `/?${repositoryQuery}&m=changes&types=${encodeURIComponent('["修复"]')}&sort=urgency`,
  );
  await expect.poll(() => titles(page)).toEqual(["紧急修复", "修复问题"]);
  await changeDisplay(page, "看板");
  const board = page.getByRole("region", { name: "按阶段看板（只读）" });
  await expect
    .poll(() =>
      board
        .getByRole("link", { name: /^打开 / })
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("aria-label")),
        ),
    )
    .toEqual(["打开 紧急修复", "打开 修复问题"]);
  await board.getByRole("link", { name: "打开 紧急修复", exact: true }).click();
  await openMaterial(page, "任务");
  await expect(
    page
      .getByRole("list", { name: "实现任务", exact: true })
      .getByRole("heading"),
  ).toContainText(["紧急修复任务一", "紧急修复任务二"]);
  await backToChanges(page);
  await changeDisplay(page, "列表");
  await expect.poll(() => titles(page)).toEqual(["紧急修复", "修复问题"]);
  await expect(page.getByRole("button", { name: "依赖视图" })).toHaveCount(0);
});
test("free labels render as text and fit desktop and narrow layouts including the menu", async ({
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
  const row = changeRow(page, "紧急修复");
  await expect(row.getByText(htmlType, { exact: true })).toBeVisible();
  await expect(row.locator("img")).toHaveCount(0);
  for (const width of [1440, 834, 390, 320])
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await expect(row).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `/tmp/of-refactor-changes-${width}-${theme}.png`,
      });
    }
  const menu = await openChangeFilters(page);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: special, exact: true }),
  ).toBeVisible();
  expect(await menu.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "打开 紧急修复", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "类型与紧急程度" })
      .getByText(longType, { exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("region", { name: "阅读正文", exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
});
test("invalid filters preserve deep links and absent selected names remain removable", async ({
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
      .getByRole("main")
      .getByRole("heading", { name: "历史记录", exact: true }),
  ).toBeVisible();
  await page.goto(
    `/?${repositoryQuery}&m=changes&types=${encodeURIComponent('["当前无匹配"]')}`,
  );
  await expect(
    page.getByText("没有符合条件的 Change", { exact: true }),
  ).toBeVisible();
  const menu = await openChangeFilters(page);
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "当前无匹配", exact: true }),
  ).toBeChecked();
  await menu
    .getByRole("menuitemcheckbox", { name: "当前无匹配", exact: true })
    .click();
  await expect(
    menu.getByRole("menuitemcheckbox", { name: "当前无匹配", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(changeLinks(page)).toHaveCount(5);
});
