import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { testPassword } from "./connected";
test.beforeEach(async ({ request }) => {
  await request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
});
async function register(page: Page) {
  const username = `user-${randomUUID()}`;
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByLabel("确认密码", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "创建并登录" }).click();
  await expect(
    page.getByRole("heading", { name: "Token 管理", exact: true }),
  ).toBeVisible();
  return username;
}
async function bind(page: Page, token = "token-a") {
  await page.getByRole("button", { name: "绑定 Token", exact: true }).click();
  await page.getByLabel("GitHub token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "绑定并使用", exact: true }).click();
}
test("self registration, first Token, repository reading and browser reopen", async ({
  page,
}) => {
  await page.goto("/");
  await register(page);
  await expect(
    page.getByRole("heading", { name: "还没有绑定 Token" }),
  ).toBeVisible();
  await bind(page);
  await expect(
    page.getByRole("heading", { name: "我的仓库", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".personal-repo-row")).toHaveCount(1);
  const state = await page.evaluate(
    () =>
      JSON.stringify(localStorage) +
      JSON.stringify(sessionStorage) +
      document.cookie,
  );
  expect(state).not.toContain("token-a");
  expect(state).not.toContain(testPassword);
  expect(state).not.toContain("openfolio-account");
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
});
test("invalid binding preserves account and selected Token, logout preserves bindings", async ({
  page,
}) => {
  await page.goto("/");
  const username = await register(page);
  await bind(page, "wrong");
  await expect(page.getByRole("alert")).toContainText("失效");
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Escape");
  await bind(page);
  await page.goto("/?m=connections");
  const original = await (await page.request.get("/api/session")).json();
  await bind(page, "wrong");
  await expect(page.getByRole("alert")).toContainText("失效");
  await page.keyboard.press("Escape");
  expect(
    (await (await page.request.get("/api/session")).json()).workspace.id,
  ).toBe(original.workspace.id);
  await page.getByRole("tab", { name: "登录设备", exact: true }).click();
  await page.getByRole("button", { name: "退出当前设备" }).click();
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "账号或密码错误" }),
  ).toContainText("账号或密码错误");
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  await page.getByLabel("密码", { exact: true }).press("Enter");
  await expect(page.locator(".personal-identity-row")).toHaveCount(1);
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
    await expect(page.locator(".personal-repo-row")).toHaveCount(1);
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
    page.getByRole("heading", { name: "Token 管理", exact: true }),
  ).toBeVisible();
});
