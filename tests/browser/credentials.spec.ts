import { test, expect, connectRequest } from "./connected";
test("copy is click-only and its clipboard fallback disappears on close", async ({
  page,
}) => {
  let copies = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/session/token") copies++;
  });
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.goto("/?m=connections");
  await expect(
    page.getByRole("heading", { name: "Token 管理", exact: true }),
  ).toBeVisible();
  expect(copies).toBe(0);
  await page
    .getByRole("button", { name: "复制当前 Token", exact: true })
    .click();
  await expect(page.getByLabel("当前 Token", { exact: true })).toHaveValue(
    "token-a",
  );
  expect(copies).toBe(1);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByLabel("当前 Token", { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
    ),
  ).not.toContain("token-a");
});
test("same-token devices appear together and one can revoke another", async ({
  page,
  browser,
  personal,
}) => {
  const second = await browser.newContext();
  try {
    const b = await connectRequest(
      second.request,
      "token-a",
      personal.username,
    );
    expect(b.id).toBe(personal.id);
    await page.goto("/?m=connections");
    await page.getByRole("tab", { name: "登录设备", exact: true }).click();
    const devices = await (
      await page.request.get("/api/session/devices", {
        headers: { "X-OpenFolio-Revision": "2" },
      })
    ).json();
    const secondDevices = await (
      await second.request.get("/api/session/devices", {
        headers: { "X-OpenFolio-Revision": "2" },
      })
    ).json();
    const own = secondDevices.devices.find((d: any) => d.current);
    await page
      .getByRole("button", {
        name: `退出设备 ${own.id.slice(0, 8)}`,
        exact: true,
      })
      .click();
    await expect
      .poll(
        async () =>
          (await (await second.request.get("/api/session")).json()).connected,
      )
      .toBe(false);
    expect(
      (await (await page.request.get("/api/session")).json()).connected,
    ).toBe(true);
    await page
      .getByRole("button", { name: "退出全部设备", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "登录 OpenFolio" }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});

test("successful explicit copy writes the current token to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?m=connections");
  await page
    .getByRole("button", { name: "复制当前 Token", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Token 已复制");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "token-a",
  );
});
