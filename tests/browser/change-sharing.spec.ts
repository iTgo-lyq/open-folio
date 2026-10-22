import {
  test,
  expect,
  repositoryQuery,
  revisionHeaders,
  origin,
  openMaterial,
} from "./connected";
import type { SharedChange } from "../../src/lib/shared-change";

function directLink(change: string) {
  return `/share?${new URLSearchParams({ repository: "https://github.com/acme/fixture", change, integrationBranch: "develop" })}`;
}

test("copying a direct link opens the anonymous reader without private APIs", async ({
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
    const article = viewer
      .getByRole("region", { name: "阅读正文", exact: true })
      .locator("article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(
      "让工程文档成为清晰的阅读体验",
    );
    await viewer.getByRole("button", { name: "切换深色主题" }).click();
    await expect(viewer.locator("html")).toHaveAttribute("data-theme", "dark");
    await viewer.getByRole("button", { name: "切换浅色主题" }).click();
    await openMaterial(viewer, "技术方案");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(
      "技术方案",
    );
    await expect(article).toHaveCSS("max-width", "740px");
    await viewer.getByRole("button", { name: "阅读设置", exact: true }).click();
    const settings = viewer.getByRole("dialog", {
      name: "阅读设置",
      exact: true,
    });
    await settings
      .getByRole("switch", { name: "专注阅读", exact: true })
      .click();
    await settings.getByRole("radio", { name: "较大", exact: true }).click();
    await viewer.keyboard.press("Escape");
    await expect(
      article
        .locator(":scope > div")
        .filter({ has: viewer.locator("h1") })
        .last(),
    ).toHaveCSS("font-size", "17.5px");
    await viewer.getByRole("button", { name: "阅读设置", exact: true }).click();
    await settings
      .getByRole("switch", { name: "专注阅读", exact: true })
      .click();
    await viewer.keyboard.press("Escape");
    await viewer
      .getByRole("navigation", { name: "本页目录", exact: true })
      .getByRole("link", { name: "数据来源", exact: true })
      .click();
    expect(new URL(viewer.url()).searchParams.get("anchor")).toBe("数据来源");
    await openMaterial(viewer, "需求");
    await expect(article.getByRole("heading", { level: 1 })).toContainText(
      "让工程文档",
    );
    expect(new URL(viewer.url()).searchParams.get("document")).toBe(
      "requirement.md",
    );
    await viewer.getByRole("link", { name: "工程协作", exact: true }).click();
    await expect(viewer.getByRole("status")).toContainText("不在本页范围内");
    for (const material of ["概览", "任务", "依据", "合入变更"]) {
      await openMaterial(viewer, material);
      await expect(article).not.toBeEmpty();
    }
    await openMaterial(viewer, "原型");
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
    await openMaterial(viewer, "技术方案");
    for (const theme of ["light", "dark"])
      for (const width of [1440, 834, 390, 320]) {
        await viewer.evaluate(async (theme) => {
          document.documentElement.dataset.theme = theme;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
          );
          await Promise.allSettled(
            document
              .getAnimations()
              .filter(
                (animation) =>
                  animation.effect?.getTiming().iterations !== Infinity,
              )
              .map((animation) => animation.finished),
          );
        }, theme);
        await viewer.setViewportSize({ width, height: 900 });
        expect(
          await viewer.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        if (width < 1024) {
          await openMaterial(viewer, "需求");
          await viewer
            .getByRole("button", { name: "本页目录", exact: true })
            .click();
          await viewer
            .getByRole("dialog", { name: "本页目录", exact: true })
            .getByRole("link", { name: "验收标准", exact: true })
            .click();
          await expect(viewer.getByRole("dialog")).toHaveCount(0);
        }
        await viewer.screenshot({
          path: `artifacts/change-sharing-${width}-${theme}.png`,
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
    await expect(
      viewer.getByRole("region", { name: "阅读正文", exact: true }),
    ).toHaveCount(0);
    await expect(viewer.getByRole("main")).toContainText(/不存在|不可用/);
    await viewer.goBack();
    await expect(viewer.getByRole("heading", { level: 1 })).toBeVisible();
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
    await expect(
      page.getByRole("table", { name: /integration-example\.ts 的统一差异/ }),
    ).toContainText("export const delivered = true;");
    await page.reload();
    await expect(
      page.getByRole("table", { name: /integration-example\.ts 的统一差异/ }),
    ).toContainText("export const delivered = true;");
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
    await expect(
      page
        .getByRole("region", { name: "阅读正文", exact: true })
        .getByRole("heading", { level: 1 }),
    ).toContainText("让工程文档");
    for (const move of ["branch", "archive"]) {
      await request.post("/_fixture/control", {
        data: { shareMove: move, expireRefresh: personal.id },
      });
      await page.reload();
      await expect(
        page
          .getByRole("region", { name: "阅读正文", exact: true })
          .getByRole("heading", { level: 1 }),
      ).toContainText("让工程文档");
      const fresh = await anonymous.request.get(
        share.replace("/share?", "/api/shared-changes/change?"),
      );
      expect(fresh.ok()).toBe(true);
      const detail: SharedChange = await fresh.json();
      const document = detail.documents.find((d) =>
        d.path.endsWith("/requirement.md"),
      )!;
      expect(document.branch).toBe(
        move === "branch" ? "change/shared-reader-next" : "develop",
      );
      const source = page.getByRole("group", { name: "文档来源", exact: true });
      await expect(source).toContainText(
        move === "branch"
          ? "docs/project/changes/document-reader/requirement.md"
          : "docs/project/archive/2026-10-20-document-reader/requirement.md",
      );
      await expect(source.locator("code").last()).toHaveAttribute(
        "title",
        document.commit,
      );
      expect(new URL(page.url()).searchParams.get("document")).toBe(
        "requirement.md",
      );
      await expect(
        page
          .getByRole("region", { name: "阅读正文", exact: true })
          .locator("#验收标准"),
      ).toBeVisible();
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
    await page.goto(directLink("document-reader") + "&ct=technical");
    const img = page.getByRole("img", { name: "范围示意" });
    await expect
      .poll(() =>
        img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    expect(details).toBeGreaterThan(1);
    const fresh = await anonymous.request.get(
      directLink("document-reader").replace(
        "/share?",
        "/api/shared-changes/change?",
      ),
    );
    expect(fresh.ok()).toBe(true);
    const detail: SharedChange = await fresh.json();
    const document = detail.documents.find((d) =>
      d.path.endsWith("/technical.md"),
    )!;
    expect(document.branch).toBe("change/shared-reader-next");
    await expect(
      page
        .getByRole("group", { name: "文档来源", exact: true })
        .locator("code")
        .last(),
    ).toHaveAttribute("title", document.commit);
    denied = true;
    await img.evaluate((e: HTMLImageElement) => (e.src += "&load=loss"));
    await expect(
      page.getByRole("region", { name: "阅读正文", exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText("内容不存在或暂不可读");
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
    link.searchParams.delete("integrationBranch");
    link.searchParams.set("ct", "technical");
    await page.goto(link.toString());
    await expect(
      page
        .getByRole("region", { name: "阅读正文", exact: true })
        .getByRole("heading", { level: 1 }),
    ).toHaveText("技术方案");
    await page.evaluate(() => {
      const q = new URLSearchParams(location.search);
      q.set("integrationBranch", "develop");
      dispatchEvent(
        new CustomEvent("openfolio-share-error", {
          detail: {
            path: `/api/shared-changes/change?${q}`,
            code: "SHARE_UNAVAILABLE",
          },
        }),
      );
    });
    await expect(
      page
        .getByRole("region", { name: "阅读正文", exact: true })
        .getByRole("heading", { level: 1 }),
    ).toHaveText("技术方案");
  } finally {
    await anonymous.close();
  }
});

test("a temporary sync failure retains readable content and can recover", async ({
  browser,
}) => {
  const anonymous = await browser.newContext({ baseURL: origin });
  try {
    const page = await anonymous.newPage();
    await page.goto(directLink("document-reader") + "&ct=technical");
    const title = page
      .getByRole("region", { name: "阅读正文", exact: true })
      .getByRole("heading", { name: "技术方案", exact: true });
    await expect(title).toBeVisible();
    await page.route("**/api/shared-changes/change?**", (route) =>
      route.fulfill({
        status: 503,
        json: {
          error: { code: "TEMPORARY_FAILURE", message: "中心仓库暂时不可用" },
        },
      }),
    );
    await page.getByRole("button", { name: "同步状态：已同步" }).click();
    await page.getByRole("button", { name: "检查更新", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "当前显示上次读取的内容",
    );
    await expect(title).toBeVisible();
    await page.unroute("**/api/shared-changes/change?**");
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(title).toBeVisible();
    await page.goto(
      directLink("document-reader") +
        "&ct=file%3Aremoved.md&document=removed.md",
    );
    await expect(
      page.getByRole("heading", { name: "文件缺失", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "技术方案", exact: true }),
    ).toHaveCount(0);
    await page.goto(directLink("document-reader") + "&document=change.json");
    await expect(page.getByRole("dialog").locator("pre")).toContainText(
      '"document-reader"',
    );
    await page.getByRole("button", { name: "关闭文档", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).not.toHaveURL(/asset=|document=/);
  } finally {
    await anonymous.close();
  }
});
