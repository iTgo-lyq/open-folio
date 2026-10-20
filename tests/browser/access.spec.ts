import { test, expect } from "@playwright/test";
import { repoKey } from "./connected.ts";
test("administrator sessions cannot grant repository reads", async ({
  page,
  request,
}) => {
  await request.post("/_fixture/control", {
    data: { reset: true, newSessionScope: true },
  });
  expect(
    (
      await request.post("/api/access", {
        data: { secret: "fixture-admin-password" },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.get(
        `/api/repositories/${repoKey}/workbench?connectionId=00000000-0000-4000-8000-000000000000`,
      )
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "保存配置" })).toHaveCount(0);
});
