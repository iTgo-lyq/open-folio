import {
  test,
  expect,
  repositoryQuery,
  copyPublicPreviewLink,
  origin,
  waitForWorkbenchLayout,
} from "./connected";
const path = `/?${repositoryQuery}&m=prototypes`;
test("prototype gallery, canvas and public page fit both themes at five widths", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const check = async (
    target: import("@playwright/test").Page,
    kind: string,
  ) => {
    for (const theme of ["light", "dark"])
      for (const width of [1440, 834, 390, 360, 320]) {
        await target.setViewportSize({ width, height: 900 });
        if (kind !== "public-prototype")
          await waitForWorkbenchLayout(target, width);
        await target.evaluate(async (theme) => {
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
          await target.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const bar = target.locator("header").first();
        if (kind === "canvas") {
          const tools = target.getByRole("group", {
            name: "原型视口操作",
            exact: true,
          });
          if (width <= 420) {
            await expect(tools).toBeVisible();
            const toolbar = await bar.boundingBox();
            const controls = await tools.boundingBox();
            const canvas = await target
              .getByTestId("preview-canvas")
              .boundingBox();
            expect(controls!.y).toBeGreaterThanOrEqual(
              toolbar!.y + toolbar!.height,
            );
            expect(canvas!.y).toBeGreaterThanOrEqual(
              controls!.y + controls!.height,
            );
          } else await expect(tools).toHaveCount(0);
          expect(
            await bar.evaluate((header) => {
              const bounds = header.getBoundingClientRect();
              const buttons = [...header.querySelectorAll("button")]
                .map((button) => button.getBoundingClientRect())
                .filter((rect) => rect.width && rect.height);
              return buttons.every(
                (rect, index) =>
                  rect.left >= bounds.left &&
                  rect.right <= bounds.right &&
                  buttons
                    .slice(index + 1)
                    .every(
                      (other) =>
                        rect.right <= other.left || other.right <= rect.left,
                    ),
              );
            }),
          ).toBe(true);
        }
        expect(
          await bar.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        ).toBe(true);
        const blur = await bar.evaluate(
          (element) => getComputedStyle(element).backdropFilter,
        );
        expect(blur).not.toBe("none");
        await target.screenshot({
          path: `/tmp/of-refactor-${kind}-${width}-${theme}.png`,
        });
      }
  };
  await page.goto(path + "&pkind=component");
  await expect(page).not.toHaveURL(/pkind=/);
  await expect(
    page.getByRole("heading", { name: "原型", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "原型类型" })).toHaveCount(0);
  await expect(page.locator('[data-thumbnail-status="ready"]')).toHaveCount(4);
  await check(page, "gallery");
  await page.getByRole("button", { name: "预览订单列表", exact: true }).click();
  await expect(page.locator("iframe")).toBeVisible();
  await page.getByRole("radio", { name: "移动设备", exact: true }).click();
  await check(page, "canvas");
  for (const [device, width] of [
    ["PC Web", "1440"],
    ["iPad", "834"],
    ["移动设备", "390"],
  ]) {
    await page.getByRole("radio", { name: device, exact: true }).click();
    await expect(page.locator("iframe")).toHaveAttribute("width", width);
  }
  await page.getByRole("button", { name: "切换横竖方向", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "844");
  await page.getByRole("button", { name: "重新加载原型", exact: true }).click();
  await expect(
    page.frameLocator("iframe").getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "切换横竖方向", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await copyPublicPreviewLink(page);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const viewer = await anonymous.newPage();
    await viewer.goto(link);
    await expect(viewer.locator("iframe")).toBeVisible();
    await viewer.getByRole("radio", { name: "移动设备", exact: true }).click();
    await viewer.getByRole("button", { name: "旋转视口", exact: true }).click();
    await viewer.getByRole("radio", { name: "100%", exact: true }).click();
    const readingUrl = viewer.url();
    expect(new URL(readingUrl).searchParams.get("device")).toBe("mobile");
    expect(new URL(readingUrl).searchParams.get("orientation")).toBe(
      "landscape",
    );
    expect(new URL(readingUrl).searchParams.get("zoom")).toBe("actual");
    await viewer.goto(readingUrl);
    await expect(viewer.locator("iframe")).toHaveAttribute("width", "844");
    await expect(viewer.locator("iframe")).toHaveAttribute("height", "390");
    await expect(
      viewer.getByRole("radio", { name: "100%", exact: true }),
    ).toBeChecked();
    await expect(
      viewer.getByRole("button", { name: "复制链接", exact: true }),
    ).toHaveCount(0);
    await viewer.getByRole("radio", { name: "适应画布", exact: true }).click();
    await check(viewer, "public-prototype");
    await viewer.goto("/preview/" + "0".repeat(64));
    await expect(
      viewer.getByRole("heading", {
        name: "没有找到这个公开版本",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await anonymous.close();
  }
});

test("public link preparation retries and copy denial selects the stable URL", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/repositories/*/previews/prepare*", (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: {
            error: { code: "TEMPORARY_FAILURE", message: "发布存储暂不可用" },
          },
        })
      : route.continue(),
  );
  await page.goto(path + "&prototype=orders&preview=orders");
  await expect(
    page.getByRole("heading", { name: "公开原型准备失败", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "公开链接", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "公开链接", exact: true });
  await expect(popover.getByRole("alert")).toContainText("发布存储暂不可用");
  fail = false;
  await popover
    .getByRole("button", { name: "重新准备公开链接", exact: true })
    .click();
  const field = popover.getByLabel("公开链接", { exact: true });
  await expect(field).not.toHaveValue("");
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
  await popover
    .getByRole("button", { name: "复制公开链接", exact: true })
    .click();
  await expect(popover.getByRole("status")).toContainText("请手动复制");
  await expect(field).toBeFocused();
  expect(
    await field.evaluate(
      (element: HTMLInputElement) =>
        element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe((await field.inputValue()).length);
  await popover.getByRole("button", { name: "关闭公开链接" }).click();
  await expect(
    page.getByRole("button", { name: "公开链接", exact: true }),
  ).toBeFocused();
  await expect(page.locator("iframe")).not.toHaveAttribute("sandbox");
});
