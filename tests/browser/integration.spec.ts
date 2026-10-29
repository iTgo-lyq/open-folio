import { test, expect, repositoryQuery, openMaterial } from "./connected";

const route = `/?${repositoryQuery}&m=changes&c=integration-demo&ct=integration`;
test("integrated diff survives source deletion and supports file links, history, keyboard and narrow viewports", async ({
  page,
  request,
  personal,
}) => {
  const work = await (await request.get(personal.url("workbench"))).json();
  const summary = await (
    await request.get(
      personal.url(`changes/integration-demo/integration?snapshot=${work.id}`),
    )
  ).json();
  expect(summary.record.status).toBe("found");
  await page.goto(route);
  const drawer = page.getByRole("main");
  await expect(
    drawer.getByText("已合入 develop", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: /integration-example.ts/ }).click();
  await expect(drawer.getByRole("table")).toContainText(
    "export const delivered = true;",
  );
  await expect(
    drawer.getByRole("cell", { name: "新行号", exact: true }).last(),
  ).toHaveText("2");
  const files = drawer.getByRole("navigation", { name: "合入文件" });
  const panel = drawer.getByRole("region", { name: "文件差异", exact: true });
  const filesBox = (await files.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(Math.abs(filesBox.y - panelBox.y)).toBeLessThan(1);
  expect(Math.abs(filesBox.height - panelBox.height)).toBeLessThan(1);
  await page.screenshot({ path: "artifacts/integration-desktop.png" });
  const linked = page.url();
  await page.reload();
  await expect(drawer.getByRole("table")).toContainText(
    "export const delivered = true;",
  );
  await drawer.getByRole("button", { name: /integration-example.bin/ }).click();
  await expect(
    drawer.getByText("二进制文件，无法展示文本差异。", { exact: true }),
  ).toBeVisible();
  expect((await panel.boundingBox())!.height).toBe(filesBox.height);
  await page.goBack();
  await expect(drawer.getByRole("table")).toContainText(
    "export const delivered = true;",
  );
  await page.goForward();
  await expect(
    drawer.getByText("二进制文件，无法展示文本差异。", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: /integration-large.html/ }).click();
  await expect(drawer.getByText(/源文件超过 1 MiB/)).toBeVisible();
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw Error("Clipboard unavailable");
        },
      },
      configurable: true,
    }),
  );
  await drawer.getByRole("button", { name: "复制 Git 比较命令" }).click();
  await expect(page.getByRole("textbox", { name: "待复制内容" })).toHaveValue(
    `git diff --no-ext-diff --no-textconv ${summary.record.commit}^1 ${summary.record.commit}`,
  );
  await page.getByRole("button", { name: "关闭复制窗口" }).click();
  await openMaterial(page, "依据");
  await expect(page).toHaveURL(/ct=evidence/);
  await openMaterial(page, "合入变更");
  await expect(page).toHaveURL(/ct=integration/);
  for (const [name, width, height] of [
    ["ipad", 834, 1112],
    ["mobile", 390, 844],
    ["narrow", 320, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(route);
    await expect(
      drawer.getByRole("navigation", { name: "合入文件" }),
    ).toBeVisible();
    await drawer
      .getByRole("button", { name: /integration-example.ts/ })
      .click();
    await expect(drawer.getByRole("table")).toContainText(
      "export const delivered = true;",
    );
    await expect(
      drawer.getByRole("navigation", { name: "合入文件" }),
    ).toBeHidden();
    expect(
      await drawer.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: `artifacts/integration-${name}.png` });
    await drawer.getByRole("button", { name: "文件", exact: true }).click();
    await expect(
      drawer.getByRole("button", { name: /integration-example.ts/ }),
    ).toBeFocused();
  }
  await page.goto(linked);
  await expect(drawer.getByRole("table")).toContainText(
    "export const delivered = true;",
  );
});

test("diff panes stay aligned while long lines wrap and contents scroll independently", async ({
  page,
}) => {
  const longLine = `export const description = "${"可阅读的长行内容 ".repeat(40)}";`;
  await page.route(
    "**/changes/integration-demo/integration/files/*?*",
    async (route) => {
      const response = await route.fetch();
      const diff = await response.json();
      await route.fulfill({
        response,
        json: {
          ...diff,
          kind: "text",
          lines: Array.from({ length: 120 }, (_, index) => ({
            kind: "add",
            text: longLine,
            new: index + 1,
          })),
        },
      });
    },
  );
  await page.goto(route);
  const files = page.getByRole("navigation", { name: "合入文件" });
  const panel = page.getByRole("region", { name: "文件差异", exact: true });
  const content = page.getByRole("region", { name: "统一差异", exact: true });
  const wrap = panel.getByRole("button", { name: "自动换行" });
  await expect(page.getByRole("table")).toContainText(longLine);
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme;
      }, theme);
      const filesBox = (await files.boundingBox())!;
      expect((await panel.boundingBox())!.height).toBe(filesBox.height);
      const toolbarY = (await wrap.boundingBox())!.y;
      await content.evaluate((el) => {
        el.scrollTop = 200;
        el.scrollLeft = 200;
      });
      expect(await content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      expect(await content.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      expect(await files.evaluate((el) => el.scrollTop)).toBe(0);
      expect((await wrap.boundingBox())!.y).toBe(toolbarY);
      await wrap.click();
      await expect(wrap).toHaveAttribute("aria-pressed", "true");
      expect(
        await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      await expect(page.getByRole("table")).toContainText(longLine);
      await wrap.click();
      await expect(wrap).toHaveAttribute("aria-pressed", "false");
    }
  }
  for (const width of [834, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(route);
    await files.getByRole("button", { name: /integration-example.ts/ }).click();
    await expect(content.getByRole("table")).toBeVisible();
    await wrap.click();
    expect(
      await content.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await page
        .getByRole("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await expect(
      panel.getByRole("button", { name: "复制 Git 比较命令" }),
    ).toBeInViewport();
    await page.screenshot({ path: `artifacts/integration-wrap-${width}.png` });
    await panel.getByRole("button", { name: "文件", exact: true }).click();
    await expect(
      files.getByRole("button", { name: /integration-example.ts/ }),
    ).toBeFocused();
  }
});

test("integration failures retry; old archives remain empty and stale responses cannot cross Changes", async ({
  page,
}) => {
  const api = "**/changes/integration-demo/integration?*";
  await page.route(api, (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "GIT_READ_FAILED", message: "测试读取中断" } },
    }),
  );
  await page.goto(route);
  await expect(page.getByText("测试读取中断")).toBeVisible();
  await page.unroute(api);
  await page.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(page.getByText("已合入 develop", { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/changes/integration-demo/integration/files/*?*",
    async (route) => {
      await gate;
      await route.continue().catch(() => {});
    },
  );
  await page.getByRole("button", { name: /integration-example.ts/ }).click();
  await expect(page.getByText("正在读取文件差异…")).toBeVisible();
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set("c", "source-connect");
    history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText("暂无合入记录", { exact: true }).first(),
  ).toBeVisible();
  release();
  await expect(page.getByRole("table")).toHaveCount(0);
});
