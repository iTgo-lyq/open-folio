import {
  test,
  expect,
  repositoryQuery,
  repoKey,
  openMaterial,
  backToChanges,
} from "./connected";
const path = `/?${repositoryQuery}&m=changes&c=document-reader&ct=previews`;
test("unreadable fixed versions show a failure instead of an empty inventory or a replacement preview", async ({
  page,
}) => {
  await page.goto(path + "&revision=" + "0".repeat(40));
  const dialog = page.getByRole("main");
  await expect(dialog.getByText("原型读取失败", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("该 Git 版本已不可用，请重新获取对应交付历史。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText("暂无可预览的入口", { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator("iframe")).toHaveCount(0);
});
test("Change previews switch declared devices without changing layout dimensions when scaling", async ({
  page,
}) => {
  await page.goto(path);
  const panel = page.getByRole("region", { name: "Change 原型预览" });
  await expect(panel).toBeVisible();
  const iframe = panel.locator("iframe");
  await expect(iframe).toHaveAttribute("width", "1440");
  await expect(iframe).toHaveAttribute("height", "900");
  await expect(
    page
      .frameLocator('iframe[title="原型：订单列表"]')
      .getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  const frame = () =>
    page.frames().find((f) => f.url().includes("/api/public-previews/"))!;
  expect(await frame().evaluate(() => innerWidth)).toBe(1440);
  await panel.getByRole("button", { name: "移动设备", exact: true }).click();
  await expect(iframe).toHaveAttribute("width", "390");
  await expect(iframe).toHaveAttribute("height", "844");
  expect(await frame().evaluate(() => innerWidth)).toBe(390);
  await panel.getByRole("button", { name: "100%", exact: true }).click();
  await expect(iframe).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await panel.getByRole("button", { name: "适应画布", exact: true }).click();
  expect(await frame().evaluate(() => innerWidth)).toBe(390);
  await panel.getByRole("button", { name: "切换横竖方向" }).click();
  await expect(iframe).toHaveAttribute("width", "844");
  await expect(iframe).toHaveAttribute("height", "390");
  await panel
    .getByRole("button", { name: "订单详情 页面", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "移动设备", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "iPad", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: "价格卡片 组件", exact: true })
    .click();
  await expect(iframe).toHaveAttribute("width", "640");
  await expect(iframe).toHaveAttribute("height", "320");
  await expect(panel.getByRole("button", { name: "切换横竖方向" })).toHaveCount(
    0,
  );
  await expect(panel.getByText("自定义组件")).toBeVisible();
});
test("fixed revision links restore the entry and invalid exports remain readable errors", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(path + "&preview=card");
  await expect(page.locator('iframe[title="原型：价格卡片"]')).toBeVisible();
  await page.getByRole("button", { name: "复制固定版本链接" }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).pathname).toMatch(/^\/preview\/[a-f0-9]{64}$/);
  await page.goto(link);
  await expect(page.locator("iframe")).toHaveAttribute("width", "640");
  await page.goBack();
  await page
    .getByRole("button", { name: "待导出页面 页面 · 暂不可用", exact: true })
    .click();
  await expect(page.getByText("暂时无法预览", { exact: true })).toBeVisible();
  await expect(
    page.getByText("入口缺失或不是常规 Git 文件。", { exact: true }),
  ).toBeVisible();
  await backToChanges(page);
  await expect(
    page.getByRole("region", { name: "阅读正文", exact: true }),
  ).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("revision")).toBe(false);
});
test("narrow screens keep component dimensions and unsupported links recover to declared choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path + "&preview=card");
  const iframe = page.locator('iframe[title="原型：价格卡片"]');
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("width", "640");
  expect(
    await page
      .frames()
      .find((f) => f.url().includes("/api/public-previews/"))!
      .evaluate(() => innerWidth),
  ).toBe(640);
  expect(
    await page
      .getByRole("region", { name: "阅读正文", exact: true })
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.goto(path + "&preview=unknown&device=watch");
  await expect(
    page.getByText("链接中的入口不存在，已显示首个可用入口。"),
  ).toBeVisible();
  await expect(
    page.getByText("该入口未声明链接中的设备，已选择其支持的尺寸。"),
  ).toBeVisible();
  await expect(page.locator('iframe[title="原型：订单列表"]')).toHaveAttribute(
    "width",
    "1440",
  );
  await openMaterial(page, "需求");
  await expect(
    page
      .getByRole("region", { name: "阅读正文", exact: true })
      .getByRole("heading", {
        name: "让工程文档成为清晰的阅读体验",
        exact: true,
      }),
  ).toBeVisible();
});

test("host-built React chunks and shared UI run in opaque sandbox; fixed hosted URLs never get HEAD or load query", async ({
  page,
}) => {
  await page.clock.install();
  const requests: { method: string; url: string }[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("https://127.0.0.1:10686"))
      requests.push({ method: r.method(), url: r.url() });
  });
  await page.goto(path + "&preview=hosted");
  const frame = page.frameLocator('iframe[title="原型：托管 React"]');
  await expect(
    frame.getByRole("heading", { name: "托管 React 页面" }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "已添加 0 次" }).click();
  await expect(
    frame.getByRole("button", { name: "已添加 1 次" }),
  ).toBeVisible();
  await expect(page.getByText("页面已就绪", { exact: true })).toBeVisible();
  await expect(
    page.locator('iframe[title="原型：托管 React"]'),
  ).toHaveAttribute("sandbox", "allow-scripts");
  expect(requests.some((r) => r.url.endsWith(".js"))).toBe(true);
  expect(
    requests.every((r) => r.method === "GET" && !r.url.includes("load=")),
  ).toBe(true);
  await page
    .getByRole("button", { name: "未接就绪回报 页面", exact: true })
    .click();
  await expect(
    page
      .frameLocator('iframe[title="原型：未接就绪回报"]')
      .getByRole("heading"),
  ).toBeVisible();
  await expect(page.getByText("页面已加载", { exact: true })).toBeVisible();
  await page.clock.fastForward(5500);
  await expect(page.getByText("页面已加载", { exact: true })).toBeVisible();
  await expect(page.getByText(/尚未确认页面就绪/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "独立打开" })).toHaveAttribute(
    "href",
    /#no-bridge$/,
  );
});

test("published Git prototypes still report script and CSP errors to the owning canvas", async ({
  page,
}) => {
  for (const code of ["runtime", "network"]) {
    await page.goto(path + "&preview=orders");
    const frame = page.frameLocator('iframe[title="原型：订单列表"]');
    await expect(frame.getByRole("heading")).toBeVisible();
    await frame.locator("body").evaluate((_body, code) => {
      if (code === "runtime")
        setTimeout(() => {
          throw Error("fixture runtime fault");
        }, 0);
      else void fetch("https://example.invalid/blocked").catch(() => {});
    }, code);
    await expect(
      page.getByText(
        code === "runtime"
          ? "原型脚本发生错误，请在原型包中检查并重新导出。"
          : "原型仍依赖外部资源或不支持的能力，请重新导出自包含 HTML。",
        { exact: true },
      ),
    ).toBeVisible();
  }
});
