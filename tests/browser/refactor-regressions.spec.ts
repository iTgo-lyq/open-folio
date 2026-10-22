import {
  test,
  expect,
  repositoryQuery,
  openAccountSettings,
  refreshCentral,
  tokenRows,
} from "./connected";

test("directory sheets restore keyboard focus or focus the selected reading content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform%2Faccess`);
  const openPane = page.getByRole("button", { name: /^能力目录：/ });
  await openPane.click();
  await page.keyboard.press("Escape");
  await expect(openPane).toBeFocused();
  const openToc = page.getByRole("button", { name: "本页目录", exact: true });
  await openToc.click();
  await page.keyboard.press("Escape");
  await expect(openToc).toBeFocused();
  await page.goto(
    `/?${repositoryQuery}&m=prototypes&prototype=orders&preview=orders`,
  );
  await expect(page.locator("iframe")).toBeVisible();
  const openDirectory = page.getByRole("button", {
    name: "切换原型目录",
    exact: true,
  });
  await openDirectory.click();
  await page.keyboard.press("Escape");
  await expect(openDirectory).toBeFocused();
  await openDirectory.click();
  await page
    .getByRole("dialog", { name: "原型目录", exact: true })
    .getByRole("button", { name: "价格卡片 组件", exact: true })
    .click();
  await expect(page.getByTestId("preview-canvas")).toBeFocused();
});

test("Token invalidation retains its error class and recovery action in account settings", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.route("**/api/repositories/*/workbench?*", (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: {
          code: "TOKEN_INVALID",
          message: "当前 Token 已失效，请重新绑定。",
        },
      },
    }),
  );
  await refreshCentral(page);
  await expect(
    page.getByRole("button", { name: "同步状态：Token 失效", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toHaveCount(0);
  await page.route("**/api/repositories/*/refresh?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "GIT_READ_FAILED", message: "临时网络故障" } },
    }),
  );
  const failedRetry = page.waitForResponse(
    (response) =>
      response.url().includes("/refresh?") && response.status() === 503,
  );
  await refreshCentral(page);
  await failedRetry;
  await expect(
    page.getByRole("button", { name: "同步状态：Token 失效", exact: true }),
  ).toBeVisible();
  await openAccountSettings(page);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "当前 Token 已失效",
  );
  await expect(tokenRows(page).first()).toContainText("失效");
  await page.getByRole("button", { name: "重新绑定", exact: true }).click();
  const binding = page.getByRole("dialog", { name: "添加 Token", exact: true });
  await expect(binding).toBeVisible();
  await binding.getByLabel("GitHub Token", { exact: true }).fill("token-b");
  await binding
    .getByRole("button", { name: "验证并添加", exact: true })
    .click();
  await expect(binding).toHaveCount(0);
  await expect(tokenRows(page)).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "重新绑定", exact: true }),
  ).toHaveCount(0);
});

test("a public link popover inside prototype details stays above the sheet and receives clicks", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=prototypes&pdetail=orders`);
  const sheet = page.getByRole("dialog", { name: "原型详情", exact: true });
  await expect(
    sheet.getByRole("heading", { name: "订单列表", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "公开链接", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "公开链接", exact: true });
  const copy = popover.getByRole("button", {
    name: "复制公开链接",
    exact: true,
  });
  await expect(copy).toBeVisible();
  expect(
    await copy.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error("denied");
        },
      },
    });
  });
  await copy.click();
  await expect(popover.getByRole("status")).toContainText("请手动复制");
  await expect(popover.getByLabel("公开链接", { exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    sheet.getByRole("button", { name: "公开链接", exact: true }),
  ).toBeFocused();
});

test("the selected integrated file has a distinct style from other files", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=integration-demo&ct=integration`,
  );
  const selected = page.getByRole("button", { name: /integration-example.ts/ });
  const other = page.getByRole("button", { name: /integration-example.bin/ });
  await selected.click();
  await expect(selected).toHaveAttribute("aria-current", "true");
  await expect(other).toHaveAttribute("aria-current", "false");
  const colors = await Promise.all(
    [selected, other].map((element) =>
      element.evaluate((node) => getComputedStyle(node).backgroundColor),
    ),
  );
  expect(colors[0]).not.toBe(colors[1]);
  await other.click();
  await expect(other).toHaveAttribute("aria-current", "true");
  await expect(selected).toHaveAttribute("aria-current", "false");
});

test("selecting the same chapter again scrolls back and restores heading focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  const scroll = page.getByRole("region", { name: "阅读正文", exact: true });
  const chapter = page
    .getByRole("navigation", { name: "本页目录", exact: true })
    .getByRole("link", { name: "重复标题", exact: true })
    .last();
  await chapter.click();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  await scroll.evaluate((element) => (element.scrollTop = 0));
  await chapter.click();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  await expect(page.locator("h2#重复标题-1")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 500 });
  await scroll.evaluate((element) => (element.scrollTop = 0));
  await page.getByRole("button", { name: "本页目录", exact: true }).click();
  await page
    .getByRole("dialog", { name: "本页目录", exact: true })
    .getByRole("link", { name: "重复标题", exact: true })
    .last()
    .click();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
  await expect(page.locator("h2#重复标题-1")).toBeFocused();
});
