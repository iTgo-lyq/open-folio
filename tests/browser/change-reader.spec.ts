import {
  test,
  expect,
  repositoryQuery,
  changeLinks,
  changeDisplay,
  backToChanges,
  openMaterial,
  copyReadingLink,
} from "./connected";

test("adjacent Changes follow the filtered directory order and return to the current row", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes&group=none&sort=urgency`);
  const links = changeLinks(page);
  await expect(links.first()).toBeVisible();
  const rows = await links.evaluateAll((items) =>
    items.map((item) => ({
      title: item.getAttribute("aria-label")!.slice(3),
      id: new URL((item as HTMLAnchorElement).href).searchParams.get("c")!,
    })),
  );
  expect(rows.length).toBeGreaterThan(1);
  await links.first().click();
  await expect(
    page.getByRole("button", { name: "上一个 Change", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "下一个 Change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: rows[1].title, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`c=${rows[1].id}`));
  await backToChanges(page);
  await expect(
    page.getByRole("link", { name: `打开 ${rows[1].title}`, exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/sort=urgency/);
  await changeDisplay(page, "看板");
  const board = page.getByRole("region", { name: "按阶段看板（只读）" });
  const boardRows = await board
    .getByRole("link", { name: /^打开 / })
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-label")!.slice(3)),
    );
  await board
    .getByRole("link", { name: /^打开 / })
    .first()
    .click();
  await page
    .getByRole("button", { name: "下一个 Change", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: boardRows[1], exact: true }),
  ).toBeVisible();
});

test("materials, raw source and copy fallback preserve a stable reading location", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=documents`,
  );
  await expect(page).toHaveURL(/ct=requirement/);
  await expect(
    page.getByRole("heading", {
      name: "让工程文档成为清晰的阅读体验",
      exact: true,
    }),
  ).toBeVisible();
  await copyReadingLink(page);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  await page.goto(link);
  await expect(page).toHaveURL(/ct=requirement/);
  await page.getByRole("button", { name: "更多操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "查看原文" }).click();
  await expect(
    page.getByRole("dialog", { name: "原文", exact: true }).locator("pre"),
  ).toContainText("# 让工程文档");
  await page.getByRole("button", { name: "关闭原文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "更多操作", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "分享", exact: true }).click();
  const share = page.getByRole("dialog", { name: "分享这个 Change" });
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    });
  });
  await share.getByRole("button", { name: "复制分享链接" }).click();
  await expect(share.getByRole("status")).toContainText("请手动复制");
  await expect(share.getByLabel("分享链接", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "关闭分享链接" }).click();
  await expect(
    page.getByRole("button", { name: "分享", exact: true }),
  ).toBeFocused();
  for (const theme of ["light", "dark"])
    for (const width of [1440, 834, 390, 320]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.setViewportSize({ width, height: 900 });
      await openMaterial(page, "概览");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/of-refactor-detail-${width}-${theme}.png`,
      });
    }
});
