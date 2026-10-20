import { test, expect, repositoryQuery, connectRequest } from "./connected";

test("custom collaboration selection persists through rediscovery, sharing, preferences and prototype preparation", async ({
  page,
  browser,
  context,
  request,
  personal,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?m=home");
  await page.getByRole("button", { name: "用仓库地址检查" }).click();
  await page
    .getByLabel("GitHub HTTPS 仓库地址")
    .fill("https://github.com/acme/fixture");
  await expect(page.getByLabel("协作分支", { exact: true })).toHaveValue(
    "develop",
  );
  await page.getByLabel("协作分支", { exact: true }).fill("team/integration");
  await page.getByRole("button", { name: "检查仓库", exact: true }).click();
  await expect(
    page.getByText("已接入，可以阅读", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "打开仓库", exact: true }).click();
  await page.goto(
    `/?${repositoryQuery}&collaborationBranch=team%2Fintegration&m=specs&s=platform`,
  );
  await expect(
    page.getByRole("heading", { name: "自定义协作能力", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "复制页面链接" }).last().click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).searchParams.get("collaborationBranch")).toBe(
    "team/integration",
  );
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/session")).json()).workspace.preferences
          .repository?.collaborationBranch,
    )
    .toBe("team/integration");
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:10682" });
  try {
    await connectRequest(other.request, "token-a", personal.username);
    const view = await other.newPage();
    await view.goto("/");
    await expect
      .poll(() => new URL(view.url()).searchParams.get("collaborationBranch"))
      .toBe("team/integration");
    await view
      .getByRole("button", { name: "自定义协作能力", exact: true })
      .click();
    await expect(
      view.getByRole("heading", { name: "自定义协作能力", exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
  const collaborator = await browser.newContext({
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    await connectRequest(collaborator.request, "token-b");
    const view = await collaborator.newPage();
    await view.goto(link);
    await expect(
      view.getByRole("heading", { name: "自定义协作能力", exact: true }),
    ).toBeVisible();
    await view.goto(
      `/?${repositoryQuery}&collaborationBranch=team%2Fintegration&m=prototypes&prototype=orders&preview=orders&device=mobile`,
    );
    await expect(
      view
        .frameLocator("iframe")
        .getByRole("heading", { name: "订单列表原型" }),
    ).toBeVisible();
  } finally {
    await collaborator.close();
  }
  expect(
    (
      await request.post(`/api/connections/${personal.id}/discovery`, {
        headers: { origin: "http://127.0.0.1:10682" },
        data: {},
      })
    ).ok(),
  ).toBe(true);
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/api/connections/${personal.id}/discovery`)
          ).json()
        ).discovery.state,
    )
    .toBe("complete");
  await page.goto("/?m=home");
  await expect(page.locator(".personal-repo-source")).toContainText(
    "team/integration",
  );
});

test("changing the same repository source discards a delayed response from its previous branch", async ({
  page,
  personal,
  request,
}) => {
  const original = await (await request.get(personal.url("workbench"))).json();
  let deliver: (() => Promise<void>) | undefined;
  await page.route("**/workbench?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("collaborationBranch") !==
      "develop"
    )
      return route.continue();
    await new Promise<void>((resolve) => {
      deliver = async () => {
        await route.fulfill({ json: original }).catch(() => {});
        resolve();
      };
    });
  });
  await page.goto(
    `/?${repositoryQuery}&collaborationBranch=develop&m=specs&s=platform`,
  );
  await expect.poll(() => !!deliver).toBe(true);
  await page.evaluate((query) => {
    window.history.pushState(
      {},
      "",
      `/?${query}&collaborationBranch=team%2Fintegration&m=specs&s=platform`,
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, repositoryQuery);
  await expect(
    page.getByRole("heading", { name: "自定义协作能力", exact: true }),
  ).toBeVisible();
  await deliver!();
  await expect(
    page.getByRole("heading", { name: "自定义协作能力", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toHaveCount(0);
});
