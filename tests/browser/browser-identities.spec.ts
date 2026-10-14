import { test, expect } from "./connected";
import type { Page } from "@playwright/test";
async function addOther(page: Page) {
  await page.getByRole("button", { name: "添加身份", exact: true }).click();
  await page.getByLabel("用户名（可选）", { exact: true }).fill("组织工程");
  await page.getByLabel("GitHub token", { exact: true }).fill("token-b");
  await page.getByRole("button", { name: "添加并使用", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@collaborator",
  );
}
test("saved identities switch A-B-A without submitting token and retain each workspace", async ({
  page,
  personal,
}) => {
  await page.goto("/?m=connections");
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  await addOther(page);
  await expect(page.locator(".personal-identity-row")).toHaveCount(2);
  let tokenSubmissions = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/session" && r.method() === "POST")
      tokenSubmissions++;
  });
  await page.getByRole("button", { name: "切换到reader", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  expect(
    (await (await page.request.get("/api/session")).json()).workspace.id,
  ).toBe(personal.id);
  await page
    .getByRole("button", { name: "切换到组织工程", exact: true })
    .click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@collaborator",
  );
  await page.getByRole("button", { name: "切换到reader", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  expect(tokenSubmissions).toBe(0);
  await expect(page.getByLabel("GitHub token", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".personal-identity-row")).toHaveCount(2);
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
});
test("other tabs clear their identity immediately and ignore a delayed old session response", async ({
  page,
  context,
}) => {
  await page.goto("/?m=connections");
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  const other = await context.newPage();
  await other.goto("/?m=connections");
  await expect(other.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  let finish: (() => Promise<void>) | undefined,
    held = false;
  await other.route("**/api/session", async (route) => {
    if (held || route.request().method() !== "GET") return route.continue();
    held = true;
    const response = await route.fetch();
    await new Promise<void>((resolve) => {
      finish = async () => {
        await route.fulfill({ response });
        resolve();
      };
    });
  });
  await other.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => !!finish).toBe(true);
  try {
    await addOther(page);
    await expect(other.locator(".personal-connection-card")).toContainText(
      "@collaborator",
    );
    await finish!();
    finish = undefined;
    await expect(other.locator(".personal-connection-card")).toContainText(
      "@collaborator",
    );
    await page
      .getByRole("button", { name: "切换到reader", exact: true })
      .click();
    await expect(other.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
  } finally {
    if (finish) await finish();
    await other.close();
  }
});
for (const width of [1440, 834, 390, 320])
  test(`identity removal, selection and keyboard focus fit ${width}px`, async ({
    page,
    personal,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?m=connections");
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
    await addOther(page);
    await page
      .getByRole("button", { name: "切换到reader", exact: true })
      .click();
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
    const original = await (await page.request.get("/api/session")).json();
    const remove = page.getByRole("button", {
      name: "移除组织工程",
      exact: true,
    });
    await remove.click();
    await page.keyboard.press("Escape");
    await expect(remove).toBeFocused();
    await remove.click();
    await page.getByRole("button", { name: "移除身份", exact: true }).click();
    await expect(page.locator(".personal-identity-row")).toHaveCount(1);
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
    expect(
      (await (await page.request.get("/api/session")).json()).selectionRevision,
    ).toBe(original.selectionRevision);
    await addOther(page);
    await page.screenshot({
      path: `artifacts/browser-identities-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "移除组织工程", exact: true })
      .click();
    await page.getByRole("button", { name: "移除身份", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "选择身份", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "切换到reader", exact: true })
      .click();
    await expect(page.locator(".personal-connection-card")).toContainText(
      "@reader",
    );
    expect(
      (await (await page.request.get("/api/session")).json()).workspace.id,
    ).toBe(personal.id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("a failed saved-token switch keeps the current identity and permits retry after a temporary failure", async ({
  page,
}) => {
  await page.goto("/?m=connections");
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  await addOther(page);
  await page.getByRole("button", { name: "切换到reader", exact: true }).click();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  await page.request.post("/_fixture/control", { data: { unavailable: true } });
  await page
    .getByRole("button", { name: "切换到组织工程", exact: true })
    .click();
  await expect(
    page.getByText("平台暂时不可达，请重试。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
  await page.request.post("/_fixture/control", {
    data: { unavailable: false, revoke: "token-b" },
  });
  await page
    .getByRole("button", { name: "切换到组织工程", exact: true })
    .click();
  await expect(
    page.getByText("token 已失效，请替换连接。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".personal-identity-row")).toHaveCount(2);
  await expect(page.locator(".personal-connection-card")).toContainText(
    "@reader",
  );
});
test("focus recovery after A-B-A without BroadcastChannel restarts the repository list at its first page", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", {
      configurable: true,
      value: undefined,
    }),
  );
  const cursors: number[] = [];
  let savedSample: unknown;
  await page.route("**/api/repositories?*", async (route) => {
    const response = await route.fetch(),
      original = await response.json();
    const cursor = Number(
      new URL(route.request().url()).searchParams.get("cursor") ?? 0,
    );
    cursors.push(cursor);
    const sample = original.items[0] ?? savedSample;
    if (!sample) throw Error("Fixture repository sample missing");
    savedSample = sample;
    const items = Array.from({ length: cursor ? 2 : 20 }, (_, i) => ({
      ...sample,
      key: (cursor + i + 1).toString(16).padStart(64, "0"),
      repository: {
        ...sample.repository,
        repositoryId: `fixture-${cursor + i}`,
        fullName: `acme/fixture-${cursor + i}`,
      },
    }));
    await route.fulfill({
      json: { ...original, items, nextOffset: cursor ? null : 20 },
    });
  });
  await page.goto("/?m=home");
  await expect(page.locator(".personal-repo-row")).toHaveCount(20);
  await page.getByRole("button", { name: "加载更多", exact: true }).click();
  await expect(page.locator(".personal-repo-row")).toHaveCount(22);
  const initial = await (await page.request.get("/api/session")).json();
  const added = await page.request.post("/api/session", {
    headers: {
      origin: "http://127.0.0.1:10682",
      "X-OpenFolio-Revision": String(initial.browserRevision),
    },
    data: { token: "token-b" },
  });
  expect(added.status()).toBe(201);
  const other = await added.json();
  const switched = await page.request.post("/api/session/switch", {
    headers: {
      origin: "http://127.0.0.1:10682",
      "X-OpenFolio-Revision": String(other.session.browserRevision),
    },
    data: { identityId: initial.deviceSessionId },
  });
  expect(switched.status()).toBe(200);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".personal-repo-row")).toHaveCount(20);
  expect(cursors.at(-1)).toBe(0);
});
