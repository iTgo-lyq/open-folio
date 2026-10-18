import { test, expect, repositoryQuery, repoKey } from "./connected";
const path = `/?${repositoryQuery}&m=prototypes`;
test("published hosted cards load the registered screenshot for every declared device", async ({
  page,
  request,
  personal,
}) => {
  const catalog = await (await request.get(personal.url("prototypes"))).json();
  const entry = catalog.items.find(
    (item: { id: string }) => item.id === "hosted",
  );
  const widths: Record<string, number> = {
    "pc-web": 1440,
    ipad: 834,
    mobile: 390,
  };
  await page.goto(path);
  const tile = page.locator('[data-prototype-id="hosted"]');
  for (const device of entry.devices) {
    expect(
      entry.artifact.thumbnails.some(
        (item: { device: string }) => item.device === device,
      ),
    ).toBe(true);
    await page
      .getByRole("combobox", { name: "筛选原型适配" })
      .selectOption(device);
    await tile.scrollIntoViewIfNeeded();
    const screenshot = tile.getByRole("img", { name: "托管 React的首屏截图" });
    await expect(screenshot).toBeVisible();
    await expect
      .poll(() =>
        screenshot.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth,
        ),
      )
      .toBe(widths[device]);
    await expect(tile.locator(".prototype-thumbnail.ready")).toBeVisible();
    await expect(tile.getByText(/尚未提供截图|截图暂不可用/)).toHaveCount(0);
  }
  await tile
    .getByRole("button", { name: "预览托管 React", exact: true })
    .click();
  await expect(
    page.frameLocator('iframe[title="原型：托管 React"]').getByRole("heading"),
  ).toBeVisible();
});

test("navigation hints stay above the prototype gallery", async ({ page }) => {
  await page.goto(path);
  await expect(page.locator(".prototype-thumbnail.ready")).toHaveCount(4);
  const link = page
    .getByRole("navigation", { name: "模块导航" })
    .getByRole("link", { name: "Changes", exact: true });
  const hint = link.locator("span");
  const aboveContent = () =>
    hint.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const previous = el.style.pointerEvents;
      el.style.pointerEvents = "auto";
      const top = document.elementFromPoint(
        box.right - 2,
        box.y + box.height / 2,
      );
      el.style.pointerEvents = previous;
      return el === top;
    });
  await link.hover();
  await expect(hint).toHaveCSS("opacity", "1");
  expect(await aboveContent()).toBe(true);
  await page.mouse.move(500, 100);
  await link.focus();
  await expect(hint).toHaveCSS("opacity", "1");
  expect(await aboveContent()).toBe(true);
});
test("main gallery opens current pages directly without Change/version selectors", async ({
  page,
  context,
  request,
  personal,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const catalog = await (await request.get(personal.url("prototypes"))).json();
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
  await region
    .getByRole("combobox", { name: "筛选原型适配" })
    .selectOption("mobile");
  await expect(region.getByRole("listitem")).toHaveCount(3);
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
  expect(new URL(link).pathname).toMatch(/^\/preview\/[a-f0-9]{64}$/);
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.goBack();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(
    region.getByRole("combobox", { name: "筛选原型适配" }),
  ).toHaveValue("mobile");
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
  personal,
}) => {
  const catalog = await (await request.get(personal.url("prototypes"))).json();
  await page.route("**/api/repositories/*/prototypes?*", (route) =>
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
  personal,
}) => {
  expect(
    (
      await request.get(personal.url("prototypes").replace(repoKey, "missing"))
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(personal.url("prototypes?snapshot=../../private"))
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get(
        personal.url(
          "prototypes?snapshot=00000000-0000-4000-8000-000000000000",
        ),
      )
    ).status(),
  ).toBe(410);
  expect(
    (
      await request.get(personal.url("prototypes"), {
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
  const expectAlignedDirectory = async () => {
    const rows = await panel.locator(".preview-entry").evaluateAll((entries) =>
      entries.map((entry) => ({
        icon: entry.querySelector("svg")!.getBoundingClientRect().left,
        title: entry.querySelector("span")!.getBoundingClientRect().left,
        fits: entry.scrollWidth <= entry.clientWidth,
      })),
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(Math.abs(row.icon - rows[0].icon)).toBeLessThan(1);
      expect(Math.abs(row.title - rows[0].title)).toBeLessThan(1);
      expect(row.fits).toBe(true);
    }
  };
  await expectAlignedDirectory();
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
  await expectAlignedDirectory();
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
  ).toHaveCount(0);
  await expect(page.locator(".header-source-details")).toContainText(
    "develop · 预发布",
  );
  expect(new URL(page.url()).searchParams.has("prototype")).toBe(false);
});

test("loaded hosted pages need no ready bridge and explicit errors survive page load", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    if (!location.href.startsWith("https://127.0.0.1:10686/")) return;
    window.addEventListener(
      "message",
      (event) => {
        if (event.data?.type !== "openfolio:preview:init") return;
        event.stopImmediatePropagation();
        document.documentElement.dataset.previewRequest = event.data.requestId;
      },
      true,
    );
  });
  await page.goto(path + "&prototype=hosted&preview=hosted");
  const panel = page.getByRole("region", { name: "当前页面预览" });
  const frame = page.frameLocator('iframe[title="原型：托管 React"]');
  await expect(frame.getByRole("heading")).toBeVisible();
  await frame.getByRole("button", { name: "已添加 0 次" }).click();
  await expect(
    frame.getByRole("button", { name: "已添加 1 次" }),
  ).toBeVisible();
  await expect(panel.locator(".preview-host-status")).toHaveCount(0);
  await page.clock.fastForward(5500);
  await expect(panel.locator(".preview-host-status")).toHaveCount(0);
  await expect(page.getByText(/尚未确认页面就绪/)).toHaveCount(0);
  await frame.locator("html").evaluate((html) => {
    parent.postMessage(
      {
        type: "openfolio:preview:status",
        requestId: html.dataset.previewRequest,
        version: location.pathname.split("/")[1],
        status: "error",
      },
      "*",
    );
  });
  await expect(panel.getByRole("alert")).toHaveText(
    /宿主报告页面运行失败，请在独立页面检查。/,
  );
  await expect(panel.getByRole("link", { name: "独立打开" })).toHaveAttribute(
    "href",
    "https://127.0.0.1:10686/v1/index.html",
  );
  await panel.getByRole("button", { name: "重新加载原型" }).click();
  await expect(
    frame.getByRole("button", { name: "已添加 0 次" }),
  ).toBeVisible();
  await expect(panel.locator(".preview-host-status")).toHaveCount(0);
  await expect(panel.locator("iframe")).toHaveAttribute(
    "sandbox",
    "allow-scripts",
  );
});

test("card captions open details and full-size images while covers enter the canvas", async ({
  page,
  request,
  personal,
}) => {
  const catalog = await (await request.get(personal.url("prototypes"))).json();
  const entry = catalog.items.find(
    (item: { id: string }) => item.id === "orders",
  );
  await page.goto(path);
  const tile = page.locator('[data-prototype-id="orders"]');
  await expect(tile).toBeVisible();
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
      .filter({ hasText: "协作分支清单提交" })
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
  await page.route("**/api/public-previews/*/component.jpg?*", (route) =>
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
  personal,
}) => {
  const catalog = await (await request.get(personal.url("prototypes"))).json();
  const orders = catalog.items.find(
    (item: { id: string }) => item.id === "orders",
  );
  await page.route("**/api/repositories/*/prototypes?*", (route) =>
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
