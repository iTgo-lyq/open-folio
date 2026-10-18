import { test, expect, repositoryQuery } from "./connected";

test("cached interactions reuse permissions, periodic checks renew once, and transient manual failure keeps the page", async ({
  page,
  request,
}) => {
  const stats = async () =>
    (await (await request.post("/_fixture/control", { data: {} })).json())
      .permissionChecks as number;
  const before = await stats();
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  const heading = page.getByRole("heading", { name: "工程协作", exact: true });
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  expect(await stats()).toBe(before);
  await request.post("/_fixture/control", {
    data: { advancePermissions: 300_000 },
  });
  const rechecked = page.waitForResponse(
    (r) => r.url().includes("/refresh?automatic=1") && r.status() === 200,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await rechecked;
  expect(await stats()).toBe(before + 1);
  await page.route("**/refresh?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "GIT_READ_FAILED", message: "临时网络故障" } },
    }),
  );
  await page.getByRole("button", { name: "刷新中心仓库", exact: true }).click();
  await expect(page.locator(".error-notice")).toContainText("临时网络故障");
  await expect(heading).toBeVisible();
});

test("visible workbench automatically updates main Specs and prototypes without clearing the current content", async ({
  page,
  request,
  personal,
}) => {
  await page.clock.install();
  await page.goto(
    `/?${repositoryQuery}&m=specs&s=platform&branch=change/document-reader`,
  );
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Specs 来源分支" }),
  ).toHaveCount(0);
  await expect(page.locator(".header-source-details")).toContainText(
    "develop · 预发布",
  );
  try {
    await request.post("/_fixture/control", {
      data: { advanceMain: true, expireRefresh: personal.id },
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    await page.route("**/refresh?automatic=1&*", async (route) => {
      started = true;
      await held;
      await route.continue();
    });
    await page.clock.fastForward(60_000);
    await expect.poll(() => started).toBe(true);
    await expect(
      page.getByRole("heading", { name: "工程协作", exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("heading", { name: "自动更新后的能力", exact: true }),
    ).toBeVisible();
    await page.goto(`/?${repositoryQuery}&m=prototypes`);
    await expect(
      page.getByRole("heading", { name: "自动更新后的原型", exact: true }),
    ).toBeVisible();
  } finally {
    await request.post("/_fixture/control", { data: { restoreMain: true } });
  }
});

test("hidden pages pause checks, foreground retries transient failures, and revocation clears content", async ({
  page,
  request,
}) => {
  await page.clock.install();
  let checks = 0;
  await page.route("**/refresh?automatic=1&*", async (route) => {
    checks++;
    await route.continue();
  });
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await expect.poll(() => checks).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(120_000);
  expect(checks).toBe(1);
  await request.post("/_fixture/control", {
    data: { unavailable: true, advancePermissions: 300_000 },
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator(".error-notice")).toContainText("自动更新失败");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await request.post("/_fixture/control", { data: { unavailable: false } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".error-notice")).toHaveCount(0);
  await request.post("/_fixture/control", {
    data: { revoke: "token-a", advancePermissions: 300_000 },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "暂时没有可读取的版本" }),
  ).toBeVisible();
});
