import { test, expect } from "./connected.ts";
test("deployment limits and upload discovery stay separate from personal connections", async ({
  request,
  page,
  browser,
}) => {
  expect((await request.get("/api/config")).status()).toBe(401);
  expect((await request.get("/api/prototype-hosting")).status()).toBe(401);
  await page.goto("/?m=connections");
  await expect(page.getByRole("heading", { name: "Token 管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加项目" })).toHaveCount(0);
  const ops = await browser.newContext();
  try {
    expect(
      (
        await ops.request.post("/api/access", {
          data: { secret: "fixture-admin-password" },
        })
      ).ok(),
    ).toBe(true);
    const snapshot = await (await ops.request.get("/api/config")).json();
    expect(snapshot.config.schemaVersion).toBe(2);
    expect(snapshot.config.projects).toBeUndefined();
    expect(JSON.stringify(snapshot)).not.toContain("fixture-invitation");
    const save = await ops.request.put("/api/config", {
      data: {
        config: { schemaVersion: 2, limits: { branches: 256 } },
        revision: snapshot.revision,
      },
    });
    expect(save.ok()).toBe(true);
    const updated = await save.json();
    expect(
      (
        await ops.request.put("/api/config", {
          data: {
            config: { schemaVersion: 2, projects: [] },
            revision: updated.revision,
          },
        })
      ).status(),
    ).toBe(400);
    const hosting = await ops.request.get("/api/prototype-hosting");
    expect(hosting.ok()).toBe(true);
    expect((await hosting.json()).uploadPath).toContain(
      "/api/prototype-uploads/",
    );
  } finally {
    await ops.close();
  }
});
