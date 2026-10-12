import { test, expect, repositoryQuery } from "./connected";

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
  await expect(page.locator(".workspace-source")).toContainText(
    "main · 守护分支",
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
  await request.post("/_fixture/control", { data: { unavailable: true } });
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
  await request.post("/_fixture/control", { data: { revoke: "token-a" } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "暂时没有可读取的版本" }),
  ).toBeVisible();
});
