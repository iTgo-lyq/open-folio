import { test, expect, repositoryQuery } from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("reading directories collapse from the pane into a header location switcher", async ({
  page,
}) => {
  for (const [target, label, current] of [
    [`/?${repositoryQuery}&m=specs&s=platform`, "能力目录", "工程协作"],
    [`/?${repositoryQuery}&m=changes&c=document-reader`, "Change 材料", "概览"],
  ]) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(target);
    const bar = page.locator("main > header");
    const pane = page.getByRole("complementary", { name: label, exact: true });
    const hide = pane.getByRole("button", { name: "收起目录", exact: true });
    const switcher = bar.getByRole("button", {
      name: `${label}：${current}`,
      exact: true,
    });
    await expect(hide).toBeVisible();
    await expect(bar.getByRole("button", { name: "收起目录" })).toHaveCount(0);
    await expect(switcher).toHaveCount(0);
    await hide.click();
    await expect(pane).toBeHidden();
    await expect(switcher).toBeFocused();
    await expect(switcher).toContainText(current);
    await switcher.click();
    const panel = page.getByRole("dialog", { name: label, exact: true });
    await expect(panel.getByRole("navigation", { name: label })).toBeVisible();
    await expect(panel.locator("[aria-current]")).toBeFocused();
    await panel.getByRole("button", { name: "展开目录", exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(hide).toBeFocused();
    await expect(switcher).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await switcher.click();
    await expect(
      page
        .getByRole("dialog", { name: label, exact: true })
        .getByRole("button", { name: "展开目录" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(switcher).toBeFocused();
    await page.setViewportSize({ width: 834, height: 1000 });
    await switcher.click();
    await expect(panel).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(hide).toBeFocused();
    await page.setViewportSize({ width: 834, height: 1000 });
    await expect(switcher).toBeVisible();
    await expect(panel).toBeHidden();
  }
});

test("raw reading uses a wide sheet and one source line on desktop and phone", async ({
  page,
}) => {
  await page.goto(
    `/?${repositoryQuery}&m=changes&c=document-reader&ct=requirement`,
  );
  const source = page.getByRole("group", { name: "文档来源", exact: true });
  await expect(source).toBeVisible();
  await expect(source).not.toContainText("develop");
  expect(
    await source.evaluate((el) => el.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(36);
  await page.getByRole("button", { name: "查看原文", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "原文", exact: true });
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () => Math.round((await sheet.boundingBox())!.width))
    .toBeGreaterThanOrEqual(720);
  await expect(sheet.locator("pre")).toContainText("# 让工程文档");
  await page.screenshot({ path: "/tmp/of-refactor-feedback-raw-desktop.png" });
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(288);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await sheet.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    );
  });
  await page.screenshot({ path: "/tmp/of-refactor-feedback-raw-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "查看原文", exact: true }),
  ).toBeFocused();
});

test("first visit uses a centered collapsed logo and list titles stay in the content", async ({
  page,
}) => {
  for (const [module, title] of [
    ["changes", "Changes"],
    ["prototypes", "原型"],
  ]) {
    await page.goto(`/?${repositoryQuery}&m=${module}`);
    const titleNode = page.getByRole("heading", { name: title, exact: true });
    await expect(titleNode).toBeVisible();
    await expect(
      page
        .locator("main > header")
        .getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(0);
    await expect(titleNode).toHaveCount(1);
    expect(
      await titleNode.evaluate(
        (el) =>
          el.closest("main > header") === null && el.closest("main") !== null,
      ),
    ).toBe(true);
    const logo = page.getByRole("button", { name: "展开侧栏", exact: true });
    await expect(logo).toBeVisible();
    const dimensions = await logo.evaluate((el) => {
      const button = el.getBoundingClientRect(),
        side = el.closest("aside")!.getBoundingClientRect(),
        mark = el.querySelector("svg")!.getBoundingClientRect();
      return {
        width: button.width,
        left: button.left - side.left,
        right: button.right - side.right,
        center: mark.x + mark.width / 2 - (side.x + side.width / 2),
      };
    });
    expect(dimensions.width).toBeLessThanOrEqual(44);
    expect(dimensions.left).toBeGreaterThanOrEqual(0);
    expect(dimensions.right).toBeLessThanOrEqual(0);
    expect(Math.abs(dimensions.center)).toBeLessThanOrEqual(1);
    await expect(
      page.getByRole("button", { name: /复制页面链接|复制阅读链接/ }),
    ).toHaveCount(0);
  }
});

test("Specs show only the five newest related Changes", async ({
  page,
  request,
  personal,
}) => {
  const snapshot: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const base = snapshot.changes.find((g) => g.id === "document-reader")!;
  snapshot.changes = Array.from({ length: 9 }, (_, i) => {
    const g = structuredClone(base);
    g.id = `related-${i}`;
    g.title = `关联记录 ${i}`;
    g.createdAt = `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`;
    primaryRecord(g)!.relatedSpecs = ["platform/access"];
    return g;
  });
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.goto(`/?${repositoryQuery}&m=specs&s=platform%2Faccess`);
  const related = page.getByRole("region", {
    name: "相关 Change",
    exact: true,
  });
  await expect(related.getByRole("link")).toHaveCount(5);
  await expect(related.locator("li strong")).toHaveText(
    [8, 7, 6, 5, 4].map((i) => `关联记录 ${i}`),
  );
  await expect(related).not.toContainText("关联记录 3");
});
