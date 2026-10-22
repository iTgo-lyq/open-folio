import { test, expect, repositoryQuery, readingLink } from "./connected";
test("Specs tree, anchors, raw view and safe links", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "能力目录" })
      .getByRole("link", { name: "访问与来源" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "本页目录" })
    .getByRole("link", { name: "重复标题", exact: true })
    .nth(1)
    .click();
  await expect(page).toHaveURL(/anchor=/);
  await expect(page.locator("h2#重复标题-1")).toBeVisible();
  await page.getByRole("button", { name: "查看原文", exact: true }).click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    "<script>",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "缺失文档" }).click();
  await expect(page.getByRole("status")).toContainText("找不到");
  await page.getByRole("link", { name: "阅读权限能力" }).click();
  await expect(
    page.getByRole("heading", { name: "访问与来源", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("navigation", { name: "能力目录" })
    .getByRole("link", { name: "访问与来源", exact: true })
    .click();
  await expect(page).toHaveURL(/s=platform%2Faccess/);
  await expect(
    page.getByRole("heading", { name: "访问与来源", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { injected?: boolean }).injected,
    ),
  ).toBeUndefined();
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/specs-desktop.png",
    fullPage: true,
  });
});
test("deep namespace, invalid selection and mobile navigation remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^能力目录：/ }).click();
  await page
    .getByRole("navigation", { name: "能力目录" })
    .getByRole("link", { name: "交付记录" })
    .click();
  await expect(
    page.getByRole("heading", { name: "交付记录", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/specs-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/?${repositoryQuery}&m=specs&s=missing`);
  await expect(page.getByText("此来源中没有这项能力")).toBeVisible();
  await page.getByRole("button", { name: "返回能力目录" }).click();
  await expect(
    page.getByRole("heading", { name: "交付记录", exact: true }),
  ).toBeVisible();
});

test("deep links reveal selected capability ancestors", async ({ page }) => {
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await page
    .getByRole("button", { name: "收起 platform", exact: true })
    .click();
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform%2Faccess`);
  const selected = page
    .getByRole("navigation", { name: "能力目录" })
    .getByRole("link", { name: "访问与来源", exact: true });
  await expect(selected).toBeVisible();
  await page
    .getByRole("button", { name: "收起 platform", exact: true })
    .click();
  await page.reload();
  await expect(selected).toBeVisible();
});

test("reading URL includes its actual capability and branch without a copy entry", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform%2Faccess`);
  const copied = await readingLink(page);
  expect(new URL(copied).searchParams.get("s")).toBe("platform/access");
  expect(new URL(copied).searchParams.get("branch")).toBe("develop");
  await page.goto(`/?${repositoryQuery}&m=specs&branch=outdated`);
  await expect(page).toHaveURL(/s=delivery%2Fhistory%2Frecord(?:&|$)/);
  const defaultLink = await readingLink(page);
  expect(new URL(defaultLink).searchParams.get("branch")).toBe("develop");
  await page.goto(defaultLink);
  await expect(
    page.getByRole("heading", { name: "交付记录", exact: true }),
  ).toBeVisible();
});

test("reading settings persist and the floating header leaves anchors and mobile navigation readable", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "阅读设置", exact: true }).click();
  const preferences = page.getByRole("dialog", { name: "阅读设置" });
  await preferences.getByRole("radio", { name: "较大", exact: true }).click();
  await preferences.getByRole("switch", { name: "专注阅读" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "阅读设置", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("navigation", { name: "能力目录" })).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole("heading", { name: "工程协作", exact: true })
      .evaluate((el) => getComputedStyle(el.parentElement!).fontSize),
  ).toBe("17.5px");
  await page.getByRole("button", { name: /^能力目录：/ }).click();
  await page.getByRole("button", { name: "展开目录", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "能力目录" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "本页目录" })
    .getByRole("link", { name: "重复标题", exact: true })
    .nth(1)
    .click();
  const target = page.locator("h2#重复标题-1");
  await expect(target).toBeFocused();
  expect(
    await target.evaluate(
      (el) =>
        el.getBoundingClientRect().top >=
        document.querySelector("main > header")!.getBoundingClientRect()
          .bottom -
          1,
    ),
  ).toBe(true);
  for (const width of [834, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole("button", { name: /^能力目录：/ }).click();
    await page
      .getByRole("navigation", { name: "能力目录" })
      .getByRole("link", { name: "访问与来源", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "访问与来源", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/of-refactor-specs-${width}.png` });
  }
});
