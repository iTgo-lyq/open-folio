import {
  copyPublicPreviewLink,
  test,
  expect,
  repositoryQuery,
  repoKey,
  openSyncStatus,
} from "./connected";
const path = `/?${repositoryQuery}&m=prototypes`;
test("submodule detail distinguishes the parent build baseline from the child catalog commit", async ({
  page,
}) => {
  await page.route(
    /\/api\/repositories\/[^/]+\/prototypes(?:\?|$)/,
    async (route) => {
      const response = await route.fetch(),
        catalog = await response.json();
      const item = catalog.items.find(
        (item: { id: string }) => item.id === "orders",
      );
      item.source = {
        revision: catalog.revision,
        packagePath: "packages/prototype",
        links: [
          {
            path: "frontend",
            repository: "https://github.com/team/frontend.git",
            commit: "a".repeat(40),
          },
        ],
      };
      item.sourcePath = `frontend/${item.sourcePath}`;
      await route.fulfill({ response, json: catalog });
    },
  );
  await page.goto(path + "&pdetail=orders");
  const details = page.getByRole("dialog");
  await expect(
    details.getByText("构建基线提交（主仓库）", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText("清单子模块 frontend", { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByText(
      "https://github.com/team/frontend.git · " + "a".repeat(40),
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    details.getByText("frontend/packages/prototype/src/orders.tsx", {
      exact: true,
    }),
  ).toBeVisible();
  await details.getByRole("button", { name: "进入预览", exact: true }).click();
  await expect(page.locator('iframe[title="原型：订单列表"]')).toBeVisible();
});
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
      .getByRole("radio", {
        name: { "pc-web": "PC Web", ipad: "iPad", mobile: "手机" }[
          device as "pc-web" | "ipad" | "mobile"
        ],
        exact: true,
      })
      .click();
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
    await expect(tile.locator('[data-thumbnail-status="ready"]')).toBeVisible();
    await expect(tile.getByText(/尚未提供截图|截图暂不可用/)).toHaveCount(0);
  }
  await tile
    .getByRole("button", { name: "预览托管 React", exact: true })
    .click();
  await expect(
    page.frameLocator('iframe[title="原型：托管 React"]').getByRole("heading"),
  ).toBeVisible();
});

test("capsule tooltips stay above the prototype gallery", async ({ page }) => {
  await page.goto(path);
  await expect(page.locator('[data-thumbnail-status="ready"]')).toHaveCount(4);
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  const link = page
    .getByRole("navigation", { name: "模块导航" })
    .getByRole("link", { name: "Changes", exact: true });
  const tip = page.getByRole("tooltip", { name: "Changes" });
  const aboveContent = () =>
    tip.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const top = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return !!top && el.contains(top);
    });
  await link.hover();
  await expect(tip).toBeVisible();
  expect(await aboveContent()).toBe(true);
  await page.mouse.move(700, 400, { steps: 4 });
  await page.keyboard.press("Escape");
  await link.focus();
  await expect(tip).toBeVisible();
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
  await expect(region.getByRole("heading", { level: 1 })).toHaveText("原型");
  await expect(
    page.getByRole("combobox", { name: "Specs 来源分支" }),
  ).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await region.getByRole("radio", { name: "手机", exact: true }).click();
  await expect(region.getByRole("listitem")).toHaveCount(4);
  await region.getByRole("button", { name: "预览订单列表" }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".workspace-source")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "原型目录", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-preview-provenance], [data-preview-footnote]"),
  ).toHaveCount(0);
  await expect(page.frameLocator("iframe").getByRole("heading")).toHaveText(
    "订单列表原型",
  );
  await copyPublicPreviewLink(page);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.has("c")).toBe(false);
  expect(new URL(link).pathname).toMatch(/^\/preview\/[a-f0-9]{64}$/);
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await page.goBack();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await expect(
    region.getByRole("radio", { name: "手机", exact: true }),
  ).toBeChecked();
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
  await page.getByRole("radio", { name: "手机", exact: true }).click();
  await page.getByRole("button", { name: "预览待导出页面" }).click();
  await expect(
    page.getByText("此页面尚未登记已发布产物。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回原型总览" }).click();
  await page.getByRole("radio", { name: "PC Web", exact: true }).click();
  await expect(page.locator('[data-thumbnail-status="ready"]')).toHaveCount(4);
  await page.locator('[aria-label="项目原型总览"]').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: "artifacts/prototype-catalog-desktop.png" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("radio", { name: "手机", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "价格卡片", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator('[data-prototype-id="card"] [data-thumbnail-status="ready"]'),
  ).toHaveCount(1);
  await page.locator('[aria-label="项目原型总览"]').evaluate((el) => {
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
    page.getByRole("heading", { name: "这个仓库还没有原型" }),
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

test("focused viewer keeps viewport controls and entry history in the workbench", async ({
  page,
}) => {
  await page.goto(path + "&prototype=orders&preview=orders");
  const panel = page.getByRole("region", { name: "当前页面预览" });
  await expect(panel.locator("iframe")).toHaveAttribute("width", "1440");
  await page.getByRole("radio", { name: "移动设备", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("radio", { name: "100%", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await page.getByRole("button", { name: "切换原型目录" }).click();
  await page
    .getByRole("dialog", { name: "原型目录", exact: true })
    .getByRole("button", { name: "订单详情 页面", exact: true })
    .click();
  await expect(page).toHaveURL(/prototype=detail/);
  await expect(panel.locator("iframe")).toHaveAttribute(
    "title",
    "原型：订单详情",
  );
  await expect(
    page.getByRole("radio", { name: "移动设备", exact: true }),
  ).toHaveCount(0);
  await page.goBack();
  await expect(panel.locator("iframe")).toHaveAttribute(
    "title",
    "原型：订单列表",
  );
  await page.reload();
  await expect(panel.locator("iframe")).toHaveAttribute("width", "390");
  await page.getByRole("radio", { name: "适应画布", exact: true }).click();
  await page.screenshot({ path: "artifacts/prototype-viewer-desktop.png" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole("button", { name: "切换原型目录" }).click();
  await page
    .getByRole("dialog", { name: "原型目录", exact: true })
    .getByRole("button", { name: "价格卡片 组件", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(panel.locator("iframe")).toHaveAttribute("width", "640");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.frameLocator("iframe").getByRole("heading")).toBeVisible();
  await page.screenshot({ path: "artifacts/prototype-viewer-mobile.png" });
  await page
    .getByRole("navigation", { name: "模块导航" })
    .getByRole("link", { name: "Specs" })
    .click();
  await expect(await openSyncStatus(page)).toContainText("develop");
  await page.keyboard.press("Escape");
  expect(new URL(page.url()).searchParams.has("prototype")).toBe(false);
});

test("hosted controls receive real pointer clicks at fit and actual canvas scales", async ({
  page,
}) => {
  await page.goto(path + "&prototype=hosted&preview=hosted");
  const panel = page.getByRole("region", { name: "当前页面预览" });
  const iframe = panel.locator("iframe");
  const frame = page.frameLocator('iframe[title="原型：托管 React"]');
  const counter = frame.getByRole("button", { name: /^已添加 \d+ 次$/ });
  await expect(counter).toHaveText("已添加 0 次");
  await counter.evaluate((button) => {
    button.addEventListener("click", (event) => {
      button.setAttribute("data-trusted-click", String(event.isTrusted));
    });
  });
  for (const [index, mode] of ["适应画布", "100%"].entries()) {
    await page.getByRole("radio", { name: mode, exact: true }).click();
    await expect(iframe).toHaveCSS(
      "transform",
      index === 0 ? /matrix\(0\./ : "matrix(1, 0, 0, 1, 0, 0)",
    );
    await expect(counter).toBeVisible();
    // Playwright 1.63 adds the frame offset to OOPIF quads without applying its
    // CSS scale. Map the frame-local center to the visible canvas for real input.
    const local = await counter.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const x = box.x + box.width / 2,
        y = box.y + box.height / 2;
      return {
        x,
        y,
        hitsButton: button.contains(document.elementFromPoint(x, y)),
      };
    });
    expect(local.hitsButton).toBe(true);
    const point = await iframe.evaluate((element, local) => {
      const box = element.getBoundingClientRect();
      const x = box.x + (local.x * box.width) / element.clientWidth;
      const y = box.y + (local.y * box.height) / element.clientHeight;
      return { x, y, hitsFrame: document.elementFromPoint(x, y) === element };
    }, local);
    expect(point.hitsFrame).toBe(true);
    await page.mouse.click(point.x, point.y);
    await expect(counter).toHaveText(`已添加 ${index + 1} 次`);
    await expect(counter).toHaveAttribute("data-trusted-click", "true");
  }
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
  // Keep the bridge lifecycle test independent of transformed OOPIF coordinates;
  // real pointer interaction at both canvas scales is covered above.
  await page.getByRole("radio", { name: "100%", exact: true }).click();
  await expect(panel.locator("iframe")).toHaveCSS(
    "transform",
    "matrix(1, 0, 0, 1, 0, 0)",
  );
  await frame.getByRole("button", { name: "已添加 0 次" }).click();
  await expect(
    frame.getByRole("button", { name: "已添加 1 次" }),
  ).toBeVisible();
  await expect(panel.locator("[data-preview-host-status]")).toHaveCount(0);
  await page.clock.fastForward(5500);
  await expect(panel.locator("[data-preview-host-status]")).toHaveCount(0);
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
  await expect(page.getByRole("link", { name: "独立打开" })).toHaveAttribute(
    "href",
    "https://127.0.0.1:10686/v1/index.html",
  );
  await page.getByRole("button", { name: "重新加载原型" }).click();
  await expect(
    frame.getByRole("button", { name: "已添加 0 次" }),
  ).toBeVisible();
  await expect(panel.locator("[data-preview-host-status]")).toHaveCount(0);
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
  const coverWidth = (await tile
    .locator("[data-thumbnail-status]")
    .boundingBox())!.width;
  const description = (await tile
    .locator("[data-prototype-description]")
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
      .locator('[aria-label="原型来源"] > div')
      .filter({ hasText: "源码提交" })
      .locator("dd"),
  ).toHaveText(entry.artifact.sourceCommit);
  await expect(
    details
      .locator('[aria-label="原型来源"] > div')
      .filter({ hasText: "集成分支清单提交" })
      .locator("dd"),
  ).toHaveText(catalog.revision);
  await page.screenshot({ path: "artifacts/prototype-details-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(
    tile.getByRole("button", { name: "查看原型详情：订单列表" }),
  ).toBeFocused();
  // The title's native button covers the complete caption, including its padding.
  await tile
    .locator('button[aria-label^="查看原型详情："]')
    .click({ position: { x: 5, y: 5 } });
  await expect(details).toBeVisible();
  await details.getByRole("radio", { name: "移动设备", exact: true }).click();
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
      '[aria-label="原型来源"], .workspace-source, [data-preview-provenance]',
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
  await expect(
    details.locator('[data-thumbnail-status="ready"]'),
  ).toBeVisible();
  await page.reload();
  await expect(
    details.getByRole("heading", { name: "价格卡片" }),
  ).toBeVisible();
  await expect(
    details.locator('[data-thumbnail-status="ready"]'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/prototype-details-mobile.png" });
  await details.getByRole("button", { name: "关闭原型详情" }).click();
  await expect(details).toHaveCount(0);
  await expect(page.locator("[data-prototype-gallery-title]")).toBeFocused();
  await page.goBack();
  await expect(details).toBeVisible();
  await page.goto(path + "&pdetail=removed");
  await expect(
    details.getByRole("heading", { name: "未找到此原型" }),
  ).toBeVisible();
  await details.getByRole("button", { name: "关闭原型详情" }).click();
  await page.getByRole("radio", { name: "手机", exact: true }).click();
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
  const scroll = page.locator('[aria-label="项目原型总览"]');
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
