import {
  test,
  expect,
  repositoryQuery,
  changeLinks,
  changeDisplay,
  backToChanges,
  openMaterial,
  readingLink,
  origin,
} from "./connected";

for (const reader of ["workbench", "share"]) {
  test(`${reader} opens extra Markdown links and keeps missing file targets explicit`, async ({
    page,
    browser,
  }) => {
    const anonymous =
      reader === "share" ? await browser.newContext({ baseURL: origin }) : null;
    try {
      const target = anonymous ? await anonymous.newPage() : page;
      const base =
        reader === "share"
          ? `/share?${new URLSearchParams({ repository: "https://github.com/acme/fixture", change: "document-reader", integrationBranch: "develop" })}`
          : `/?${repositoryQuery}&m=changes&c=document-reader`;
      for (const query of ["ct=file%3Aresearch.md", "document=research.md"]) {
        await target.goto(`${base}&${query}`);
        await expect(
          target.getByRole("heading", { name: "阅读体验调查", exact: true }),
        ).toBeVisible();
        await expect(
          target.getByRole("heading", { name: "文件缺失", exact: true }),
        ).toHaveCount(0);
      }
      for (const query of [
        "ct=file%3Aremoved.md",
        "ct=documents&document=removed.md",
      ]) {
        await target.goto(`${base}&${query}`);
        await expect(
          target.getByRole("heading", { name: "文件缺失", exact: true }),
        ).toBeVisible();
        await expect(
          target.getByRole("alert").filter({ hasText: "文件缺失" }),
        ).toContainText("removed.md");
        await expect(
          target.getByRole("heading", { name: "阅读体验调查", exact: true }),
        ).toHaveCount(0);
      }
    } finally {
      await anonymous?.close();
    }
  });
}

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
  const link = await readingLink(page);
  await page.goto(link);
  await expect(page).toHaveURL(/ct=requirement/);
  await page.getByRole("button", { name: "查看原文", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "原文", exact: true }).locator("pre"),
  ).toContainText("# 让工程文档");
  await page.getByRole("button", { name: "关闭原文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "查看原文", exact: true }),
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
  for (const name of ["网页链接", "Agent 文本链接"]) {
    const group = share.getByRole("group", { name, exact: true });
    await group
      .getByRole("button", {
        name: name === "网页链接" ? "复制网页链接" : "复制 Agent 链接",
      })
      .click();
    await expect(group.getByRole("status")).toContainText("请手动复制");
    const input = group.getByLabel(name, { exact: true });
    await expect(input).toBeFocused();
    expect(
      await input.evaluate(
        (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
      ),
    ).toBe((await input.inputValue()).length);
  }
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
