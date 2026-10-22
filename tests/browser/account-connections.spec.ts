import {
  test,
  expect,
  connectRequest,
  loginAccount,
  revisionHeaders,
  repositoryQuery,
  openAccountSettings,
  refreshCentral,
} from "./connected";
import type { Page } from "@playwright/test";
const current = (page: Page) =>
  page.locator(".personal-identity-row").filter({ hasText: "当前使用" });
async function addOther(page: Page) {
  await page.getByRole("button", { name: "绑定 Token", exact: true }).click();
  await page.getByLabel("名称（可选）", { exact: true }).fill("组织工程");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
  await page.getByRole("button", { name: "绑定并使用", exact: true }).click();
  await expect(current(page)).toContainText("@collaborator");
}
test("another browser logs in without Token, sees account bindings, and selects independently", async ({
  page,
  browser,
  personal,
}) => {
  await page.goto("/?m=connections");
  await addOther(page);
  const second = await browser.newContext();
  try {
    const session = await loginAccount(second.request, personal.username);
    expect(session.connected).toBe(false);
    expect(session.connections).toHaveLength(2);
    const b = await second.newPage();
    await b.goto("/?m=connections");
    await b.getByRole("button", { name: "使用reader", exact: true }).click();
    await expect(current(b)).toContainText("@reader");
    await expect(current(page)).toContainText("@collaborator");
    await page
      .getByRole("button", { name: "命名组织工程", exact: true })
      .click();
    await page.getByLabel("名称", { exact: true }).fill("工作项目");
    await page.getByRole("button", { name: "保存名称" }).click();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(b.locator(".personal-identity-row")).toContainText([
      "reader",
      "工作项目",
    ]);
    await page.getByRole("button", { name: "解绑reader", exact: true }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(current(b)).toHaveCount(0);
    await expect(b.locator(".personal-identity-row")).toHaveCount(1);
    expect(
      (await (await second.request.get("/api/session")).json()).authenticated,
    ).toBe(true);
    await expect(current(page)).toContainText("工作项目");
  } finally {
    await second.close();
  }
});
test("same-browser tabs ignore a delayed old session and synchronize A-B-A without resubmitting Tokens", async ({
  page,
  context,
}) => {
  await page.goto("/?m=connections");
  const other = await context.newPage();
  await other.goto("/?m=connections");
  await expect(current(other)).toContainText("@reader");
  let finish: (() => Promise<void>) | undefined,
    held = false;
  await other.route("**/api/session", async (route) => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true;
    const response = await route.fetch();
    await new Promise<void>((resolve) => {
      finish = async () => {
        await route.fulfill({ response }).catch(() => {});
        resolve();
      };
    });
  });
  await other.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => !!finish).toBe(true);
  try {
    await addOther(page);
    await expect(current(other)).toContainText("@collaborator");
    await finish!();
    await expect(current(other)).toContainText("@collaborator");
    let submissions = 0;
    page.on("request", (r) => {
      if (
        new URL(r.url()).pathname === "/api/connections" &&
        r.method() === "POST"
      )
        submissions++;
    });
    await page.getByRole("button", { name: "使用reader", exact: true }).click();
    await expect(current(other)).toContainText("@reader");
    await page
      .getByRole("button", { name: "使用组织工程", exact: true })
      .click();
    await expect(current(other)).toContainText("@collaborator");
    await page.getByRole("button", { name: "使用reader", exact: true }).click();
    await expect(current(other)).toContainText("@reader");
    expect(submissions).toBe(0);
  } finally {
    await finish?.();
    await other.close();
  }
});
test("the same Token bound to another account has a separate workspace and cannot use the owner's id", async ({
  browser,
  personal,
}) => {
  const second = await browser.newContext();
  try {
    const b = await connectRequest(second.request);
    expect(b.id).not.toBe(personal.id);
    const attack = await second.request.post("/api/session/switch", {
      headers: await revisionHeaders(second.request),
      data: { connectionId: personal.id },
    });
    expect(attack.status()).toBe(404);
    expect(
      (await (await second.request.get("/api/session")).json()).connections.map(
        (c: { id: string }) => c.id,
      ),
    ).toEqual([b.id]);
  } finally {
    await second.close();
  }
});
test("A-B-A selection discards a delayed repository response from the first A", async ({
  page,
  personal,
}) => {
  const original = await (
    await page.request.get(personal.url("workbench"))
  ).json();
  await page.goto("/?m=connections");
  await addOther(page);
  await page.getByRole("button", { name: "使用reader", exact: true }).click();
  await expect(current(page)).toContainText("@reader");
  let finish: (() => Promise<void>) | undefined,
    held = false;
  await page.route("**/workbench?*", async (route) => {
    if (held) return route.continue();
    held = true;
    await new Promise<void>((resolve) => {
      finish = async () => {
        await route.fulfill({ json: original }).catch(() => {});
        resolve();
      };
    });
  });
  await page.goto(`/?${repositoryQuery}&m=specs`);
  await expect.poll(() => !!finish).toBe(true);
  await openAccountSettings(page);
  await expect(current(page)).toContainText("@reader");
  await page.getByRole("button", { name: "使用组织工程", exact: true }).click();
  await expect(current(page)).toContainText("@collaborator");
  await page.getByRole("button", { name: "使用reader", exact: true }).click();
  await expect(current(page)).toContainText("@reader");
  await finish!();
  await expect(page.locator(".specs-tree")).toHaveCount(0);
  await expect(current(page)).toContainText("@reader");
});

test("unbinding in another browser prevents a delayed old private response from returning", async ({
  page,
  browser,
  personal,
}) => {
  const original = await (
    await page.request.get(personal.url("workbench"))
  ).json();
  await page.goto("/?m=connections");
  const second = await browser.newContext();
  let finish: (() => Promise<void>) | undefined;
  try {
    await connectRequest(second.request, "token-a", personal.username);
    const view = await second.newPage();
    await view.route("**/workbench?*", async (route) => {
      await new Promise<void>((resolve) => {
        finish = async () => {
          await route.fulfill({ json: original }).catch(() => {});
          resolve();
        };
      });
    });
    await view.goto(`/?${repositoryQuery}&m=specs`);
    await expect.poll(() => !!finish).toBe(true);
    await page.getByRole("button", { name: "解绑reader", exact: true }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await view.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      view.getByRole("heading", { name: "Token 管理", exact: true }),
    ).toBeVisible();
    await finish!();
    await expect(view.locator(".specs-tree")).toHaveCount(0);
    expect(
      (await (await second.request.get("/api/session")).json()).authenticated,
    ).toBe(true);
  } finally {
    await finish?.();
    await second.close();
  }
});
test("revoked active Token clears private content while the account can select another binding", async ({
  page,
  request,
}) => {
  await page.goto("/?m=connections");
  await addOther(page);
  await page.getByRole("button", { name: "使用reader", exact: true }).click();
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform`);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await request.post("/_fixture/control", {
    data: { revoke: "token-a", advancePermissions: 300000 },
  });
  await refreshCentral(page);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toHaveCount(0);
  expect((await (await request.get("/api/session")).json()).authenticated).toBe(
    true,
  );
  await page.goto("/?m=connections");
  await expect(page.locator(".personal-identity-row")).toHaveCount(2);
  await page.getByRole("button", { name: "使用组织工程", exact: true }).click();
  await expect(current(page)).toContainText("@collaborator");
});
