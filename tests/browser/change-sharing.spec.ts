import {
  test,
  expect,
  repositoryQuery,
  revisionHeaders,
  origin,
} from "./connected";

test("owner creates and revokes a live share; anonymous full-width reader needs no private APIs", async ({
  page,
  context,
  browser,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  await page.getByRole("button", { name: "分享", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "分享这个 Change" });
  await manager.getByRole("button", { name: "开启分享", exact: true }).click();
  const link = await manager
    .getByLabel("分享链接", { exact: true })
    .inputValue();
  expect(link).toMatch(/\/share\/[A-Za-z0-9_-]{43}$/);
  await manager.getByRole("button", { name: "复制分享链接" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  const anonymous = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1920, height: 1080 },
  });
  try {
    const viewer = await anonymous.newPage();
    const privateRequests: string[] = [],
      exceptions: string[] = [];
    viewer.on("request", (r) => {
      if (
        /\/api\/(session|connections|repositories|accounts|public-previews)/.test(
          r.url(),
        )
      )
        privateRequests.push(r.url());
    });
    viewer.on("pageerror", (e) => exceptions.push(e.message));
    await viewer.goto(link);
    await expect(viewer.locator(".shared-article .prose h1")).toHaveText(
      "技术方案",
    );
    expect(
      await viewer.locator(".shared-article").evaluate((e) => e.clientWidth),
    ).toBeGreaterThan(1300);
    await viewer.getByRole("button", { name: "专注阅读", exact: true }).click();
    expect(
      await viewer.locator(".shared-article").evaluate((e) => e.clientWidth),
    ).toBeGreaterThan(1800);
    await viewer.getByRole("button", { name: "切换大字号" }).click();
    await expect(viewer.locator(".shared-article .prose")).toHaveCSS(
      "font-size",
      "18px",
    );
    await viewer.getByRole("button", { name: "退出专注阅读" }).click();
    await viewer
      .locator(".shared-outline")
      .getByRole("link", { name: "数据来源", exact: true })
      .click();
    expect(new URL(viewer.url()).searchParams.get("anchor")).toBe("数据来源");
    await viewer
      .locator(".shared-materials")
      .getByRole("button", { name: "需求", exact: true })
      .click();
    await expect(viewer.locator(".shared-article .prose h1")).toContainText(
      "让工程文档",
    );
    expect(new URL(viewer.url()).searchParams.get("document")).toBe(
      "requirement.md",
    );
    await viewer.getByRole("link", { name: "工程协作", exact: true }).click();
    await expect(viewer.getByRole("status")).toContainText("未分享");
    for (const tab of ["概览", "任务", "依据", "合入变更"]) {
      await viewer
        .locator(".shared-tabs")
        .getByRole("button", { name: tab, exact: true })
        .click();
      await expect(viewer.locator(".shared-article")).not.toBeEmpty();
    }
    await viewer
      .locator(".shared-tabs")
      .getByRole("button", { name: "原型", exact: true })
      .click();
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
    expect(exceptions).toEqual([]);
    await viewer
      .locator(".shared-materials")
      .getByRole("button", { name: "技术方案", exact: true })
      .click();
    for (const width of [1440, 834, 390, 320]) {
      await viewer.setViewportSize({ width, height: 900 });
      expect(
        await viewer.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      if (width < 700) {
        await viewer.getByRole("button", { name: "打开材料目录" }).click();
        const directory = viewer.getByRole("dialog", { name: "材料目录" });
        await expect(directory).toBeVisible();
        await directory
          .getByRole("button", { name: "需求", exact: true })
          .click();
        await expect(directory).toHaveCount(0);
        await viewer.getByRole("button", { name: "打开本页目录" }).click();
        await viewer
          .getByRole("dialog", { name: "本页目录" })
          .getByRole("link", { name: "验收标准", exact: true })
          .click();
        await expect(viewer.getByRole("dialog")).toHaveCount(0);
      }
      await viewer.screenshot({
        path: `artifacts/change-sharing-${width}.png`,
        fullPage: true,
      });
    }
    const id = new URL(link).pathname.split("/").at(-1)!;
    await manager
      .getByRole("button", { name: "停止分享", exact: true })
      .click();
    await expect(manager.getByRole("status")).toContainText("旧链接已失效");
    await viewer.reload();
    await expect(
      viewer.getByRole("heading", { name: /分享已停止/ }),
    ).toBeVisible();
    await expect(viewer.locator(".shared-article")).toHaveCount(0);
    expect(
      (await anonymous.request.get(`/api/shares/${id}/change`)).status(),
    ).toBe(410);
    await manager
      .getByRole("button", { name: "开启分享", exact: true })
      .click();
    await expect(
      manager.getByLabel("分享链接", { exact: true }),
    ).not.toHaveValue(link);
  } finally {
    await anonymous.close();
  }
});

test("anonymous shared integration displays fixed file diff and survives owner logout", async ({
  personal,
  request,
  browser,
}) => {
  const response = await request.post(
    personal.url("changes/integration-demo/share"),
    { headers: await revisionHeaders(request) },
  );
  expect(response.status()).toBe(200);
  const share = (await response.json()).share;
  await request.delete("/api/session", {
    headers: await revisionHeaders(request),
  });
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    await page.goto(`${share.path}?ct=integration`);
    await expect(
      page.getByText("已合入 develop", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /integration-example.ts/ }).click();
    await expect(page.locator(".diff-table")).toContainText(
      "export const delivered = true;",
    );
    await page.reload();
    await expect(page.locator(".diff-table")).toContainText(
      "export const delivered = true;",
    );
  } finally {
    await anonymous.close();
  }
});

test("a relative document deep link follows branch handoff and archive", async ({
  personal,
  request,
  browser,
}) => {
  const response = await request.post(
    personal.url("changes/document-reader/share"),
    { headers: await revisionHeaders(request) },
  );
  expect(response.status()).toBe(200);
  const share = (await response.json()).share;
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    const link = `${share.path}?ct=documents&document=requirement.md&anchor=${encodeURIComponent("验收标准")}`;
    await page.goto(link);
    await expect(page.locator(".shared-article .prose h1")).toContainText(
      "让工程文档",
    );
    for (const move of ["branch", "archive"]) {
      await request.post("/_fixture/control", {
        data: { shareMove: move, expireRefresh: personal.id },
      });
      await page.reload();
      await expect(page.locator(".shared-article .prose h1")).toContainText(
        "让工程文档",
      );
      await expect(page.locator(".shared-document-meta")).toContainText(
        move === "branch"
          ? "change/shared-reader-next"
          : "docs/project/archive/2026-10-20-document-reader/requirement.md",
      );
      expect(new URL(page.url()).searchParams.get("document")).toBe(
        "requirement.md",
      );
      await expect(page.locator(".shared-article #验收标准")).toBeVisible();
    }
  } finally {
    await anonymous.close();
    await request.post("/_fixture/control", {
      data: { shareMove: "restore", expireRefresh: personal.id },
    });
  }
});
