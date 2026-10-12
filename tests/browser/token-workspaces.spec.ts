import { test, expect, repositoryQuery, repoKey } from "./connected";
test("another device restores the same snapshot, reading module and sidebar; different token has no snapshot", async ({
  page,
  browser,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(
    page.getByRole("heading", { name: /^Changes/, exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/session")).json()).workspace
          .preferences,
    )
    .toMatchObject({
      module: "changes",
      railCollapsed: true,
      repository: { repositoryId: "1" },
    });
  const original = await (
    await page.request.get(personal.url("workbench"))
  ).json();
  const second = await browser.newContext();
  try {
    const login = await second.request.post("/api/session", {
      headers: { origin: "http://127.0.0.1:10682" },
      data: { username: "reader", token: "token-a" },
    });
    expect(login.status()).toBe(201);
    const a = await login.json();
    expect(a.connection.id).toBe(personal.id);
    const b = await second.newPage();
    await b.goto("/");
    await expect(
      b.getByRole("heading", { name: /^Changes/, exact: false }),
    ).toBeVisible();
    await expect(b.getByRole("button", { name: "展开侧栏" })).toBeVisible();
    const resumed = await (
      await second.request.get(
        `/api/repositories/${repoKey}/workbench?connectionId=${a.connection.id}`,
      )
    ).json();
    expect(resumed.id).toBe(original.id);
    const switched = await second.request.post("/api/session", {
      headers: { origin: "http://127.0.0.1:10682" },
      data: { username: "collaborator", token: "token-b" },
    });
    const other = await switched.json();
    expect(other.connection.id).not.toBe(personal.id);
    const uncached = await second.request.get(
      `/api/repositories/${repoKey}/workbench?connectionId=${other.connection.id}&repositoryId=1&fullName=acme%2Ffixture`,
    );
    expect(uncached.status()).toBe(503);
    expect((await uncached.json()).error.code).toBe("NO_SNAPSHOT");
    expect(
      (await (await page.request.get("/api/session")).json()).connected,
    ).toBe(true);
  } finally {
    await second.close();
  }
});
test("a revoked device clears its page and a delayed old response cannot restore private content", async ({
  page,
  personal,
}) => {
  const original = await (
    await page.request.get(personal.url("workbench"))
  ).json();
  let deliver: (() => Promise<void>) | undefined;
  await page.route("**/workbench?*", async (route) => {
    await new Promise<void>((resolve) => {
      deliver = async () => {
        await route.fulfill({ json: original }).catch(() => {});
        resolve();
      };
    });
  });
  await page.goto(`/?${repositoryQuery}&m=specs`);
  await expect.poll(() => !!deliver).toBe(true);
  await page.request.delete("/api/session", {
    headers: { origin: "http://127.0.0.1:10682" },
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: /你的工程工作台/ }),
  ).toBeVisible();
  await deliver!();
  await expect(page.locator(".specs-tree")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /你的工程工作台/ }),
  ).toBeVisible();
});
for (const width of [1440, 834, 390, 320])
  test(`credential switching and manual copy fit ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error("denied");
          },
        },
      }),
    );
    await page.goto("/?m=connections");
    await page.getByRole("button", { name: "复制 token", exact: true }).click();
    await expect(page.getByLabel("当前 token", { exact: true })).toHaveValue(
      "token-a",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "复制 token", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "切换凭据", exact: true }).click();
    await page
      .getByLabel("用户名（可选）", { exact: true })
      .fill("collaborator");
    await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
    await page.getByRole("button", { name: "切换并恢复", exact: true }).click();
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@collaborator",
    );
    await page.screenshot({
      path: `artifacts/token-credentials-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "退出当前设备", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "登录自己的工作台" }),
    ).toBeVisible();
  });

test("a legacy multi-credential Cookie selects one owned workspace once", async ({
  page,
  context,
  browser,
  personal,
}) => {
  const extra = await browser.newContext();
  try {
    expect(
      (
        await extra.request.post("/api/session", {
          headers: { origin: "http://127.0.0.1:10682" },
          data: { username: "collaborator", token: "token-b" },
        })
      ).status(),
    ).toBe(201);
    const { cookie } = await (
      await page.request.post("/_fixture/legacy")
    ).json();
    await context.addCookies([
      {
        name: "openfolio-session",
        value: cookie,
        url: "http://127.0.0.1:10682",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "恢复原工作台", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /恢复 .*@reader/ }).click();
    await expect(
      page.getByRole("heading", { name: "我的仓库", exact: true }),
    ).toBeVisible();
    expect(
      (await (await page.request.get("/api/session")).json()).workspace.id,
    ).toBe(personal.id);
    const reused = await page.request.get("/api/session", {
      headers: { cookie: `openfolio-session=${cookie}` },
    });
    const old = await reused.json();
    expect(old.connected).toBe(false);
    expect(old.legacyChoices ?? []).toHaveLength(0);
  } finally {
    await extra.close();
  }
});

for (const action of ["switch", "logout"])
  test(`late preferences cannot restore the old account after ${action}`, async ({
    page,
  }) => {
    await page.goto("/?m=connections");
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
    let finishPreferences: (() => Promise<void>) | undefined,
      finishSession: (() => Promise<void>) | undefined;
    await page.route("**/api/session/preferences", async (route) => {
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        finishPreferences = async () => {
          await route.fulfill({ response });
          resolve();
        };
      });
    });
    await page.getByRole("button", { name: "收起侧栏" }).click();
    await expect.poll(() => !!finishPreferences).toBe(true);
    await page.route("**/api/session", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      await new Promise<void>((resolve) => {
        finishSession = async () => {
          await route.fulfill({ response });
          resolve();
        };
      });
    });
    if (action === "switch") {
      await page.getByRole("button", { name: "切换凭据", exact: true }).click();
      await page
        .getByLabel("用户名（可选）", { exact: true })
        .fill("collaborator");
      await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
      await page
        .getByRole("button", { name: "切换并恢复", exact: true })
        .click();
    } else
      await page
        .getByRole("button", { name: "退出当前设备", exact: true })
        .click();
    await expect.poll(() => !!finishSession).toBe(true);
    await expect(page.locator(".personal-connection-card")).toHaveCount(0);
    await finishPreferences!();
    await expect(page.locator(".personal-connection-card")).toHaveCount(0);
    await finishSession!();
    if (action === "switch")
      await expect(page.locator(".personal-connection-card")).toContainText(
        "@collaborator",
      );
    else
      await expect(
        page.getByRole("heading", { name: "登录自己的工作台" }),
      ).toBeVisible();
  });
test("a single legacy choice restores automatically through POST", async ({
  page,
  context,
  personal,
}) => {
  const { cookie } = await (await page.request.post("/_fixture/legacy")).json();
  await context.addCookies([
    {
      name: "openfolio-session",
      value: cookie,
      url: "http://127.0.0.1:10682",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/?m=connections");
  await expect(
    page.getByRole("heading", { name: "当前凭据", exact: true }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/session")).json()).workspace.id,
  ).toBe(personal.id);
  expect(
    (await context.cookies()).find((c) => c.name === "openfolio-session")!
      .value,
  ).not.toBe(cookie);
});
