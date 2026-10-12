import { test, expect } from "@playwright/test";
import { connectRequest, repoKey } from "./connected.ts";
test("legacy invites and administrator sessions cannot grant repository reads", async ({
  page,
  request,
}) => {
  await request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
  const invite = await request.post("/api/access", {
    data: { project: "fixture", secret: "fixture-invitation" },
  });
  expect(invite.status()).toBe(410);
  expect(
    (
      await request.post("/api/access", {
        data: { secret: "fixture-admin-password" },
      })
    ).ok(),
  ).toBe(true);
  for (const path of [
    "/api/projects",
    "/api/projects/fixture/workbench",
    "/api/projects/fixture/documents/x",
    "/api/projects/fixture/assets/x",
    "/api/projects/fixture/previews/x",
    "/api/projects/fixture/thumbnails/x",
  ]) {
    expect((await request.get(path)).status()).toBe(410);
    expect((await request.head(path)).status()).toBe(410);
  }
  expect(
    (
      await request.get(
        `/api/repositories/${repoKey}/workbench?connectionId=00000000-0000-4000-8000-000000000000`,
      )
    ).status(),
  ).toBe(401);
  const denied = await request.post("/api/legacy-projects/fixture/resolve", {
    headers: { origin: "http://127.0.0.1:10682" },
    data: { connectionId: "00000000-0000-4000-8000-000000000000" },
  });
  expect(denied.status()).toBe(401);
  expect(await denied.text()).not.toContain("acme");
  await page.goto("/?project=fixture&m=specs#invite=fixture-invitation");
  await expect(
    page.getByRole("button", { name: "登录工作台", exact: true }),
  ).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await expect(page.getByRole("button", { name: "保存配置" })).toHaveCount(0);
});
test("a legacy deep link recovers through the reader's own connection without importing old grants", async ({
  page,
  context,
}) => {
  await context.request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
  await connectRequest(context.request);
  await page.goto(
    "/?project=fixture&m=specs&s=platform%2Faccess#invite=fixture-invitation",
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.get("repo"))
    .toBe(repoKey);
  expect(new URL(page.url()).searchParams.has("project")).toBe(false);
  expect(new URL(page.url()).searchParams.get("s")).toBe("platform/access");
  await expect(
    page.getByRole("heading", { name: "访问与来源", exact: true }),
  ).toBeVisible();
  await page.goto("/?project=unknown&m=specs");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "无法定位旧链接，请从个人仓库目录重新选择。" }),
  ).toBeVisible();
});
