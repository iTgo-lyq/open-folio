import {
  test,
  expect,
  connectRequest,
  loginAccount,
  revisionHeaders,
  repositoryQuery,
  openAccountSettings,
  refreshCentral,
  tokenRows,
  openTokenMenu,
} from "./connected";
import type { Page } from "@playwright/test";
const current = (page: Page) => tokenRows(page).filter({ hasText: "当前使用" });
async function addOther(page: Page) {
  await page.getByRole("button", { name: "添加 Token", exact: true }).click();
  await page.getByLabel("名称（可选）", { exact: true }).fill("组织工程");
  await page.getByLabel("GitHub Token", { exact: true }).fill("token-b");
  await page.getByRole("button", { name: "验证并添加", exact: true }).click();
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
    await b.goto("/?m=home");
    await expect(
      b.getByRole("heading", { name: "选择已保存的 Token" }),
    ).toBeVisible();
    await expect(
      b.getByText(`当前账号：${personal.username}`, { exact: true }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "选择已有 Token", exact: true })
      .click();
    await b.getByRole("button", { name: "使用reader", exact: true }).click();
    await expect(current(b)).toContainText("@reader");
    await expect(current(page)).toContainText("@collaborator");
    await openTokenMenu(page, "组织工程");
    await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
    await page.getByLabel("名称", { exact: true }).fill("工作项目");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(tokenRows(b)).toContainText(["reader", "工作项目"]);
    await openTokenMenu(page, "reader");
    await page.getByRole("menuitem", { name: "解绑", exact: true }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await b.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(current(b)).toHaveCount(0);
    await expect(tokenRows(b)).toHaveCount(1);
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
  await expect(page.getByRole("navigation", { name: "能力目录" })).toHaveCount(
    0,
  );
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
    await openTokenMenu(page, "reader");
    await page.getByRole("menuitem", { name: "解绑", exact: true }).click();
    await page.getByRole("button", { name: "确认解绑" }).click();
    await view.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      view.getByRole("heading", { name: "绑定一个 GitHub Token", exact: true }),
    ).toBeVisible();
    await finish!();
    await expect(
      view.getByRole("navigation", { name: "能力目录" }),
    ).toHaveCount(0);
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
  await expect(tokenRows(page)).toHaveCount(2);
  await page.getByRole("button", { name: "使用组织工程", exact: true }).click();
  await expect(current(page)).toContainText("@collaborator");
});

test("failed Token switching keeps the current selection and exposes a recoverable error", async ({
  page,
}) => {
  await page.goto("/?m=connections");
  await addOther(page);
  const original = (await (await page.request.get("/api/session")).json())
    .workspace.id;
  await page.route("**/api/session/switch", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "GitHub 暂时无法响应，请稍后重试。",
        },
      },
    }),
  );
  await page.getByRole("button", { name: "使用reader", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "GitHub 暂时无法响应",
  );
  await expect(current(page)).toContainText("@collaborator");
  expect(
    (await (await page.request.get("/api/session")).json()).workspace.id,
  ).toBe(original);
  await openTokenMenu(page, "reader");
  await expect(
    page.getByRole("menuitem", { name: /复制 Token/ }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "reader 的更多操作" }),
  ).toBeFocused();
});

test("a second browser automatically restores the sole saved Token without submitting it again", async ({
  browser,
  page,
  personal,
}) => {
  const second = await browser.newContext();
  try {
    await loginAccount(second.request, personal.username);
    const view = await second.newPage();
    let submissions = 0;
    view.on("request", (r) => {
      if (
        new URL(r.url()).pathname === "/api/connections" &&
        r.method() === "POST"
      )
        submissions++;
    });
    await view.goto(`/?${repositoryQuery}&m=specs&s=platform`);
    await expect(
      view.getByRole("heading", { name: "工程协作", exact: true }),
    ).toBeVisible();
    expect(
      (await (await second.request.get("/api/session")).json()).workspace.id,
    ).toBe(personal.id);
    expect(
      (await (await page.request.get("/api/session")).json()).workspace.id,
    ).toBe(personal.id);
    expect(submissions).toBe(0);
  } finally {
    await second.close();
  }
});

test("failed automatic Token recovery preserves login and supports manual selection", async ({
  browser,
  personal,
}) => {
  const second = await browser.newContext();
  try {
    await loginAccount(second.request, personal.username);
    const view = await second.newPage();
    let attempts = 0;
    await view.route("**/api/session/switch", (route) => {
      attempts++;
      return route.fulfill({
        status: 503,
        json: {
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "GitHub 暂时无法响应",
          },
        },
      });
    });
    await view.goto("/?m=home");
    await expect(view.getByRole("main").getByRole("alert")).toContainText(
      "已有 Token 未能自动恢复",
    );
    await expect(
      view.getByRole("heading", { name: "选择已保存的 Token" }),
    ).toBeVisible();
    await view.evaluate(() => window.dispatchEvent(new Event("focus")));
    const session = await (await second.request.get("/api/session")).json();
    expect(session.authenticated).toBe(true);
    expect(session.connections).toHaveLength(1);
    expect(attempts).toBe(1);
    await view.unroute("**/api/session/switch");
    await view
      .getByRole("button", { name: "选择已有 Token", exact: true })
      .click();
    await view.getByRole("button", { name: "使用reader", exact: true }).click();
    await expect(current(view)).toContainText("@reader");
  } finally {
    await second.close();
  }
});

test("a delayed automatic recovery cannot overwrite a newer manual selection", async ({
  browser,
  personal,
}) => {
  const second = await browser.newContext();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await loginAccount(second.request, personal.username);
    const view = await second.newPage();
    let started = false;
    await view.route("**/api/session/switch", async (route) => {
      started = true;
      await held;
      await route.continue();
    });
    await view.goto("/?m=home");
    await expect.poll(() => started).toBe(true);
    const newer = await connectRequest(
      second.request,
      "token-b",
      personal.username,
    );
    const rejected = view.waitForResponse((r) =>
      r.url().endsWith("/api/session/switch"),
    );
    release();
    expect((await rejected).status()).toBe(409);
    await expect(
      view.getByRole("heading", { name: "选择已保存的 Token" }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await (await second.request.get("/api/session")).json()).workspace
            .id,
      )
      .toBe(newer.id);
    await view.goto("/?m=connections");
    await expect(current(view)).toContainText("@collaborator");
  } finally {
    release();
    await second.close();
  }
});
