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
