import {
  test,
  expect,
  repositoryQuery,
  connectRequest,
  revisionHeaders,
  refreshCentral,
} from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("an old GET started during a save cannot undo the successful write", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await page.getByRole("button", { name: "管理视图", exact: true }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "编辑 我的", exact: true }).click();
  await panel.getByLabel("视图名称").fill("保存后的名称");
  await panel.getByRole("button", { name: "完成编辑" }).click();
  let startPut!: () => void,
    releasePut!: () => void,
    startGet!: () => void,
    releaseGet!: () => void;
  const putStarted = new Promise<void>((r) => {
      startPut = r;
    }),
    putGate = new Promise<void>((r) => {
      releasePut = r;
    });
  const getStarted = new Promise<void>((r) => {
      startGet = r;
    }),
    getGate = new Promise<void>((r) => {
      releaseGet = r;
    });
  await page.route("**/change-views?*", async (route) => {
    if (route.request().method() === "PUT") {
      startPut();
      await putGate;
      return route.continue();
    }
    if (route.request().method() === "GET") {
      const response = await route.fetch();
      startGet();
      await getGate;
      return route.fulfill({ response });
    }
    await route.continue();
  });
  try {
    await panel.getByRole("button", { name: "确认", exact: true }).click();
    await putStarted;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await getStarted;
    releasePut();
    await expect(page.getByRole("tab", { name: /保存后的名称/ })).toBeVisible();
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/change-views?") && r.request().method() === "GET",
    );
    releaseGet();
    await response;
    await expect(
      page.getByRole("tab", { name: /保存后的名称/ }),
    ).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "管理视图", exact: true }).click();
    await expect(
      panel.getByText("保存后的名称", { exact: true }),
    ).toBeVisible();
  } finally {
    releasePut();
    releaseGet();
  }
});

test("cancelled count dropping to zero keeps the open detail and changes only its list context", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const cancelled = data.changes.find(
    (g) => primaryRecord(g)?.state?.status === "cancelled",
  )!;
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&scope=cancelled`);
  await page
    .getByRole("link", { name: `打开 ${cancelled.title}`, exact: true })
    .click();
  const state = primaryRecord(cancelled)!.state!;
  state.status = "active";
  delete state.cancellation;
  await refreshCentral(page);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("scope"))
    .toBe("active");
  expect(new URL(page.url()).searchParams.get("c")).toBe(cancelled.id);
  await page
    .getByRole("button", { name: "返回 Changes 列表", exact: true })
    .click();
  await expect(page.getByRole("tab", { name: /已取消/ })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /进行中/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("a delayed private view read is discarded after account replacement", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /^我的/ })).toBeVisible();
  const initial = await (
    await request.get(personal.url("change-views"))
  ).json();
  const saved = await request.put(personal.url("change-views"), {
    headers: await revisionHeaders(request),
    data: {
      expectedRevision: initial.revision,
      views: [{ ...initial.views[0], name: "账号一专用" }],
    },
  });
  expect(saved.ok()).toBe(true);
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    ready = new Promise<void>((r) => {
      captured = r;
    });
  await page.route("**/change-views?*", async (route) => {
    if (
      route.request().method() === "GET" &&
      new URL(route.request().url()).searchParams.get("connectionId") ===
        personal.id
    ) {
      const response = await route.fetch();
      captured();
      await gate;
      await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await ready;
    expect(
      (
        await request.delete("/api/session", {
          headers: await revisionHeaders(request),
        })
      ).ok(),
    ).toBe(true);
    const replacement = await connectRequest(request, "token-b");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("button", {
        name: `账号：${replacement.username}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /^我的/ })).toBeVisible();
    release();
    await page.getByRole("button", { name: "管理视图", exact: true }).click();
    await expect(
      page.getByRole("dialog").getByText("我的", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("账号一专用", { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
});

test("a late save preserves a newer tab selection when returning through a fresh entry", async ({
  page,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /^我的/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "高", exact: true }).click();
  await page.keyboard.press("Escape");
  let release!: () => void, captured!: () => void;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    ready = new Promise<void>((r) => {
      captured = r;
    });
  await page.route("**/change-views?*", async (route) => {
    if (route.request().method() === "PUT") {
      const response = await route.fetch();
      captured();
      await gate;
      return route.fulfill({ response });
    }
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "保存到当前视图" }).click();
    await ready;
    const patched = page.waitForResponse(
      (r) =>
        r.url().includes("/change-views?") && r.request().method() === "PATCH",
    );
    await page.getByRole("tab", { name: /已归档/ }).click();
    await patched;
    const saved = page.waitForResponse(
      (r) =>
        r.url().includes("/change-views?") && r.request().method() === "PUT",
    );
    release();
    await saved;
    await page.evaluate(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    await page.evaluate((query) => {
      history.pushState({}, "", `/?${query}&m=changes`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, repositoryQuery);
    await expect(page.getByRole("tab", { name: /已归档/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  } finally {
    release();
  }
});
