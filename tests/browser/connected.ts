import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
export const repoKey = createHash("sha256")
  .update(JSON.stringify(["github", "fixture.test", "1"]))
  .digest("hex");
export const repositoryQuery = `repo=${repoKey}&provider=github&instance=fixture.test&repositoryId=1&fullName=acme%2Ffixture`;
export const origin = "http://127.0.0.1:10682";
export const testPassword = "fixture-password";
export async function revisionHeaders(request: APIRequestContext) {
  const session = await (await request.get("/api/session")).json();
  return { origin, "X-OpenFolio-Revision": String(session.browserRevision) };
}
export async function loginAccount(
  request: APIRequestContext,
  username: string,
) {
  const r = await request.post("/api/session", {
    headers: { origin },
    data: { username, password: testPassword },
  });
  expect(r.status()).toBe(201);
  return (await r.json()).session;
}
export async function connectRequest(
  request: APIRequestContext,
  token = "token-a",
  username?: string,
) {
  let session = await (await request.get("/api/session")).json();
  if (!session.authenticated) {
    if (username) session = await loginAccount(request, username);
    else {
      const r = await request.post("/api/accounts/register", {
        headers: { origin },
        data: { username: `user-${randomUUID()}`, password: testPassword },
      });
      expect(r.status()).toBe(201);
      session = (await r.json()).session;
    }
  }
  const response = await request.post("/api/connections", {
    headers: await revisionHeaders(request),
    data: { providerId: "github", token },
  });
  expect(response.status()).toBe(201);
  const result = await response.json(),
    id = result.connection.id;
  await expect
    .poll(
      async () =>
        (await (await request.get(`/api/connections/${id}/discovery`)).json())
          .discovery?.state,
    )
    .toBe("complete");
  const url = (path: string) =>
    `/api/repositories/${repoKey}/${path}${path.includes("?") ? "&" : "?"}connectionId=${id}`;
  const fresh = await request.post(url("refresh"), { headers: { origin } });
  expect(fresh.ok()).toBe(true);
  return { id, url, username: session.account.username as string };
}
export const test = base.extend<{
  personal: { id: string; url: (path: string) => string; username: string };
}>({
  personal: [
    async ({ context }, use) => {
      await context.request.post("/_fixture/control", {
        data: { reset: true, newSessionScope: true },
      });
      await use(await connectRequest(context.request));
    },
    { auto: true },
  ],
  request: async ({ context }, use) => use(context.request),
});
export { expect };
export async function waitForWorkbenchLayout(page: Page, width: number) {
  await expect
    .poll(async () =>
      Math.round((await page.getByRole("main").boundingBox())?.x ?? -1),
    )
    .toBe(width >= 761 ? 72 : 0);
}
// 壳层操作：顶栏直接刷新，更新时间弹层承载来源详情。
export async function openSyncStatus(page: Page) {
  await page.getByRole("button", { name: /^同步状态：/ }).click();
  return page.getByRole("dialog", { name: "读取来源" });
}
export async function refreshCentral(page: Page) {
  await page
    .locator("main > header")
    .getByRole("button", { name: "刷新中心仓库", exact: true })
    .click();
}
export async function openAccountSettings(page: Page) {
  await page.getByRole("button", { name: /^账号：/ }).click();
  await page.getByRole("menuitem", { name: "账号与 Token" }).click();
}
export const tokenRows = (page: Page) =>
  page
    .getByRole("list", { name: "已绑定 Token", exact: true })
    .getByRole("listitem");
export async function openTokenMenu(page: Page, label: string) {
  await page
    .getByRole("button", { name: `${label} 的更多操作`, exact: true })
    .click();
  return page.getByRole("menu", { name: "Token 操作" });
}
export async function copyCurrentToken(page: Page) {
  await tokenRows(page)
    .filter({ hasText: "当前使用" })
    .getByRole("button", { name: /的更多操作$/ })
    .click();
  await page.getByRole("menuitem", { name: "复制 Token", exact: true }).click();
}
export async function logoutCurrent(page: Page) {
  await page
    .getByRole("region", { name: "账号", exact: true })
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "退出这台设备？" })
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
}
export async function readingLink(page: Page) {
  await expect(
    page.getByRole("button", { name: "复制页面链接", exact: true }),
  ).toHaveCount(0);
  if (new URL(page.url()).searchParams.get("m") === "specs")
    await expect
      .poll(() => new URL(page.url()).searchParams.get("branch"))
      .not.toBeNull();
  return page.url();
}
export async function openChangeFilters(page: Page) {
  const menu = page.getByRole("menu", { name: /^筛选/ });
  if (!(await menu.isVisible()))
    await page.getByRole("button", { name: /^筛选(?:，|$)/ }).click();
  return menu;
}
export async function changeDisplay(page: Page, label: string) {
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}
export const changeLinks = (page: Page) =>
  page
    .getByRole("region", { name: "Change 列表", exact: true })
    .getByRole("link", { name: /^打开 / });
export const changeRow = (page: Page, title: string) =>
  page
    .getByRole("link", { name: `打开 ${title}`, exact: true })
    .locator("..")
    .locator("..");
export async function openMaterial(page: Page, title: string) {
  let nav = page.getByRole("navigation", { name: "Change 材料", exact: true });
  if (!(await nav.isVisible()))
    await page.getByRole("button", { name: /^Change 材料：/ }).click();
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await nav
    .getByRole("link", { name: new RegExp(`^${escaped}(?:$|\\s)`) })
    .click();
}
export async function backToChanges(page: Page) {
  await page
    .getByRole("button", { name: "返回 Changes 列表", exact: true })
    .click();
}

export async function copyPublicPreviewLink(page: Page) {
  await page.getByRole("button", { name: "公开链接", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "公开链接", exact: true });
  await expect(menu.getByLabel("公开链接", { exact: true })).not.toHaveValue(
    "",
  );
  await menu.getByRole("button", { name: "复制公开链接", exact: true }).click();
  await menu.getByRole("button", { name: "关闭公开链接", exact: true }).click();
}
