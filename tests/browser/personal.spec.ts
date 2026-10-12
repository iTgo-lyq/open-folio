import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => {
  await request.post("/_fixture/control", { data: { reset: true } });
});
async function connect(
  page: import("@playwright/test").Page,
  token = "token-a",
) {
  await page.getByRole("button", { name: "连接 GitHub", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "连接并发现仓库" }).click();
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
test("invalid credentials, replacement rollback, removal and logout remain explicit", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "连接 GitHub", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "连接并发现仓库" }).click();
  await expect(page.getByRole("alert")).toContainText("失效");
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Escape");
  await connect(page);
  await page.locator('.module-rail [aria-label="我的连接"]').click();
  await page.getByRole("button", { name: "替换 token", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
  await page
    .getByRole("button", { name: "替换 token", exact: true })
    .last()
    .click();
  await expect(page.getByRole("alert")).toContainText("其他账号");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "查看仓库" }).click();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  await page.locator('.module-rail [aria-label="我的连接"]').click();
  await page.getByRole("button", { name: "移除连接" }).click();
  await expect(
    page.getByRole("heading", { name: "还没有个人连接" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "添加连接" }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill("token-a");
  await page.getByRole("button", { name: "连接并发现仓库" }).click();
  await expect(page.locator(".personal-connection-card")).toHaveCount(1);
  await page.getByRole("button", { name: "退出工作台" }).click();
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
test("multiple connections require an explicit choice on return and failed authorization hides cached names", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await connect(page);
  await page.locator('.module-rail [aria-label="我的连接"]').click();
  await page.getByRole("button", { name: "添加连接" }).click();
  await page.getByLabel("连接名称（可选）").fill("范围 B");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
  await page.getByRole("button", { name: "连接并发现仓库" }).click();
  await expect(page.locator(".personal-connection-card")).toHaveCount(2);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "选择一个连接" }),
  ).toBeVisible();
  await page
    .getByLabel("当前连接")
    .selectOption({ label: "范围 B · @collaborator" });
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  await request.post("/_fixture/control", { data: { revoke: "token-b" } });
  await page.reload();
  await page
    .getByLabel("当前连接")
    .selectOption({ label: "范围 B · @collaborator" });
  await expect(page.getByText("token 已失效，请替换连接。")).toBeVisible();
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
