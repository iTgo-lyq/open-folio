import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  connectRequest,
  testPassword,
  logoutCurrent,
  tokenRows,
} from "./connected";
test.beforeEach(async ({ request }) => {
  await request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
});
async function register(page: Page) {
  const username = `user-${randomUUID()}`;
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByLabel("确认密码", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(
    page.getByRole("heading", { name: "绑定一个 GitHub Token", exact: true }),
  ).toBeVisible();
  return username;
}
async function bind(page: Page, token = "token-a") {
  await page.getByRole("button", { name: "添加 Token", exact: true }).click();
  await page.getByLabel("GitHub Token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "验证并添加", exact: true }).click();
}
test("self registration, first Token, repository reading and browser reopen", async ({
  page,
}) => {
  await page.goto("/");
  await register(page);
  await expect(
    page.getByRole("heading", { name: "绑定一个 GitHub Token" }),
  ).toBeVisible();
  await bind(page);
  await expect(
    page.getByRole("heading", { name: "我的仓库", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "可阅读的仓库" }).getByRole("link"),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("list", { name: "可阅读的仓库" }).getByRole("link"),
  ).toHaveCount(1);
  const state = await page.evaluate(
    () =>
      JSON.stringify(localStorage) +
      JSON.stringify(sessionStorage) +
      document.cookie,
  );
  expect(state).not.toContain("token-a");
  expect(state).not.toContain(testPassword);
  expect(state).not.toContain("openfolio-account");
  await page.getByRole("button", { name: "添加仓库" }).click();
  await page
    .getByLabel("GitHub HTTPS 仓库地址")
    .fill("https://github.com/acme/fixture");
  await page.getByRole("button", { name: "检查仓库", exact: true }).click();
  await expect(page.getByText("已接入，可以阅读")).toBeVisible();
  await page.getByRole("button", { name: "打开仓库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "交付记录", exact: true }),
  ).toBeVisible();
});
test("invalid binding preserves account and selected Token, logout preserves bindings", async ({
  page,
}) => {
  await page.goto("/");
  const username = await register(page);
  await bind(page, "wrong");
  await expect(
    page.getByRole("dialog", { name: "添加 Token" }).getByRole("alert"),
  ).toContainText("失效");
  await expect(page.getByLabel("GitHub Token", { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Escape");
  await bind(page);
  await page.goto("/?m=connections");
  const original = await (await page.request.get("/api/session")).json();
  await bind(page, "wrong");
  await expect(
    page.getByRole("dialog", { name: "添加 Token" }).getByRole("alert"),
  ).toContainText("失效");
  await page.keyboard.press("Escape");
  expect(
    (await (await page.request.get("/api/session")).json()).workspace.id,
  ).toBe(original.workspace.id);
  await logoutCurrent(page);
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page
      .getByRole("main")
      .getByRole("alert")
      .filter({ hasText: "账号或密码错误" }),
  ).toContainText("账号或密码错误");
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByLabel("密码", { exact: true }).press("Enter");
  await expect(tokenRows(page)).toHaveCount(1);
  const resumed = await (await page.request.get("/api/session")).json();
  expect(resumed.authenticated).toBe(true);
  expect(resumed.connected).toBe(false);
});
for (const width of [834, 390, 320])
  test(`account form and bindings fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await register(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await bind(page);
    await expect(
      page.getByRole("list", { name: "可阅读的仓库" }).getByRole("link"),
    ).toHaveCount(1);
    await page.goto("/?m=connections");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/account-${width}.png`,
      fullPage: true,
    });
  });

test("legal Unicode credentials can be entered unchanged in the password form", async ({
  page,
}) => {
  const username = "🌿".repeat(40) + randomUUID().slice(0, 8),
    password = "🔐".repeat(80) + "安全";
  const response = await page.request.post("/api/accounts/register", {
    headers: { origin: "http://127.0.0.1:10682" },
    data: { username, password },
  });
  expect(response.status()).toBe(201);
  const session = (await response.json()).session;
  expect(
    (
      await page.request.delete("/api/session", {
        headers: {
          origin: "http://127.0.0.1:10682",
          "X-OpenFolio-Revision": String(session.browserRevision),
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await expect(page.getByLabel("账号", { exact: true })).toHaveValue(username);
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "绑定一个 GitHub Token", exact: true }),
  ).toBeVisible();
});

test("authentication stays separate from navigation and reports duplicate accounts and login limits", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "登录 OpenFolio" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await page.getByRole("button", { name: "注册", exact: true }).click();
  await page.getByLabel("账号", { exact: true }).fill("duplicate-user");
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByLabel("确认密码").fill("different-password");
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "两次密码不一致。",
  );
  await page.getByLabel("确认密码").fill(testPassword);
  await page.route("**/api/accounts/register", (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: "ACCOUNT_EXISTS", message: "账号已被使用。" } },
    }),
  );
  await page.getByRole("button", { name: "注册并登录" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "账号已被使用。",
  );
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.route("**/api/session", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 429,
          json: {
            error: {
              code: "AUTH_RATE_LIMITED",
              message: "登录尝试过多，请稍后再试。",
            },
          },
        })
      : route.continue(),
  );
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "登录尝试过多，请稍后再试。",
  );
  await expect(page.getByLabel("账号", { exact: true })).toHaveValue(
    "duplicate-user",
  );
});

test("repository directory groups problems and keeps the intended layout in both themes", async ({
  page,
}) => {
  await connectRequest(page.request);
  const response = await page.request.get("/api/session");
  const session = await response.json();
  const directory = await (
    await page.request.get(
      `/api/repositories?connectionId=${session.workspace.id}&cursor=0`,
    )
  ).json();
  const item = directory.items[0];
  await page.route("**/api/repositories?*", (route) =>
    route.fulfill({
      json: {
        ...directory,
        items: [
          item,
          {
            ...item,
            key: "problem-repository",
            state: "attention",
            message: "workflow.json 缺少集成分支。",
            repository: {
              ...item.repository,
              displayName: "Design Kit",
              fullName: "acme/design-kit",
              webUrl: "https://github.com/acme/design-kit",
            },
          },
        ],
      },
    }),
  );
  for (const width of [1440, 834, 320])
    for (const theme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?m=home");
      const readable = page.getByRole("list", { name: "可阅读的仓库" });
      await expect(readable.getByRole("link")).toHaveCount(1);
      await expect(
        page.getByRole("list", { name: "需要处理的仓库" }),
      ).toContainText("workflow.json 缺少集成分支。");
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "我的仓库", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `/tmp/of-refactor-home-${width}-${theme}.png`,
      });
    }
  await page
    .getByRole("list", { name: "需要处理的仓库" })
    .getByRole("button", { name: "重新检查" })
    .click();
  await expect(page.getByLabel("GitHub HTTPS 仓库地址")).toHaveValue(
    "https://github.com/acme/design-kit",
  );
  await page.keyboard.press("Escape");
});
