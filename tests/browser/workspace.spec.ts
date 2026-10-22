import { test, expect, repositoryQuery, openSyncStatus } from "./connected";

test("workspace uses one floating toolbar with sync status on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const module of ["specs", "changes", "prototypes"]) {
      await page.goto(`/?${repositoryQuery}&m=${module}`);
      await expect(
        page.getByRole("button", { name: "同步状态：已同步" }),
      ).toBeVisible();
      const toolbar = page.locator("main > header");
      await expect(toolbar).toHaveCount(1);
      const layout = await toolbar.evaluate((el) => {
        const bar = el.getBoundingClientRect(),
          main = el.parentElement!.getBoundingClientRect();
        return {
          top: bar.top - main.top,
          blur: getComputedStyle(el).backdropFilter,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(layout.top).toBe(0);
      expect(layout.blur).not.toBe("none");
      expect(layout.overflow).toBe(false);
      const source = await openSyncStatus(page);
      await expect(source).toContainText("develop");
      await expect(source).toContainText("快照");
      expect(
        await source.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth;
        }),
      ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(source).toHaveCount(0);
      if (module === "prototypes")
        await expect(
          toolbar.getByRole("button", { name: "复制页面链接" }),
        ).toHaveCount(0);
    }
  }
});

test("logo and Ctrl+\\ collapse the sidebar into a capsule, tablet starts collapsed and phones use the bottom bar", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  const nav = page.getByRole("navigation", { name: "模块导航" });
  await expect(nav.getByRole("link", { name: "Changes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await expect(page.getByRole("button", { name: "收起侧栏" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "收起侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "收起侧栏" }).click();
  const logo = page.getByRole("button", { name: "展开侧栏" });
  await expect(logo).toBeFocused();
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(
    page.locator("main > header").getByRole("button", { name: /^当前仓库：/ }),
  ).toBeVisible();
  await page.keyboard.press("Control+Backslash");
  await expect(page.getByRole("button", { name: "收起侧栏" })).toBeVisible();
  await page.setViewportSize({ width: 834, height: 1100 });
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside")).toBeHidden();
  await nav.getByRole("link", { name: "Specs" }).click();
  await expect(page).toHaveURL(/m=specs/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("account menu switches theme and opens account settings", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(`/?${repositoryQuery}&m=specs`);
  await page.getByRole("button", { name: /^账号：/ }).click();
  const menu = page.getByRole("menu", { name: "账号" });
  await expect(
    menu.getByRole("menuitemradio", { name: /reader/ }),
  ).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitemradio", { name: "深色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: /^账号：/ }).click();
  await page.getByRole("menuitem", { name: "账号与 Token" }).click();
  await expect(page).toHaveURL(/m=connections/);
});

test("workbench has no search entry or shortcut requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/search"))
      requests.push(request.url());
  });
  for (const module of ["home", "specs", "changes", "prototypes"]) {
    await page.goto(`/?${repositoryQuery}&m=${module}`);
    await expect(page.locator("main")).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: /搜索|筛选能力|筛选原型|筛选变更|筛选预览目录/,
      }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "搜索工作台" })).toHaveCount(
      0,
    );
    await page.keyboard.press("Control+k");
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(requests).toEqual([]);
});
