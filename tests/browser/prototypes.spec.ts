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
  await region.getByRole("button", { name: "打开预览：订单列表" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "订单列表原型",
  );
  await page.getByRole("button", { name: "复制固定版本链接" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.has("c")).toBe(false);
  expect(new URL(link).searchParams.get("prototype")).toBe("orders");
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("button", { name: "关闭页面预览" }).click();
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
  await page.getByRole("button", { name: "打开预览：托管 React" }).click();
  await expect(
    page.frameLocator('iframe[title="原型：托管 React"]').getByRole("heading"),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭页面预览" }).click();
  await page.getByRole("button", { name: "打开预览：待导出页面" }).click();
  await expect(
    page.getByText("此页面尚未登记已发布产物。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭页面预览" }).click();
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
  await page.getByRole("button", { name: "打开预览：价格卡片" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "打开预览：价格卡片" }),
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
