import { test, expect, repositoryQuery, connectRequest } from "./connected";
test("engineering share links use each collaborator's connection and restore the original reading position", async ({
  page,
  context,
  browser,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform%2Faccess`);
  await expect(
    page.getByRole("heading", { name: "访问与来源", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "复制页面链接" }).last().click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const params = new URL(link).searchParams;
  expect(params.get("repositoryId")).toBe("1");
  expect(params.get("provider")).toBe("github");
  expect(params.get("s")).toBe("platform/access");
  for (const key of ["connectionId", "token", "session", "snapshot", "project"])
    expect(params.has(key)).toBe(false);
  const collaborator = await browser.newContext({
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    const other = await collaborator.newPage();
    await other.goto(link);
    await expect(
      other.getByRole("heading", { name: /你的工程工作台/ }),
    ).toBeVisible();
    await other
      .getByRole("button", { name: "登录工作台", exact: true })
      .click();
    await other
      .getByLabel("用户名（可选）", { exact: true })
      .fill("collaborator");
    await other.getByLabel("GitHub token", { exact: true }).fill("token-b");
    await other.getByRole("button", { name: "登录并发现仓库" }).click();
    await expect(
      other.getByRole("heading", { name: "访问与来源", exact: true }),
    ).toBeVisible();
    expect(new URL(other.url()).searchParams.get("s")).toBe("platform/access");
    await other.screenshot({ path: "artifacts/collaborator-reading.png" });
    await request.post("/_fixture/control", { data: { gitRevoke: "token-b" } });
    await other.reload();
    await expect(
      other.getByRole("heading", { name: "访问与来源", exact: true }),
    ).toHaveCount(0);
    await expect(
      other.getByRole("button", { name: "当前凭据", exact: true }),
    ).toBeVisible();
  } finally {
    await collaborator.close();
  }
});
test("a prepared prototype opens anonymously after logout and keeps its sandbox and screenshots", async ({
  page,
  context,
  browser,
  request,
  personal,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(
    `/?${repositoryQuery}&m=prototypes&prototype=orders&preview=orders&device=mobile`,
  );
  await expect(
    page.frameLocator("iframe").getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "复制预览链接" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).pathname).toMatch(/^\/preview\/[a-f0-9]{64}$/);
  const id = new URL(link).pathname.split("/").pop()!;
  await request.delete("/api/session", {
    headers: { origin: "http://127.0.0.1:10682" },
  });
  const anonymous = await browser.newContext({
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    const viewer = await anonymous.newPage();
    const privateRequests: string[] = [];
    viewer.on("request", (r) => {
      if (/\/api\/(connections|session|repositories)/.test(r.url()))
        privateRequests.push(r.url());
    });
    await viewer.goto(link);
    await expect(viewer.locator("iframe")).toHaveAttribute("width", "390");
    await expect(
      viewer
        .frameLocator("iframe")
        .getByRole("heading", { name: "订单列表原型" }),
    ).toBeVisible();
    await expect(viewer.locator("iframe")).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
    await viewer
      .frameLocator("iframe")
      .getByRole("button", { name: "0", exact: true })
      .click();
    await expect(
      viewer
        .frameLocator("iframe")
        .getByRole("button", { name: "1", exact: true }),
    ).toBeVisible();
    expect(privateRequests).toEqual([]);
    const image = await anonymous.request.get(
      `/api/public-previews/${id}/mobile.jpg`,
    );
    expect(image.ok()).toBe(true);
    expect(image.headers()["content-type"]).toBe("image/jpeg");
    await viewer.setViewportSize({ width: 320, height: 740 });
    expect(
      await viewer.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    await viewer.screenshot({ path: "artifacts/public-preview-mobile.png" });
  } finally {
    await anonymous.close();
  }
});
