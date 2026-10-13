import { test, expect, repositoryQuery } from "./connected";

test("workspace uses one header with accessible source and actions on desktop and mobile", async ({
  page,
}) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const module of ["specs", "changes", "prototypes"]) {
      await page.goto(`/?${repositoryQuery}&m=${module}`);
      await expect(
        page.getByRole("button", { name: "刷新中心仓库" }),
      ).toBeEnabled();
      await expect(page.locator(".workspace-source")).toHaveCount(0);
      await expect(page.locator(".workspace-header")).toHaveCount(1);
      const layout = await page.evaluate(() => {
        const header = document
          .querySelector(".workspace-header")!
          .getBoundingClientRect();
        const body = document
          .querySelector(".workspace-body")!
          .getBoundingClientRect();
        const context = document
          .querySelector(".header-context")!
          .getBoundingClientRect();
        const actions = document
          .querySelector(".header-actions")!
          .getBoundingClientRect();
        return {
          headerBottom: header.bottom,
          bodyTop: body.top,
          actionsLeft: actions.left,
          contextRight: context.right,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(layout.bodyTop).toBeCloseTo(layout.headerBottom, 0);
      expect(layout.overflow).toBe(false);
      expect(layout.actionsLeft).toBeGreaterThanOrEqual(layout.contextRight);
      await page.locator(".header-source summary").click();
      const source = page.locator(".header-source-details");
      await expect(source).toBeVisible();
      await expect(source).toContainText(
        module === "changes" ? "全部已推送分支" : "main",
      );
      await expect(source).toContainText("读取于");
      expect(
        await source.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return box.left >= 0 && box.right <= innerWidth;
        }),
      ).toBe(true);
      await page.locator(".header-source summary").click();
      if (module !== "specs")
        await expect(
          page
            .locator(".header-actions")
            .getByRole("button", { name: "复制页面链接" }),
        ).toBeVisible();
    }
  }
});

test("workbench has no search entry or shortcut requests", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/search"))
      requests.push(request.url());
  });
  for (const module of ["home", "specs", "changes", "prototypes"]) {
    await page.goto(`/?${repositoryQuery}&m=${module}`);
    await expect(page.locator(".workspace-body")).toBeVisible();
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
