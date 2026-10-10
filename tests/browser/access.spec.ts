import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

test.use({ storageState: { cookies: [], origins: [] } });
let configPath: string, original: string;
test.beforeEach(async () => {
  configPath = JSON.parse(
    await readFile("artifacts/e2e-runtime.json", "utf8"),
  ).config;
  original = await readFile(configPath, "utf8");
});
test.afterEach(async () => {
  await writeFile(configPath, original);
});

test("anonymous requests cannot obtain config or any project resource", async ({
  request,
}) => {
  const list = await request.get("/api/projects");
  expect(await list.json()).toEqual({
    projects: [{ id: "fixture", name: "测试项目", locked: true }],
  });
  const paths = [
    "/api/config",
    "/api/projects/fixture/workbench",
    "/api/projects/fixture/prototypes",
    "/api/projects/fixture/current-preview",
    "/api/projects/fixture/current-thumbnails/card",
    "/api/projects/fixture/thumbnails/document-reader/orders",
    "/api/projects/fixture/previews/document-reader",
    "/api/projects/fixture/search?snapshot=anything",
    "/api/projects/fixture/documents/anything?snapshot=anything",
    "/api/projects/fixture/assets/anything?snapshot=anything",
    "/preview/fixture/revision/document-reader/orders/index.html",
    "/current-preview/fixture/revision/card/index.html",
  ];
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.text()).not.toContain("repositoryUrl");
  }
  for (const path of paths.slice(-2))
    expect((await request.head(path)).status(), path).toBe(401);
  expect((await request.put("/api/config", { data: {} })).status()).toBe(401);
  expect((await request.post("/api/projects/fixture/refresh")).status()).toBe(
    401,
  );
});

test("invitation unlocks only one project, persists and cannot manage config", async ({
  page,
  browser,
}) => {
  const config = JSON.parse(original);
  config.projects.push({
    ...config.projects[0],
    id: "second",
    name: "另一个项目",
    inviteCode: "second-invitation",
  });
  await writeFile(configPath, JSON.stringify(config));
  await page.goto("/?project=fixture&m=specs&s=platform");
  await expect(page.getByLabel("项目邀请码", { exact: true })).toBeVisible();
  await page.getByLabel("项目邀请码", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "进入项目", exact: true }).click();
  await expect(page.locator(".access-form").getByRole("alert")).toContainText(
    "邀请码不正确",
  );
  await page
    .getByLabel("项目邀请码", { exact: true })
    .fill("fixture-invitation");
  await page.getByRole("button", { name: "进入项目", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/config")).status()).toBe(401);
  expect(
    (await page.request.get("/api/projects/second/workbench")).status(),
  ).toBe(401);
  const workbench = await (
    await page.request.get("/api/projects/fixture/workbench")
  ).json();
  const asset = workbench.documents.find((d: { path: string }) =>
    d.path.endsWith("/pixel.png"),
  );
  expect(
    (
      await page.request.get(
        `/api/projects/fixture/assets/${asset.id}?snapshot=${workbench.id}`,
      )
    ).status(),
  ).toBe(200);
  const preview = await (
    await page.request.get("/api/projects/fixture/previews/document-reader")
  ).json();
  const previewUrl = preview.entries.find(
    (entry: { id: string }) => entry.id === "orders",
  ).url;
  expect((await page.request.get(previewUrl)).status()).toBe(200);
  const state = await page.context().storageState();
  expect(
    state.cookies.some(
      (c) => c.httpOnly && c.expires > Date.now() / 1000 + 86400,
    ),
  ).toBe(true);
  const remembered = await browser.newContext({ storageState: state });
  try {
    const next = await remembered.newPage();
    await next.goto(
      "http://127.0.0.1:10682/?project=fixture&m=specs&s=platform",
    );
    await expect(
      next.getByRole("heading", { name: "工程协作", exact: true }),
    ).toBeVisible();
  } finally {
    await remembered.close();
  }
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  await expect(page.getByLabel("管理密码", { exact: true })).toBeVisible();
  await expect(page.getByLabel("仓库地址", { exact: true })).not.toBeVisible();
});

test("admin login, copied share link and rotation work across separate browsers", async ({
  page,
  browser,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?project=fixture");
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  await page.getByLabel("管理密码", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "登录管理", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "管理密码不正确",
  );
  await page
    .getByLabel("管理密码", { exact: true })
    .fill("fixture-admin-password");
  await page.getByRole("button", { name: "登录管理", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await expect(panel.getByLabel("仓库地址", { exact: true })).toBeVisible();
  await panel
    .getByRole("button", { name: "复制分享链接", exact: true })
    .click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("?project=fixture#invite=fixture-invitation");
  const guest = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    const visitor = await guest.newPage();
    await visitor.goto(link + "");
    await expect(
      visitor.getByLabel("项目邀请码", { exact: true }),
    ).not.toBeVisible();
    await expect(
      visitor.getByRole("button", { name: "刷新中心仓库" }),
    ).toBeEnabled();
    await expect(visitor).not.toHaveURL(/invite=/);
    expect(
      (await visitor.request.get("/api/projects/fixture/workbench")).status(),
    ).toBe(200);
    await panel
      .getByLabel("项目邀请码", { exact: true })
      .fill("rotated-invitation");
    await expect(
      panel.getByRole("button", { name: "复制分享链接", exact: true }),
    ).toBeDisabled();
    await panel.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("配置已保存");
    expect(
      (await visitor.request.get("/api/projects/fixture/workbench")).status(),
    ).toBe(401);
    await visitor.reload();
    await expect(
      visitor.getByLabel("项目邀请码", { exact: true }),
    ).toBeVisible();
    await visitor.goto(link);
    await expect(
      visitor.getByLabel("项目邀请码", { exact: true }),
    ).toBeVisible();
    await expect(visitor.locator(".error-notice[role=alert]")).toContainText(
      "邀请码不正确",
    );
    await expect(visitor).not.toHaveURL(/invite=/);
  } finally {
    await guest.close();
  }
});

test("legacy config stays locked; administrator can save the generated invitation on mobile", async ({
  page,
}) => {
  const config = JSON.parse(original);
  delete config.projects[0].inviteCode;
  await writeFile(configPath, JSON.stringify(config));
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?project=fixture");
  await expect(page.getByLabel("项目邀请码", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/access-mobile.png" });
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  await page
    .getByLabel("管理密码", { exact: true })
    .fill("fixture-admin-password");
  await page.getByRole("button", { name: "登录管理", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await expect(
    panel.getByRole("button", { name: "保存配置", exact: true }),
  ).toBeEnabled();
  const code = await panel
    .getByLabel("项目邀请码", { exact: true })
    .inputValue();
  expect(code.length).toBeGreaterThan(30);
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  expect(
    JSON.parse(await readFile(configPath, "utf8")).projects[0].inviteCode,
  ).toBe(code);
  expect(
    await panel.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/access-settings-mobile.png" });
});
