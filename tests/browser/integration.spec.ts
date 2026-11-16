import {
  test,
  expect,
  repositoryQuery,
  openMaterial,
  origin,
} from "./connected";
import { sharedReadUrl } from "../../src/lib/share-link.ts";

const route = `/?${repositoryQuery}&m=changes&c=integration-demo&ct=integration`;

test("the workbench previews a Draft PR privately and shows the official diff after automatic refresh", async ({
  page,
  request,
  personal,
}) => {
  const setPr = (integrationPr: "draft" | "merged") =>
    request.post("/_fixture/control", {
      data: { integrationPr, expireRefresh: personal.id },
    });
  expect((await setPr("draft")).ok()).toBe(true);
  let restored = false;
  try {
    await page.clock.install();
    const checked = page.waitForResponse(
      (response) =>
        response.url().includes("/refresh?automatic=1") && response.ok(),
    );
    await page.goto(route);
    await checked;
    const link = page.getByRole("link", { name: "PR #1", exact: true });
    await expect(link).toHaveAttribute("href", /\/pull\/1$/);
    await expect(page.getByText("Draft PR", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /integration-example.ts/ }).click();
    await expect(page.getByRole("table")).toContainText(
      "export const delivered = true;",
    );
    await page.screenshot({ path: "artifacts/integration-pr-preview.png" });

    const selected = new URL(page.url()).searchParams.get("cf");
    expect(selected).toMatch(/^[a-f0-9]{64}$/);
    await page.getByRole("button", { name: "分享", exact: true }).click();
    const openShare = page.getByRole("link", { name: "打开分享页" });
    await expect(openShare).toHaveAttribute("href", /^\/s\//);
    const shareLink = (await openShare.getAttribute("href"))!;
    await page.getByRole("button", { name: "关闭分享链接" }).click();
    const share = (path: string) =>
      fetch(
        `${origin}${sharedReadUrl(
          {
            repository: "https://github.com/acme/fixture",
            change: "integration-demo",
            integrationBranch: "develop",
          },
          path,
        )}`,
      );
    const shared = await share("change?refresh=1");
    expect(shared.status).toBe(200);
    const { snapshotId } = await shared.json();
    const publicDiff = (path: string) =>
      share(`integration${path}?snapshot=${snapshotId}`);
    const summary = await publicDiff("");
    expect(summary.status).toBe(200);
    expect((await summary.json()).record.status).toBe("missing");
    expect((await publicDiff("/files")).status).toBe(409);
    expect((await publicDiff(`/files/${selected}`)).status).toBe(409);
    expect(
      (
        await share(
          `integration/files/${selected}?snapshot=${snapshotId}&expand=1`,
        )
      ).status,
    ).toBe(409);
    expect(
      (await share(`integration?snapshot=${snapshotId}&scope=workbench`))
        .status,
    ).toBe(400);

    expect((await setPr("merged")).ok()).toBe(true);
    restored = true;
    await page.clock.fastForward(60_000);
    await expect(
      page.getByText("已合入 develop", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "合入文件" }),
    ).toBeVisible();
    await expect(link).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&](cf|cv)=/);
    await expect(page).toHaveURL(/c=integration-demo&ct=integration/);
    await page.getByRole("button", { name: /integration-example.ts/ }).click();
    await expect(page.getByRole("table")).toContainText(
      "export const delivered = true;",
    );
    await page.goto(shareLink);
    await expect(
      page.getByRole("navigation", { name: "合入文件" }),
    ).toBeVisible();
    await expect(
      page.getByText("二进制文件，无法展示文本差异。", { exact: true }),
    ).toBeVisible();
  } finally {
    if (!restored) expect((await setPr("merged")).ok()).toBe(true);
  }
});

test("an obsolete file deep link returns to the merged file list", async ({
  page,
}) => {
  await page.goto(`${route}&cf=${"0".repeat(64)}&cv=diff`);
  await expect(
    page.getByRole("navigation", { name: "合入文件" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/[?&](cf|cv)=/);
  await expect(page).toHaveURL(/c=integration-demo&ct=integration/);
});

test("large diffs load only on request in the workbench and in public shares", async ({
  page,
  request,
  personal,
}) => {
  const work = await (await request.get(personal.url("workbench"))).json();
  const { files } = await (
    await request.get(
      personal.url(
        `changes/integration-demo/integration/files?snapshot=${work.id}`,
      ),
    )
  ).json();
  const { id } = files.find(
    (file: { path: string }) => file.path === "src/integration-many-lines.txt",
  );
  const link = `/share?repository=https%3A%2F%2Fgithub.com%2Facme%2Ffixture&change=integration-demo&integrationBranch=develop&ct=integration`;
  for (const target of [route, link]) {
    await page.goto(`${target}&cf=${id}&cv=diff`);
    const load = page.getByRole("button", { name: "加载差异", exact: true });
    await expect(load).toBeVisible();
    const table = page.getByRole("table", {
      name: "src/integration-many-lines.txt 的统一差异",
    });
    await expect(table).toHaveCount(0);
    await load.click();
    await expect(table.getByRole("cell", { name: "新行号" }).last()).toHaveText(
      "1050",
    );
    await page.getByRole("button", { name: /integration-example.ts/ }).click();
    await expect(page.getByRole("table")).toContainText(
      "export const delivered = true;",
    );
    await page
      .getByRole("button", { name: /integration-many-lines.txt/ })
      .click();
    await expect(load).toBeVisible();
    await expect(table).toHaveCount(0);
    await load.click();
    await expect(table.getByRole("cell", { name: "新行号" }).last()).toHaveText(
      "1050",
    );
    await page.reload();
    await expect(load).toBeVisible();
    await expect(table).toHaveCount(0);
  }
});

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
  const lineNumberWidths = () =>
    content
      .getByRole("row")
      .first()
      .getByRole("cell", { name: /^[旧新]行号$/ })
      .evaluateAll((cells) =>
        cells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
      );
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
      const widths = await lineNumberWidths();
      expect(widths).toHaveLength(2);
      await wrap.click();
      await expect(wrap).toHaveAttribute("aria-pressed", "true");
      expect(await lineNumberWidths()).toEqual(widths);
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
    const widths = await lineNumberWidths();
    expect(widths).toHaveLength(2);
    await wrap.click();
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    expect(await lineNumberWidths()).toEqual(widths);
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
