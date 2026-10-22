import {
  test,
  expect,
  repositoryQuery,
  waitForWorkbenchLayout,
} from "./connected";
const scenes = [
  ["home", "/?m=home", "我的仓库"],
  ["account", "/?m=connections", "账号与 Token"],
  ["spec", `/?${repositoryQuery}&m=specs&s=platform%2Faccess`, "访问与来源"],
  ["changes", `/?${repositoryQuery}&m=changes`, "Changes"],
  [
    "detail",
    `/?${repositoryQuery}&m=changes&c=document-reader`,
    "让工程文档成为清晰的阅读体验",
  ],
  [
    "integration",
    `/?${repositoryQuery}&m=changes&c=integration-demo&ct=integration`,
    "合入变更",
  ],
];
for (const [name, url, title] of scenes)
  test(`${name} layout fits both themes at all supported widths`, async ({
    page,
  }) => {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: title, exact: true }).first(),
    ).toBeVisible();
    if (name === "integration")
      await page
        .getByRole("button", { name: /integration-example.ts/ })
        .click();
    for (const theme of ["light", "dark"])
      for (const width of [1440, 834, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await waitForWorkbenchLayout(page, width);
        await page.evaluate(async (theme) => {
          document.documentElement.dataset.theme = theme;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          await Promise.allSettled(
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.effect?.getTiming().iterations !== Infinity,
              )
              .map((animation) => animation.finished),
          );
        }, theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `/tmp/of-refactor-final-${name}-${width}-${theme}.png`,
        });
      }
  });

test("anonymous login layout fits both themes and honors reduced motion", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "登录 OpenFolio", exact: true }),
    ).toBeVisible();
    for (const theme of ["light", "dark"])
      for (const width of [1440, 834, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(async (theme) => {
          document.documentElement.dataset.theme = theme;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          await Promise.allSettled(
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.effect?.getTiming().iterations !== Infinity,
              )
              .map((animation) => animation.finished),
          );
        }, theme);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: `/tmp/of-refactor-final-login-${width}-${theme}.png`,
        });
      }
  } finally {
    await context.close();
  }
});
