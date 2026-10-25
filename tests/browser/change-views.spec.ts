import { test, expect, repositoryQuery, connectRequest } from "./connected";

test("default mine and recent system selection restore across devices without extra refresh", async ({
  page,
  request,
  browser,
  personal,
}) => {
  let refreshes = 0;
  page.on("request", (req) => {
    if (req.url().includes("/refresh?")) refreshes++;
  });
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /^我的/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(new URL(page.url()).searchParams.get("creatorSelf")).toBe("1");
  const before = refreshes;
  await page.getByRole("tab", { name: /已归档/ }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(personal.url("change-views"))).json())
          .selected.id,
    )
    .toBe("archived");
  await page.getByRole("tab", { name: /进行中/ }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(personal.url("change-views"))).json())
          .selected.id,
    )
    .toBe("active");
  expect(refreshes).toBe(before);
  const context = await browser.newContext();
  try {
    await connectRequest(context.request, "token-b", personal.username);
    const other = await context.newPage();
    await other.goto(`/?${repositoryQuery}&m=changes`);
    await expect(other.getByRole("tab", { name: /进行中/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(new URL(other.url()).searchParams.has("creatorSelf")).toBe(false);
    await other.goto(
      `/?${repositoryQuery}&m=changes&states=[]&creatorSelf=1&view=board`,
    );
    await expect(
      other.getByRole("heading", { name: "Changes", exact: true }),
    ).toBeVisible();
    expect(new URL(other.url()).searchParams.get("states")).toBe("[]");
    expect(new URL(other.url()).searchParams.get("view")).toBe("board");
    await other.reload();
    await expect(
      other.getByRole("heading", { name: "Changes", exact: true }),
    ).toBeVisible();
    expect(new URL(other.url()).searchParams.get("states")).toBe("[]");
  } finally {
    await context.close();
  }
});

test("delayed view response does not replace an explicit URL or detail target", async ({
  page,
}) => {
  await page.route("**/change-views?*", async (route) => {
    if (route.request().method() === "GET")
      await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=active&creator=[%22nobody%22]`,
  );
  await expect(page.getByRole("tab", { name: /^我的/ })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("creator")).toBe('["nobody"]');
  expect(new URL(page.url()).searchParams.has("creatorSelf")).toBe(false);
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  await expect(
    page.getByRole("button", { name: "返回 Changes 列表", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("c")).toBe("document-reader");
  await page
    .getByRole("button", { name: "返回 Changes 列表", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /进行中/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(new URL(page.url()).searchParams.has("creatorSelf")).toBe(false);
});

test("management inherits current query, edits saved definitions and commits or cancels the draft", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&scope=active&creatorSelf=1&view=board&group=none&urgency=high`,
  );
  await expect(
    page.getByRole("button", { name: "管理视图", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  let panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "添加视图", exact: true }).click();
  await expect(panel.getByLabel("我（当前 GitHub 身份）")).toBeChecked();
  await expect(
    panel.getByRole("combobox", { name: "显示", exact: true }),
  ).toHaveValue("board");
  await expect(
    panel.getByRole("combobox", { name: "分组", exact: true }),
  ).toHaveValue("none");
  await expect(panel.getByLabel("高", { exact: true })).toBeChecked();
  await panel.getByLabel("视图名称").fill("交付关注");
  await panel.getByRole("checkbox", { name: "已归档", exact: true }).check();
  await panel.getByRole("button", { name: "完成编辑" }).click();
  await expect(page.getByRole("tab", { name: /交付关注/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByRole("tab", { name: /交付关注/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const saved = await (await request.get(personal.url("change-views"))).json();
  expect(saved.views[1].query.states).toEqual(["active", "archived"]);
  expect(saved.views[1].query.display).toBe("board");
  await expect(page.getByRole("region", { name: /按阶段看板/ })).toHaveCount(0);
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  await panel
    .getByRole("button", { name: "隐藏 交付关注", exact: true })
    .click();
  await panel.getByRole("button", { name: "删除 我的", exact: true }).click();
  await panel.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^我的/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /交付关注/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByRole("button", { name: "移除筛选 已归档", exact: true })
    .click();
  await expect(page.getByText("未保存修改", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  await panel
    .getByRole("button", { name: "编辑 交付关注", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", { name: "已归档", exact: true }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "取消编辑", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "管理视图", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "恢复视图", exact: true }).click();
  await expect(page.getByText("未保存修改", { exact: true })).toHaveCount(0);
});

test("failed save and conflict retain drafts, deletion of mine does not recreate it", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "编辑 我的", exact: true }).click();
  await panel.getByLabel("视图名称").fill("本人关注");
  await panel.getByRole("button", { name: "完成编辑" }).click();
  let fail = true;
  await page.route("**/change-views?*", (route) =>
    route.request().method() === "PUT" && fail
      ? route.fulfill({
          status: 503,
          json: { error: { code: "FAILED", message: "模拟暂时保存失败" } },
        })
      : route.continue(),
  );
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText("模拟暂时保存失败");
  await expect(panel.getByText("本人关注", { exact: true })).toBeVisible();
  expect(
    (await (await request.get(personal.url("change-views"))).json()).views[0]
      .name,
  ).toBe("我的");
  fail = false;
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByRole("tab", { name: /本人关注/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  await panel
    .getByRole("button", { name: "删除 本人关注", exact: true })
    .click();
  const record = await (await request.get(personal.url("change-views"))).json();
  const session = await (await request.get("/api/session")).json();
  const response = await request.put(personal.url("change-views"), {
    headers: {
      origin: "http://127.0.0.1:10682",
      "X-OpenFolio-Revision": String(session.browserRevision),
    },
    data: { expectedRevision: record.revision, views: record.views },
  });
  expect(response.ok()).toBe(true);
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("其他页面更新");
  await panel.getByRole("button", { name: "复制本地配置" }).click();
  await expect(
    panel.getByRole("textbox", { name: "本地配置（可全选复制）" }),
  ).toHaveValue("[]");
  await panel
    .getByRole("button", { name: "重新加载管理列表（丢弃草稿）" })
    .click();
  await panel
    .getByRole("button", { name: "删除 本人关注", exact: true })
    .click();
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect(page.getByRole("tab", { name: /进行中/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /进行中/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: /^我的|本人关注/ })).toHaveCount(
    0,
  );
});

test("default chips stay hidden and personal order supports pointer and keyboard drag", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /^我的/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "筛选", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("已选筛选", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  const panel = page.getByRole("dialog");
  for (const name of ["甲组", "乙组"]) {
    await panel.getByRole("button", { name: "添加视图", exact: true }).click();
    await panel.getByLabel("视图名称").fill(name);
    await panel.getByRole("button", { name: "完成编辑" }).click();
  }
  const handle = panel.getByRole("button", { name: "拖动 乙组 排序" });
  const start = (await handle.boundingBox())!,
    target = (await panel
      .getByRole("button", { name: "拖动 我的 排序" })
      .boundingBox())!;
  await page.mouse.move(start.x + 10, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(target.x + 10, target.y + 10, { steps: 8 });
  await page.mouse.up();
  await expect(panel.getByRole("listitem").first()).toContainText("乙组");
  await handle.focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect(panel.getByRole("listitem").nth(1)).toContainText("乙组");
  await expect(panel.getByRole("button", { name: /上移|下移/ })).toHaveCount(0);
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await expect
    .poll(async () =>
      (
        await (await request.get(personal.url("change-views"))).json()
      ).views.map((v: { name: string }) => v.name),
    )
    .toEqual(["我的", "乙组", "甲组"]);
  const labels = await page
    .getByRole("tablist", { name: "Change 状态" })
    .getByRole("tab")
    .allTextContents();
  expect(labels[0]).toMatch(/进行中/);
  expect(labels[1]).toMatch(/已完成/);
  expect(labels[2]).toMatch(/已归档/);
  expect(labels.slice(-3).map((s) => s.replace(/\d+$/, ""))).toEqual([
    "我的",
    "乙组",
    "甲组",
  ]);
  for (const width of [1440, 834, 390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await page.getByRole("button", { name: "管理视图", exact: true }).click();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect(
      panel.getByRole("button", { name: "确认", exact: true }),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
  }
});

test("a late save response cannot replace a newer revision from another browser", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "编辑 我的", exact: true }).click();
  await panel.getByLabel("视图名称").fill("旧名字");
  await panel.getByRole("button", { name: "完成编辑" }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saved!: () => void;
  const captured = new Promise<void>((resolve) => {
    saved = resolve;
  });
  await page.route("**/change-views?*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const response = await route.fetch();
    saved();
    await gate;
    await route.fulfill({ response });
  });
  await panel.getByRole("button", { name: "确认", exact: true }).click();
  await captured;
  const old = await (await request.get(personal.url("change-views"))).json();
  const session = await (await request.get("/api/session")).json();
  const response = await request.put(personal.url("change-views"), {
    headers: {
      origin: "http://127.0.0.1:10682",
      "X-OpenFolio-Revision": String(session.browserRevision),
    },
    data: {
      expectedRevision: old.revision,
      views: [{ ...old.views[0], name: "最新名字" }],
    },
  });
  expect(response.ok()).toBe(true);
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().includes("/change-views?") &&
      response.request().method() === "GET",
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;
  // A modal hides the background from accessibility queries; inspect its DOM label.
  await expect(
    page.locator('[role="tab"]').filter({ hasText: "最新名字" }),
  ).toHaveCount(1);
  release();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /最新名字/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: /旧名字/ })).toHaveCount(0);
});

test("touch dragging works in a narrow dark management panel", async ({
  browser,
  personal,
}, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    await connectRequest(context.request, "token-a", personal.username);
    const page = await context.newPage();
    await page.goto(`/?${repositoryQuery}&m=changes`);
    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    );
    await page.getByRole("button", { name: "管理视图", exact: true }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("button", { name: "添加视图", exact: true }).click();
    await panel.getByLabel("视图名称").fill("触屏视图");
    await panel.getByRole("button", { name: "完成编辑" }).click();
    const start = (await panel
        .getByRole("button", { name: "拖动 触屏视图 排序" })
        .boundingBox())!,
      target = (await panel
        .getByRole("button", { name: "拖动 我的 排序" })
        .boundingBox())!;
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start.x + 12, y: start.y + 12 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: target.x + 12, y: target.y + 12 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(panel.getByRole("listitem").first()).toContainText("触屏视图");
    await page.screenshot({
      path: testInfo.outputPath("views-touch-dark.png"),
    });
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByRole("tab", { name: /触屏视图/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});
