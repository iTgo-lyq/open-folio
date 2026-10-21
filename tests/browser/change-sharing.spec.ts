import {
  test,
  expect,
  repositoryQuery,
  revisionHeaders,
  origin,
} from "./connected";

function directLink(change: string) {
  return `/share?${new URLSearchParams({ repository: "https://github.com/acme/fixture", change, collaborationBranch: "develop" })}`;
}

test("copying a direct link opens the anonymous full-width reader without private APIs", async ({
  page,
  context,
  browser,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  await page.getByRole("button", { name: "分享", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "分享这个 Change" });
  const link = await manager
    .getByLabel("分享链接", { exact: true })
    .inputValue();
  expect(new URL(link).pathname).toBe("/share");
  expect(new URL(link).searchParams.get("repository")).toBe(
    "https://github.com/acme/fixture",
  );
  expect(new URL(link).searchParams.get("change")).toBe("document-reader");
  await expect(
    manager.getByRole("button", { name: /开启分享|停止分享/ }),
  ).toHaveCount(0);
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
    await expect(viewer.getByRole("status")).toContainText("不在本页范围内");
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
    const copied = new URL(viewer.url());
    expect(copied.searchParams.get("repository")).toBe(
      "https://github.com/acme/fixture",
    );
    expect(copied.searchParams.get("change")).toBe("document-reader");
    // A target change within the same mounted page cannot retain old contents.
    await viewer.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set("change", "not-a-change");
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(viewer.locator(".shared-article")).toHaveCount(0);
    await expect(viewer.locator(".shared-empty")).toContainText(
      /不存在|不可用/,
    );
    await viewer.goBack();
    await expect(viewer.locator(".shared-article .prose h1")).toBeVisible();
  } finally {
    await anonymous.close();
  }
});

test("anonymous shared integration displays fixed file diff and survives owner logout", async ({
  personal,
  request,
  browser,
}) => {
  const share = directLink("integration-demo");
  await request.delete("/api/session", {
    headers: await revisionHeaders(request),
  });
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    await page.goto(`${share}&ct=integration`);
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
  const share = directLink("document-reader");
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    const link = `${share}&ct=documents&document=requirement.md&anchor=${encodeURIComponent("验收标准")}`;
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

test("shared image version errors refresh details and lost sources clear the reader", async ({
  browser,
  request,
  personal,
}) => {
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    let moved = false,
      denied = false,
      details = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/shared-changes/change") details++;
    });
    await page.route("**/api/shared-changes/assets/**", async (route) => {
      if (denied) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "SHARE_UNAVAILABLE",
              message: "内容不存在或暂不可读。",
            },
          }),
        });
        return;
      }
      if (!moved) {
        moved = true;
        const control = await request.post("/_fixture/control", {
          data: { shareMove: "branch", expireSharedRefresh: true },
        });
        expect(control.ok(), await control.text()).toBe(true);
        const fresh = await anonymous.request.get(
          directLink("document-reader").replace(
            "/share?",
            "/api/shared-changes/change?",
          ),
        );
        expect(fresh.ok()).toBe(true);
      }
      await route.continue();
    });
    await page.goto(directLink("document-reader"));
    const img = page.getByRole("img", { name: "范围示意" });
    await expect
      .poll(() =>
        img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    expect(details).toBeGreaterThan(1);
    await expect(page.locator(".shared-document-meta")).toContainText(
      "change/shared-reader-next",
    );
    denied = true;
    await img.evaluate((e: HTMLImageElement) => (e.src += "&load=loss"));
    await expect(page.locator(".shared-article")).toHaveCount(0);
    await expect(page.locator(".shared-empty")).toContainText(
      "内容不存在或暂不可读",
    );
  } finally {
    await anonymous.close();
    await request.post("/_fixture/control", {
      data: { shareMove: "restore", expireRefresh: personal.id },
    });
  }
});

test("a late explicit-branch error cannot clear a target with an inferred branch", async ({
  browser,
}) => {
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    const link = new URL(directLink("document-reader"), origin);
    link.searchParams.delete("collaborationBranch");
    await page.goto(link.toString());
    await expect(page.locator(".shared-article .prose h1")).toHaveText(
      "技术方案",
    );
    await page.evaluate(() => {
      const q = new URLSearchParams(location.search);
      q.set("collaborationBranch", "develop");
      dispatchEvent(
        new CustomEvent("openfolio-share-error", {
          detail: {
            path: `/api/shared-changes/change?${q}`,
            code: "SHARE_UNAVAILABLE",
          },
        }),
      );
    });
    await expect(page.locator(".shared-article .prose h1")).toHaveText(
      "技术方案",
    );
  } finally {
    await anonymous.close();
  }
});
