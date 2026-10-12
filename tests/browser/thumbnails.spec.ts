import { test, expect, repositoryQuery } from "./connected";
const path = `/?${repositoryQuery}&m=prototypes`;

test("current cards show actual viewport screenshots and switch device consistently", async ({
  page,
}) => {
  await page.goto(path);
  const region = page.getByRole("region", { name: "项目原型总览" });
  const image = region.getByRole("img", {
    name: "订单列表的首屏截图",
    exact: true,
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(1440);
  expect(
    await image.evaluate((img: HTMLImageElement) => img.naturalHeight),
  ).toBe(900);
  await region
    .getByRole("combobox", { name: "筛选原型适配" })
    .selectOption("mobile");
  await region
    .getByRole("button", { name: "预览订单列表", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await region.getByRole("button", { name: "清除筛选" }).click();
  await region
    .getByRole("heading", { name: "价格卡片", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(region.locator(".prototype-thumbnail.ready")).toHaveCount(4);
  await region.locator(".prototype-gallery-scroll").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "artifacts/prototype-thumbnails-desktop.png" });
  await page.setViewportSize({ width: 320, height: 720 });
  await region.getByRole("button", { name: "组件 1", exact: true }).click();
  const component = region.getByRole("img", { name: "价格卡片的首屏截图" });
  await expect
    .poll(() => component.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(640);
  expect(
    await component.evaluate((img: HTMLImageElement) => img.naturalHeight),
  ).toBe(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/prototype-thumbnails-mobile.png" });
});

test("thumbnail loading and retry remain separate from the preview action", async ({
  page,
}) => {
  let failed = true;
  await page.route(
    "**/api/public-previews/*/component.jpg?*",
    async (route) => {
      if (failed)
        await route.fulfill({ status: 503, body: "temporarily unavailable" });
      else await route.continue();
    },
  );
  await page.goto(path + "&pkind=component");
  const region = page.getByRole("region", { name: "项目原型总览" });
  await expect(region.getByText("截图暂不可用", { exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: /^预览/ })).toBeEnabled();
  await region.getByRole("button", { name: /^预览/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(region.getByText("截图暂不可用", { exact: true })).toBeVisible();
  failed = false;
  await region.getByRole("button", { name: "重试截图" }).click();
  await expect(region.locator(".prototype-thumbnail.ready")).toHaveCount(1);
  await region.getByRole("button", { name: "预览价格卡片" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
});

test("public thumbnail endpoints preserve bytes and reject unknown resources", async ({
  request,
  personal,
}) => {
  const prepared = await request.post(personal.url("previews/prepare"), {
    headers: { origin: "http://127.0.0.1:10682" },
    data: {
      connectionId: personal.id,
      change: "document-reader",
      entry: "orders",
    },
  });
  expect(prepared.ok()).toBe(true);
  const { publication } = await prepared.json();
  const url = `/api/public-previews/${publication.id}/mobile.jpg`;
  const first = await request.get(url),
    second = await request.get(url);
  expect(first.headers()["cache-control"]).toContain("public");
  expect(first.headers()["content-type"]).toBe("image/jpeg");
  expect(await first.body()).toEqual(await second.body());
  expect((await request.head(url)).status()).toBe(200);
  const bad = await request.get(
    `/api/public-previews/${publication.id}/unlisted.jpg`,
  );
  expect(bad.status()).toBe(404);
  expect((await bad.json()).error.code).toBe("ASSET_NOT_FOUND");
});
