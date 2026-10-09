import { test, expect } from "@playwright/test";
const path = "/?project=fixture&m=prototypes";

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
  await page.getByRole("button", { name: "关闭页面预览" }).click();
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
    "**/api/projects/fixture/current-thumbnails/card?*",
    async (route) => {
      if (failed)
        await route.fulfill({ status: 503, body: "temporarily unavailable" });
      else await route.continue();
    },
  );
  await page.goto(path + "&pkind=component");
  const region = page.getByRole("region", { name: "项目原型总览" });
  await expect(region.getByText("截图暂不可用", { exact: true })).toBeVisible();
  await expect(
    region.getByRole("button", { name: /^打开预览：/ }),
  ).toBeEnabled();
  await region.getByRole("button", { name: /^打开预览：/ }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.getByRole("button", { name: "关闭页面预览" }).click();
  failed = false;
  await region.getByRole("button", { name: "重试截图" }).click();
  await expect(region.locator(".prototype-thumbnail.ready")).toHaveCount(1);
  await region.getByRole("button", { name: "预览价格卡片" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
});

test("thumbnail endpoint returns private validators and rejects unsupported inputs and origins", async ({
  request,
}) => {
  const url =
    "/api/projects/fixture/thumbnails/document-reader/orders?device=mobile";
  const first = await request.get(url);
  expect(first.ok()).toBe(true);
  expect(first.headers()["content-type"]).toBe("image/jpeg");
  expect(first.headers()["cache-control"]).toContain("private, no-cache");
  expect((await first.body()).subarray(0, 2)).toEqual(
    Buffer.from([0xff, 0xd8]),
  );
  const etag = first.headers().etag;
  const repeated = await request.get(url);
  expect(repeated.headers()["x-openfolio-thumbnail-cache"]).toBe("hit");
  expect(
    (await request.get(url, { headers: { "if-none-match": etag } })).status(),
  ).toBe(304);
  expect(
    (await request.get(url, { headers: { origin: "null" } })).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        "/api/projects/missing/thumbnails/document-reader/orders",
      )
    ).status(),
  ).toBe(404);
  expect((await request.get(url.replace("mobile", "desktop"))).status()).toBe(
    400,
  );
  expect((await request.get(url + "&snapshot=../outside")).status()).toBe(400);
  expect(
    (await request.get(url.replace("/orders?", "/missing?"))).status(),
  ).toBe(404);
});

test("current thumbnail failures use the public JSON error contract", async ({
  request,
}) => {
  for (const [path, status, code] of [
    ["orders?device=desktop", 400, "INVALID_PARAMETER"],
    ["orders?revision=not-a-commit", 400, "INVALID_PARAMETER"],
    ["absent", 404, "THUMBNAIL_UNAVAILABLE"],
  ] as const) {
    const response = await request.get(
      `/api/projects/fixture/current-thumbnails/${path}`,
    );
    expect(response.status()).toBe(status);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect((await response.json()).error.code).toBe(code);
  }
});
