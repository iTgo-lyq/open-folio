import { test, expect } from "@playwright/test";
const path = "/?project=fixture&m=prototypes";
test("main gallery opens current pages directly without Change/version selectors", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const catalog = await (
    await request.get("/api/projects/fixture/prototypes")
  ).json();
  expect(catalog.items).toHaveLength(5);
  expect(catalog.items[0].references).toBeUndefined();
  await page.goto(path);
  const region = page.getByRole("region", { name: "项目原型总览" });
  await expect(region.getByRole("heading", { level: 1 })).toHaveText(
    "项目里的页面 5",
  );
  await expect(
    page.getByRole("combobox", { name: "Specs 来源分支" }),
  ).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await region.getByRole("textbox", { name: "筛选原型" }).fill("批量操作");
  await region
    .getByRole("combobox", { name: "筛选原型适配" })
    .selectOption("mobile");
  await expect(region.getByRole("listitem")).toHaveCount(1);
  await region.getByRole("button", { name: "预览订单列表" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".module-rail")).toHaveCount(0);
  await expect(page.locator(".workspace-source")).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "原型目录" }),
  ).toBeVisible();
  await expect(
    page.locator(".preview-provenance, .preview-footnote"),
  ).toHaveCount(0);
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "订单列表原型",
  );
  await page.getByRole("button", { name: "复制预览链接" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.has("c")).toBe(false);
  expect(new URL(link).searchParams.get("prototype")).toBe("orders");
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(region.getByRole("textbox", { name: "筛选原型" })).toHaveValue(
    "批量操作",
  );
  await page.goBack();
  await expect(page.locator("iframe")).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("current gallery has responsive cards, missing artifact placeholders and hosted page entry", async ({
  page,
}) => {
  await page.goto(path);
  await page.getByRole("button", { name: "预览托管 React" }).click();
  await expect(
    page.frameLocator('iframe[title="原型：托管 React"]').getByRole("heading"),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await page.getByRole("button", { name: "预览待导出页面" }).click();
  await expect(
    page.getByText("此页面尚未登记已发布产物。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(page.locator(".prototype-thumbnail.ready")).toHaveCount(4);
  await page.locator(".prototype-gallery-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "artifacts/prototype-catalog-desktop.png" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "组件 1", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "价格卡片", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".prototype-thumbnail.ready")).toHaveCount(1);
  await page.locator(".prototype-gallery-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "artifacts/prototype-catalog-mobile.png" });
  await page.getByRole("button", { name: "预览价格卡片" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(
    page.getByRole("button", { name: "预览价格卡片", exact: true }),
  ).toBeFocused();
});
test("missing manifest and invalid entries remain explicit, separate from filtering", async ({
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
        message: "main 尚未登记 prototype.json",
        issues: ["第 1 项格式不合法"],
      },
    }),
  );
  await page.goto(path);
  await expect(
    page.getByText("main 尚未登记 prototype.json", { exact: true }),
  ).toBeVisible();
  await page.getByText("1 项清单内容需检查", { exact: true }).click();
  await expect(
    page.getByText("第 1 项格式不合法", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "暂无当前页面" }),
  ).toBeVisible();
});
test("catalog API reads configured projects and enforces snapshot boundaries", async ({
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
  ).toBe(200);
});

test("focused viewer keeps directory, viewport controls and history in the workbench", async ({
  page,
}) => {
  await page.goto(path + "&prototype=orders&preview=orders");
  const panel = page.getByRole("region", { name: "当前页面预览" });
  await expect(panel.locator("iframe")).toHaveAttribute("width", "1440");
  await panel.getByRole("button", { name: "iPad", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "834");
  await panel.getByRole("button", { name: "移动设备", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "390");
  await panel.getByRole("button", { name: "100%", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await panel
    .getByRole("button", { name: "订单详情 页面", exact: true })
    .click();
  await expect(page).toHaveURL(/prototype=detail/);
  await expect(panel.locator("iframe")).toHaveAttribute(
    "title",
    "原型：订单详情",
  );
  await expect(
    panel.getByRole("button", { name: "移动设备", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(panel.locator("iframe")).toHaveAttribute(
    "title",
    "原型：订单列表",
  );
  await page.reload();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "390");
  await panel.getByRole("button", { name: "适应画布", exact: true }).click();
  await page.screenshot({ path: "artifacts/prototype-viewer-desktop.png" });
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(
    page.getByRole("complementary", { name: "原型目录" }),
  ).toBeHidden();
  await panel.getByRole("button", { name: "切换原型目录" }).click();
  await expect(
    page.getByRole("complementary", { name: "原型目录" }),
  ).toBeVisible();
  await panel
    .getByRole("button", { name: "价格卡片 组件", exact: true })
    .click();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "640");
  await expect(
    page.getByRole("complementary", { name: "原型目录" }),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.frameLocator("iframe").getByRole("heading")).toBeVisible();
  await page.screenshot({ path: "artifacts/prototype-viewer-mobile.png" });
  await page
    .getByRole("combobox", { name: "跳转工作台模块" })
    .selectOption("specs");
  await expect(
    page.getByRole("combobox", { name: "Specs 来源分支" }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("prototype")).toBe(false);
});

test("card captions open details and full-size images while covers enter the canvas", async ({
  page,
  request,
}) => {
  const catalog = await (
    await request.get("/api/projects/fixture/prototypes")
  ).json();
  const entry = catalog.items.find(
    (item: { id: string }) => item.id === "orders",
  );
  await page.goto(path);
  const tile = page.locator('[data-prototype-id="orders"]');
  const coverWidth = (await tile.locator(".prototype-thumbnail").boundingBox())!
    .width;
  const description = (await tile
    .locator(".prototype-description")
    .boundingBox())!;
  await page.mouse.click(
    description.x + description.width / 2,
    description.y + description.height / 2,
  );
  const details = page.getByRole("dialog");
  await expect(
    details.getByRole("heading", { name: "订单列表", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page).toHaveURL(/pdetail=orders/);
  const image = details.getByRole("img", { name: "订单列表的大图" });
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1440);
  expect((await image.boundingBox())!.width).toBeGreaterThan(coverWidth * 1.5);
  await expect(
    details
      .locator(".prototype-detail-source > div")
      .filter({ hasText: "源码提交" })
      .locator("dd"),
  ).toHaveText(entry.artifact.sourceCommit);
  await expect(
    details
      .locator(".prototype-detail-source > div")
      .filter({ hasText: "main 清单提交" })
      .locator("dd"),
  ).toHaveText(catalog.revision);
  await page.screenshot({ path: "artifacts/prototype-details-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(
    tile.getByRole("button", { name: "查看原型详情：订单列表" }),
  ).toBeFocused();
  // The title's native button covers the complete caption, including its padding.
  await tile
    .locator(".prototype-tile-body")
    .click({ position: { x: 5, y: 5 } });
  await expect(details).toBeVisible();
  await details
    .getByRole("combobox", { name: "详情截图设备" })
    .selectOption("mobile");
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(390);
  await details.getByRole("button", { name: "进入预览" }).click();
  await expect(details).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(
    page.getByRole("heading", { name: "订单列表", exact: true }),
  ).toBeFocused();
  await expect(
    page.locator(
      ".prototype-detail-source, .workspace-source, .preview-provenance",
    ),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await tile.getByRole("button", { name: "预览订单列表", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "1440");
  await expect(details).toHaveCount(0);
});

test("detail links handle reload, missing entries, image errors and narrow layouts", async ({
  page,
}) => {
  let fail = true;
  await page.route(
    "**/api/projects/fixture/current-thumbnails/card?*",
    (route) =>
      fail
        ? route.fulfill({ status: 503, body: "unavailable" })
        : route.continue(),
  );
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(path + "&pdetail=card");
  const details = page.getByRole("dialog");
  await expect(
    details.getByText("截图暂不可用", { exact: true }),
  ).toBeVisible();
  fail = false;
  await details.getByRole("button", { name: "重试截图" }).click();
  await expect(details.locator(".prototype-detail-image.ready")).toBeVisible();
  await page.reload();
  await expect(
    details.getByRole("heading", { name: "价格卡片" }),
  ).toBeVisible();
  await expect(details.locator(".prototype-detail-image.ready")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/prototype-details-mobile.png" });
  await details.getByRole("button", { name: "关闭原型详情" }).click();
  await expect(details).toHaveCount(0);
  await expect(page.locator(".prototype-gallery-heading h1")).toBeFocused();
  await page.goBack();
  await expect(details).toBeVisible();
  await page.goto(path + "&pdetail=removed");
  await expect(
    details.getByRole("heading", { name: "未找到此原型" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "关闭原型详情" }).click();
  await page.getByRole("button", { name: "查看原型详情：待导出页面" }).click();
  await expect(
    details.getByText("尚未提供截图", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("尚未发布产物", { exact: true }),
  ).toBeVisible();
});

test("returning from the viewer preserves expanded cards, scroll and focus", async ({
  page,
  request,
}) => {
  const catalog = await (
    await request.get("/api/projects/fixture/prototypes")
  ).json();
  const orders = catalog.items.find(
    (item: { id: string }) => item.id === "orders",
  );
  await page.route("**/api/projects/fixture/prototypes?*", (route) =>
    route.fulfill({
      json: {
        ...catalog,
        items: [
          ...Array.from({ length: 29 }, (_, index) => ({
            ...orders,
            id: `placeholder-${index}`,
            title: `示例页面 ${index + 1}`,
            artifact: undefined,
          })),
          orders,
        ],
      },
    }),
  );
  await page.goto(path);
  const cards = page
    .getByRole("list", { name: "项目原型列表" })
    .getByRole("listitem");
  await expect(cards).toHaveCount(24);
  await page.getByRole("button", { name: /^显示更多原型/ }).click();
  await expect(cards).toHaveCount(30);
  const cover = page.getByRole("button", { name: "预览订单列表", exact: true });
  await cover.scrollIntoViewIfNeeded();
  const scroll = page.locator(".prototype-gallery-scroll");
  const position = await scroll.evaluate((node) => node.scrollTop);
  expect(position).toBeGreaterThan(500);
  await cover.click();
  await expect(page.locator("iframe")).toBeVisible();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(cards).toHaveCount(30);
  await expect(cover).toBeFocused();
  await expect
    .poll(() => scroll.evaluate((node) => node.scrollTop))
    .toBeCloseTo(position, 0);
  // A refresh must wait for the asynchronous catalog before restoring scroll.
  await page.reload();
  await expect(cards).toHaveCount(30);
  await expect
    .poll(() => scroll.evaluate((node) => node.scrollTop))
    .toBeCloseTo(position, 0);
  await cover.click();
  await page.reload();
  await expect(page.locator("iframe")).toBeVisible();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(cards).toHaveCount(30);
  await expect(cover).toBeFocused();
  await expect
    .poll(() => scroll.evaluate((node) => node.scrollTop))
    .toBeCloseTo(position, 0);
});
