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
    page.getByRole("heading", { name: "当前凭据", exact: true }),
  ).toBeVisible();
  expect(copies).toBe(0);
  await page.getByRole("button", { name: "复制 token", exact: true }).click();
  await expect(page.getByLabel("当前 token", { exact: true })).toHaveValue(
    "token-a",
  );
  expect(copies).toBe(1);
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await expect(page.getByLabel("当前 token", { exact: true })).toHaveCount(0);
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
    const b = await connectRequest(second.request);
    expect(b.id).toBe(personal.id);
    await page.goto("/?m=connections");
    const devices = await (
      await page.request.get("/api/session/devices")
    ).json();
    const secondDevices = await (
      await second.request.get("/api/session/devices")
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
      page.getByRole("heading", { name: "登录自己的工作台" }),
    ).toBeVisible();
  } finally {
    await second.close();
  }
});
