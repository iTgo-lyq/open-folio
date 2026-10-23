import {
  test,
  expect,
  repositoryQuery,
  refreshCentral,
  openSyncStatus,
} from "./connected";

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
  await refreshCentral(page);
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "临时网络故障",
  );
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
  await expect(await openSyncStatus(page)).toContainText("develop");
  await page.keyboard.press("Escape");
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
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "自动更新失败",
  );
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await request.post("/_fixture/control", { data: { unavailable: false } });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
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

test("module navigation and revisited materials reuse cached data, and session failure keeps the reader", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (/\/(workbench|refresh|documents|prototypes)(\/|\?)/.test(r.url()))
      calls.push(r.url());
  });
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  const heading = page.getByRole("heading", { name: "工程协作", exact: true });
  await expect(heading).toBeVisible();
  await expect
    .poll(() => calls.filter((u) => u.includes("/refresh?")).length)
    .toBe(1);
  const baseline = calls.filter((u) =>
    /\/(workbench|refresh)\?/.test(u),
  ).length;
  const docs = calls.filter((u) => u.includes("/documents/")).length;
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Changes", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Specs", exact: true }).click();
  await expect(heading).toBeVisible();
  expect(calls.filter((u) => /\/(workbench|refresh)\?/.test(u)).length).toBe(
    baseline,
  );
  expect(calls.filter((u) => u.includes("/documents/")).length).toBe(docs);
  await page.getByRole("link", { name: "原型", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "项目原型总览" })
      .getByRole("heading", { level: 1 }),
  ).toHaveText("原型");
  const catalogs = calls.filter((u) => u.includes("/prototypes?")).length;
  await page.getByRole("link", { name: "Specs", exact: true }).click();
  await expect(heading).toBeVisible();
  await page.getByRole("link", { name: "原型", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "项目原型总览" })
      .getByRole("heading", { level: 1 }),
  ).toHaveText("原型");
  expect(calls.filter((u) => u.includes("/prototypes?")).length).toBe(catalogs);
  await page.getByRole("link", { name: "Specs", exact: true }).click();
  await expect(heading).toBeVisible();
  expect(calls.filter((u) => /\/(workbench|refresh)\?/.test(u)).length).toBe(
    baseline,
  );
  await page.route("**/api/session", (route) => route.abort("failed"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "账号状态检查失败",
  );
  await expect(heading).toBeVisible();
  await page.unroute("**/api/session");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(heading).toBeVisible();
});

test("new body and snapshot replace the visible document together", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  const old = page.getByRole("heading", { name: "工程协作", exact: true });
  await expect(old).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/documents/**", async (route) => {
    started = true;
    await held;
    await route.continue();
  });
  try {
    await request.post("/_fixture/control", {
      data: { advanceMain: true, expireRefresh: personal.id },
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => started).toBe(true);
    await expect(old).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "自动更新后的能力", exact: true }),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", { name: "自动更新后的能力", exact: true }),
    ).toBeVisible();
    await expect(old).toHaveCount(0);
  } finally {
    release();
    await request.post("/_fixture/control", { data: { restoreMain: true } });
  }
});

test("directory refresh failure keeps the existing repository list", async ({
  page,
}) => {
  await page.goto("/?m=home");
  const repositories = page
    .getByRole("list", { name: "可阅读的仓库" })
    .getByRole("link");
  await expect(repositories).toHaveCount(1);
  await page.route("**/api/connections/*/discovery", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({ status: 202, json: {} });
    else await route.continue();
  });
  await page.route("**/api/repositories?*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: { code: "PROVIDER_UNAVAILABLE", message: "目录暂时不可达" },
      },
    }),
  );
  await page.getByRole("button", { name: "重新发现", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "目录暂时不可达",
  );
  await expect(repositories).toHaveCount(1);
});
