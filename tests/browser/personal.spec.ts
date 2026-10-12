import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
});
async function connect(
  page: import("@playwright/test").Page,
  token = "token-a",
) {
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "登录并发现仓库" }).click();
  await expect(
    page.getByRole("heading", { name: "我的仓库", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
}
test("anonymous onboarding discovers personal repositories and restores the encrypted session", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /你的工程工作台/ }),
  ).toBeVisible();
  await expect(
    page.locator('.module-rail [aria-label="Specs"]'),
  ).toHaveAttribute("aria-disabled", "true");
  await connect(page);
  await expect(page.locator(".module-rail")).toHaveCSS("width", "84px");
  await page.screenshot({
    path: "artifacts/personal-home-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  const stored = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    cookies: document.cookie,
  }));
  expect(JSON.stringify(stored)).not.toContain("token-a");
  expect(stored.cookies).not.toContain("openfolio-session");
  await page.getByRole("button", { name: "收起侧栏" }).click();
  await expect(page.getByRole("button", { name: "展开侧栏" })).toBeVisible();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("button", { name: "用仓库地址检查" }).click();
  await page
    .getByLabel("GitHub HTTPS 仓库地址")
    .fill("https://github.com/acme/fixture");
  await page.getByRole("button", { name: "检查仓库", exact: true }).click();
  await expect(page.getByText("已接入，可以阅读")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "用仓库地址检查" }),
  ).toBeFocused();
});
test("optional username defaults to the Git account and accepts a custom name across devices", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  const username = page.getByLabel("用户名（可选）", { exact: true });
  await expect(username).not.toHaveAttribute("required", "");
  await expect(username).toHaveValue("");
  await expect(
    page.getByLabel("工作台名称（可选）", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("GitHub token", { exact: true }).fill("token-a");
  await page.getByRole("button", { name: "登录并发现仓库" }).click();
  await expect(page.locator(".personal-current-account")).toContainText(
    "reader",
  );
  const original = await (await page.request.get("/api/session")).json();
  await page.locator('.module-rail [aria-label="当前凭据"]').click();
  await page.getByRole("button", { name: "切换凭据", exact: true }).click();
  await username.fill("我的 用户名: 自定义");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-a");
  await page.getByRole("button", { name: "切换并恢复", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "我的 用户名: 自定义",
  );
  const current = await (await page.request.get("/api/session")).json();
  expect(current.workspace.id).toBe(original.workspace.id);
  expect(current.workspace.identity.login).toBe("reader");
  const second = await browser.newContext();
  try {
    const response = await second.request.post("/api/session", {
      headers: { origin: "http://127.0.0.1:10682" },
      data: { token: "token-a" },
    });
    expect(response.status()).toBe(201);
    const restored = await response.json();
    expect(restored.connection.id).toBe(original.workspace.id);
    expect(restored.connection.label).toBe("我的 用户名: 自定义");
    const other = await second.newPage();
    await other.goto("/?m=connections");
    await expect(other.locator(".personal-connection-card")).toContainText(
      "我的 用户名: 自定义",
    );
  } finally {
    await second.close();
  }
});
test("invalid credentials, replacement rollback, removal and logout remain explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.getByLabel("用户名（可选）", { exact: true }).fill("reader");
  await page.getByLabel("GitHub token", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "登录并发现仓库" }).click();
  await expect(page.getByRole("alert")).toContainText("失效");
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Escape");
  await connect(page);
  await page.locator('.module-rail [aria-label="当前凭据"]').click();
  await page.getByRole("button", { name: "切换凭据", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "切换并恢复", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("失效");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看仓库" }).click();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  await page.locator('.module-rail [aria-label="当前凭据"]').click();
  await page.getByRole("button", { name: "退出当前设备" }).click();
  await expect(
    page.getByRole("heading", { name: "登录自己的工作台" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "登录工作台", exact: true }).click();
  await page.getByLabel("用户名（可选）", { exact: true }).fill("reader");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-a");
  await page
    .getByRole("button", { name: "登录并发现仓库", exact: true })
    .click();
  await expect(page.locator(".personal-connection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "退出全部设备", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toHaveCount(0);
});
for (const width of [834, 390, 320])
  test(`personal glass shell fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await connect(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 760)
      await expect(page.locator(".mobile-navigation")).toBeVisible();
    await page.screenshot({
      path: `artifacts/personal-home-${width}.png`,
      fullPage: true,
    });
  });
test("switching credentials restores only the current token and revoked permissions hide cached names", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await connect(page);
  await page.locator('.module-rail [aria-label="当前凭据"]').click();
  await page.getByRole("button", { name: "切换凭据", exact: true }).click();
  await page.getByLabel("用户名（可选）", { exact: true }).fill("范围 B");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
  await page.getByRole("button", { name: "切换并恢复", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toHaveCount(1);
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@collaborator",
  );
  await page.goto("/");
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  await request.post("/_fixture/control", { data: { revoke: "token-b" } });
  await page.reload();
  await expect(
    page.getByRole("alert").filter({ hasText: "token 已失效，请替换连接。" }),
  ).toBeVisible();
  await expect(page.locator(".personal-repo-row")).toHaveCount(0);
});

test("a checked repository opens even when it is not on the current directory page", async ({
  page,
}) => {
  await page.goto("/");
  await connect(page);
  await page.route("**/api/repositories?*", (route) =>
    route.fulfill({ json: { items: [], unavailable: 0, nextOffset: 20 } }),
  );
  await page.getByRole("button", { name: "用仓库地址检查" }).click();
  await page
    .getByLabel("GitHub HTTPS 仓库地址")
    .fill("https://github.com/acme/fixture");
  await page.getByRole("button", { name: "检查仓库", exact: true }).click();
  await expect(page.getByText("已接入，可以阅读")).toBeVisible();
  await page.getByRole("button", { name: "打开仓库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "交付记录", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("repositoryId")).toBe("1");
});
