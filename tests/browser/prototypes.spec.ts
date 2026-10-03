import { test, expect } from "@playwright/test";
const path = "/?project=fixture&m=prototypes";
const inventory = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "项目原型总览" });

test("project prototypes have their own module, unique totals and selectable Change versions", async ({
  page,
  request,
}) => {
  const response = await request.get("/api/projects/fixture/prototypes");
  expect(response.ok()).toBe(true);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const catalog = await response.json();
  expect(catalog.items).toHaveLength(4);
  expect(
    catalog.items.find((i: { path: string }) => i.path.endsWith("/orders"))
      .references,
  ).toHaveLength(2);
  await page.goto("/?project=fixture&m=changes");
  await page.getByRole("link", { name: "原型", exact: true }).click();
  const region = inventory(page);
  await expect(
    region.getByRole("heading", { level: 1, name: "原型 4" }),
  ).toBeVisible();
  await expect(
    region.getByRole("list", { name: "项目原型列表" }).locator(":scope > li"),
  ).toHaveCount(4);
  await expect(region.locator(".prototype-totals")).toContainText(
    "页面3组件1关联 Change2",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/prototype-catalog-desktop.png" });
  const card = region.getByRole("listitem").filter({
    has: page.getByRole("heading", { name: "订单列表", exact: true }),
  });
  await expect(card.getByRole("combobox")).toHaveCount(0);
  await expect(card.locator(".prototype-path")).toHaveCount(0);
  const infoTrigger = card.getByRole("button", { name: "订单列表的原型信息" });
  await infoTrigger.focus();
  await page.keyboard.press("Enter");
  const info = page.getByRole("dialog", { name: /的原型信息$/ });
  await expect(info.getByText("关联版本 · 2 个 Change")).toBeVisible();
  await info.getByRole("combobox").selectOption("mobile-reading/mobile-orders");
  await page.keyboard.press("Escape");
  await expect(info).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "订单列表 · 手机适配的原型信息" }),
  ).toBeFocused();
  await region
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", {
        name: "订单列表 · 手机适配",
        exact: true,
      }),
    })
    .getByRole("button", { name: /^打开预览：/ })
    .click();
  await expect(
    page.locator('iframe[title="原型：订单列表 · 手机适配"]'),
  ).toHaveAttribute("width", "390");
  await expect(
    page.frameLocator("iframe").getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await expect(page).toHaveURL(/m=prototypes/);
  await expect(region.getByRole("heading", { level: 1 })).toBeVisible();
});

test("catalog filters, matching versions, fixed links and browser history preserve preview context", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(path);
  const region = inventory(page);
  await region
    .getByRole("combobox", { name: "筛选原型适配" })
    .selectOption("custom");
  await expect(region.getByRole("listitem")).toHaveCount(1);
  await expect(
    region.getByRole("heading", { name: "价格卡片", exact: true }),
  ).toBeVisible();
  await region.getByRole("button", { name: "清除筛选" }).click();
  await region.getByRole("textbox", { name: "筛选原型" }).fill("手机适配");
  await region
    .getByRole("combobox", { name: "筛选原型适配" })
    .selectOption("mobile");
  await expect(region.getByRole("listitem")).toHaveCount(1);
  await region.getByRole("button", { name: /^打开预览：/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("button", { name: "复制固定版本链接" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.get("m")).toBe("prototypes");
  expect(new URL(link).searchParams.get("revision")).toMatch(/^[0-9a-f]{40}$/);
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await expect(region.getByRole("textbox", { name: "筛选原型" })).toHaveValue(
    "手机适配",
  );
  await page.goBack();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await region.getByRole("textbox", { name: "筛选原型" }).fill("无匹配词");
  await expect(
    region.getByRole("heading", { name: "没有匹配的原型" }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", { level: 1, name: "原型 4" }),
  ).toBeVisible();
});

test("mobile catalog and source navigation keep a component at its declared size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(path + "&pkind=component");
  const region = inventory(page);
  await expect(
    region.getByRole("heading", { name: "价格卡片", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/prototype-catalog-mobile.png" });
  await region.getByRole("button", { name: /^打开预览：/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.getByRole("button", { name: "关闭变更详情" }).click();
  await region.getByRole("button", { name: "价格卡片的原型信息" }).click();
  const info = page.getByRole("dialog", { name: "价格卡片的原型信息" });
  await expect(
    info.getByText("640 × 320 · 自定义", { exact: true }),
  ).toBeVisible();
  const bounds = await info.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await info.getByRole("button", { name: "查看 Change" }).click();
  await expect(page).toHaveURL(/m=changes/);
  await expect(
    page.getByRole("tab", { name: "概览", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});

test("catalog distinguishes disabled tracking, association issues, empty projects and project changes", async ({
  page,
  request,
}) => {
  const catalog = await (
    await request.get("/api/projects/fixture/prototypes")
  ).json();
  await page.route("**/api/projects/fixture/prototypes?*", (route) =>
    route.fulfill({
      json: {
        ...catalog,
        policy: {
          ...catalog.policy,
          status: "disabled",
          message: "项目已停用原型追踪。",
        },
        issues: [
          {
            changeId: "document-reader",
            changeTitle: "需检查的关联",
            message: "一项关联有误",
          },
        ],
      },
    }),
  );
  await page.goto(path);
  await expect(
    inventory(page).getByText("原型追踪未启用", { exact: true }),
  ).toBeVisible();
  await expect(
    inventory(page).getByRole("heading", { level: 1, name: "原型 4" }),
  ).toBeVisible();
  await expect(
    inventory(page)
      .getByRole("button", { name: /^预览未启用：/ })
      .first(),
  ).toBeDisabled();
  await expect(page.locator("iframe")).toHaveCount(0);
  await inventory(page)
    .getByText("1 个 Change 的原型关联需检查", { exact: true })
    .click();
  await expect(inventory(page).getByText("一项关联有误")).toBeVisible();
  const workbench = await (
    await request.get("/api/projects/fixture/workbench")
  ).json();
  await page.route("**/api/projects", async (route) =>
    route.fulfill({
      json: {
        projects: [
          { id: "fixture", name: "测试项目" },
          { id: "second", name: "空项目" },
        ],
      },
    }),
  );
  await page.route("**/api/projects/second/workbench*", (route) =>
    route.fulfill({
      json: {
        ...workbench,
        projectId: "second",
        projectName: "空项目",
        changes: [],
      },
    }),
  );
  await page.route("**/api/projects/second/prototypes?*", (route) =>
    route.fulfill({ json: { ...catalog, items: [], issues: [] } }),
  );
  await page.goto(
    path +
      "&pq=订单&pkind=page&pdevice=mobile&preview=obsolete&revision=" +
      "0".repeat(40),
  );
  await page.getByRole("combobox", { name: "当前项目" }).selectOption("second");
  await expect(page).not.toHaveURL(/pq=|pkind=|pdevice=|preview=|revision=/);
  await expect(
    inventory(page).getByRole("heading", { name: "项目还没有关联原型" }),
  ).toBeVisible();
  await expect(
    inventory(page).getByRole("heading", { level: 1, name: "原型 0" }),
  ).toBeVisible();
});

test("catalog API enforces project, snapshot and same-origin access boundaries", async ({
  request,
}) => {
  expect((await request.get("/api/projects/missing/prototypes")).status()).toBe(
    404,
  );
  expect(
    (
      await request.get(
        "/api/projects/fixture/prototypes?snapshot=../../private",
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get(
        "/api/projects/fixture/prototypes?snapshot=00000000-0000-4000-8000-000000000000",
      )
    ).status(),
  ).toBe(410);
  expect(
    (
      await request.get("/api/projects/fixture/prototypes", {
        headers: { origin: "null" },
      })
    ).status(),
  ).toBe(403);
});

test("association-only failures show a source problem instead of an empty project", async ({
  page,
  request,
}) => {
  const catalog = await (
    await request.get("/api/projects/fixture/prototypes")
  ).json();
  await page.route("**/api/projects/fixture/prototypes?*", (route) =>
    route.fulfill({
      json: {
        ...catalog,
        items: [],
        issues: [
          {
            changeId: "document-reader",
            changeTitle: "来源待核对的 Change",
            message: "无法确定 Change 主来源，请先核对来源记录。",
          },
        ],
      },
    }),
  );
  await page.goto(path);
  const region = inventory(page);
  await expect(
    region.getByRole("heading", { name: "暂时没有可统计的原型" }),
  ).toBeVisible();
  await expect(
    region.getByRole("heading", { name: "项目还没有关联原型" }),
  ).toHaveCount(0);
  await region
    .getByText("1 个 Change 的原型关联需检查", { exact: true })
    .click();
  await expect(
    region.getByText("无法确定 Change 主来源", { exact: false }),
  ).toBeVisible();
  await region.getByRole("button", { name: "来源待核对的 Change" }).click();
  await expect(page).toHaveURL(/m=changes/);
  await expect(page).toHaveURL(/c=document-reader/);
  await expect(page.getByRole("dialog")).toBeVisible();
});
