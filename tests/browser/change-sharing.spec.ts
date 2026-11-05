import { verifyPrototypeCapabilities } from "./prototype-capabilities";
import {
  test,
  expect,
  repositoryQuery,
  revisionHeaders,
  origin,
  openMaterial,
  connectRequest,
} from "./connected";
import type { SharedChange } from "../../src/lib/shared-change";

function directLink(change: string) {
  return `/share?${new URLSearchParams({ repository: "https://github.com/acme/fixture", change, integrationBranch: "develop" })}`;
}

test("shared SKILL.md uses the body H1 and omits YAML metadata from the reader", async ({
  page,
}) => {
  await page.goto(directLink("document-reader") + "&document=SKILL.md");
  const materials = page.getByRole("navigation", { name: "Change 材料" });
  await expect(
    materials.getByRole("link", { name: "正文标题", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const article = page
    .getByRole("region", { name: "阅读正文" })
    .locator("article");
  await expect(article.getByRole("heading", { level: 1 })).toHaveText(
    "正文标题",
  );
  await expect(article.getByRole("heading", { level: 2 })).toHaveText([
    "使用方法",
    "分节说明",
  ]);
  await expect(article.getByRole("separator")).toHaveCount(1);
  await expect(article).not.toContainText(/sample-skill|YAML metadata/);
  const toc = page.getByRole("navigation", { name: "本页目录" });
  await expect(toc.getByRole("link")).toHaveText(["使用方法", "分节说明"]);
  await expect(toc.getByRole("link", { name: "分节说明" })).toHaveAttribute(
    "href",
    `#${encodeURIComponent("分节说明")}`,
  );
  await expect(
    article.getByRole("heading", { name: "分节说明" }),
  ).toHaveAttribute("id", "分节说明");
});

test("short links restore the shared material and chapter while later navigation replaces saved defaults", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60_000);
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=technical&anchor=${encodeURIComponent("数据来源")}`,
  );
  await expect(
    page.getByRole("heading", { name: "技术方案", exact: true }),
  ).toBeVisible();
  const copy = async () => {
    await page.getByRole("button", { name: "分享", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "分享这个 Change",
      exact: true,
    });
    const input = dialog.getByRole("textbox", {
      name: "网页链接",
      exact: true,
    });
    await expect(input).toHaveValue(/\/s\/[A-Za-z0-9_-]{22}$/);
    const value = await input.inputValue();
    await dialog
      .getByRole("button", { name: "关闭分享链接", exact: true })
      .click();
    return value;
  };
  const technical = await copy();
  expect(new URL(technical).search).toBe("");
  const agent = await request.get(`${technical}/agent`);
  expect(await agent.text()).toContain("## 文件：technical.md");
  const anonymous = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const viewer = await anonymous.newPage();
    await viewer.addInitScript(() => {
      const scroll = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (options) {
        if (this.id) document.documentElement.dataset.scrollAnchor = this.id;
        return scroll.call(this, options);
      };
    });
    await viewer.goto(technical);
    await expect(
      viewer.getByRole("heading", { name: "技术方案", exact: true }),
    ).toBeVisible();
    // The fixture fits in the viewport; observe the native scroll destination
    // rather than requiring a visible scroll offset or active-section change.
    await expect(viewer.locator("html")).toHaveAttribute(
      "data-scroll-anchor",
      "数据来源",
    );
    await openMaterial(viewer, "需求");
    await expect(
      viewer.getByRole("heading", {
        name: "让工程文档成为清晰的阅读体验",
        exact: true,
      }),
    ).toBeVisible();
    expect(new URL(viewer.url()).searchParams.get("anchor")).toBeNull();
    await viewer.reload();
    await expect(
      viewer.getByRole("heading", {
        name: "让工程文档成为清晰的阅读体验",
        exact: true,
      }),
    ).toBeVisible();
    await viewer.goBack();
    await expect(
      viewer.getByRole("heading", { name: "技术方案", exact: true }),
    ).toBeVisible();
    await viewer.goForward();
    await expect(
      viewer.getByRole("heading", {
        name: "让工程文档成为清晰的阅读体验",
        exact: true,
      }),
    ).toBeVisible();
    await openMaterial(page, "执行记录");
    const execution = await copy();
    expect(execution).not.toBe(technical);
    await viewer.goto(execution);
    await expect(
      viewer
        .getByRole("navigation", { name: "Change 材料", exact: true })
        .getByRole("link", { name: /^执行记录/ }),
    ).toHaveAttribute("aria-current", "page");
    // This fixture intentionally has no execution.md; the saved material must
    // keep its explicit missing-file page instead of opening the overview.
    await expect(
      viewer.getByRole("alert").filter({ hasText: "文件缺失" }),
    ).toContainText("execution.md");
    await viewer.goto(technical);
    await expect(
      viewer.getByRole("heading", { name: "技术方案", exact: true }),
    ).toBeVisible();
    await openMaterial(page, "阅读体验调查");
    const extra = await copy();
    await viewer.goto(extra);
    await expect(
      viewer.getByRole("heading", { name: "阅读体验调查", exact: true }),
    ).toBeVisible();
  } finally {
    await anonymous.close();
  }
});

test("copying a short link opens the anonymous reader and the space name returns through private access checks", async ({
  page,
  context,
  browser,
  request,
}) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  await page.getByRole("button", { name: "分享", exact: true }).click();
  const manager = page.getByRole("dialog", { name: "分享这个 Change" });
  const webInput = manager.getByRole("textbox", {
    name: "网页链接",
    exact: true,
  });
  await expect(webInput).toHaveValue(/\/s\/[A-Za-z0-9_-]{22}$/);
  const link = await webInput.inputValue();
  expect(new URL(link).search).toBe("");
  await expect(
    manager.getByRole("button", { name: /开启分享|停止分享/ }),
  ).toHaveCount(0);
  await manager.getByRole("button", { name: "复制网页链接" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  const agentLink = await manager
    .getByRole("textbox", { name: "Agent 文本链接", exact: true })
    .inputValue();
  expect(agentLink).toBe(`${link}/agent`);
  await manager.getByRole("button", { name: "复制 Agent 链接" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    agentLink,
  );
  const text = await request.get(agentLink);
  expect(text.headers()["content-type"]).toContain("text/plain");
  expect(await text.text()).toContain("# 让工程文档成为清晰的阅读体验");
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
    const space = viewer.getByRole("link", {
      name: "acme/fixture",
      exact: true,
    });
    const spacePath = (await space.getAttribute("href"))!;
    expect(new URL(spacePath, origin).searchParams.get("repo")).toBe(
      new URLSearchParams(repositoryQuery).get("repo"),
    );
    await expect(viewer.getByRole("button", { name: "返回空间" })).toHaveCount(
      0,
    );
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
    await expect(viewer.locator("iframe")).not.toHaveAttribute("sandbox");
    await verifyPrototypeCapabilities(viewer, viewer.frameLocator("iframe"));
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
    expect(copied.pathname).toBe(new URL(link).pathname);
    expect(copied.searchParams.has("repository")).toBe(false);
    expect(copied.searchParams.has("change")).toBe(false);
    // Query parameters cannot replace the immutable short-link target.
    await viewer.goto(`${link}?change=not-a-change`);
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
    await space.click();
    await expect(
      viewer.getByRole("textbox", { name: "账号", exact: true }),
    ).toBeVisible();
    await viewer.goBack();
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto(spacePath);
    await expect(
      page.getByRole("heading", { name: "Changes", exact: true }),
    ).toBeVisible();
    await viewer.goto(directLink("document-reader"));
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
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
    // A second account can read the public Change, but cannot use the owner's
    // repository credentials to enter the rest of its space after losing access.
    await connectRequest(anonymous.request, "token-b");
    await request.post("/_fixture/control", {
      data: { denyRead: "token-b", advancePermissions: 300_001 },
    });
    await viewer.goto(link);
    await expect(article.getByRole("heading", { level: 1 })).toBeVisible();
    await space.click();
    await expect(
      viewer.getByRole("region", { name: "Change 列表", exact: true }),
    ).toHaveCount(0);
    await expect(viewer.getByRole("main")).toContainText(
      /失效|不可读|暂时没有|无法|当前凭据/,
    );
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
        share.replace("/share?", "/api/shared-changes/change?refresh=1&"),
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
            "/api/shared-changes/change?refresh=1&",
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
        "/api/shared-changes/change?refresh=1&",
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

test("cached shared content appears while its update is pending and survives an update failure", async ({
  browser,
}) => {
  const viewer = await browser.newContext({ baseURL: origin });
  try {
    const page = await viewer.newPage();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let updating = false;
    await page.route("**/api/shared-changes/change?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("refresh") !== "1")
        return route.continue();
      updating = true;
      await held;
      await route.fulfill({
        status: 503,
        json: { error: { code: "GIT_READ_FAILED", message: "更新暂时失败" } },
      });
    });
    await page.goto(directLink("document-reader"));
    const heading = page.getByRole("heading", {
      name: "让工程文档成为清晰的阅读体验",
      exact: true,
    });
    try {
      await expect.poll(() => updating).toBe(true);
      await expect(heading).toBeVisible();
    } finally {
      release();
    }
    await expect(page.locator("main").getByRole("alert")).toContainText(
      "更新暂时失败",
    );
    await expect(heading).toBeVisible();
  } finally {
    await viewer.close();
  }
});
