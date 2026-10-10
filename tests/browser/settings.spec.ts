import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

let configPath: string;
let original: string;
test.beforeEach(async () => {
  configPath = JSON.parse(
    await readFile("artifacts/e2e-runtime.json", "utf8"),
  ).config;
  original = await readFile(configPath, "utf8");
});
test.afterEach(async () => {
  await writeFile(configPath, original);
});

test("configuration edits persist, update the selected project and restore default limits", async ({
  page,
}) => {
  await page.goto("/?project=fixture&m=specs&s=platform");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await panel.getByLabel("项目名称", { exact: true }).fill("团队知识库");
  await panel.locator("summary").filter({ hasText: "资源限制" }).click();
  await panel.getByLabel("最短刷新间隔（秒）", { exact: true }).fill("60");
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  expect(JSON.parse(await readFile(configPath, "utf8")).limits.refreshMs).toBe(
    60000,
  );
  await expect(page.getByLabel("当前项目")).toContainText("团队知识库");
  await panel.getByLabel("最短刷新间隔（秒）", { exact: true }).fill("");
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  expect(JSON.parse(await readFile(configPath, "utf8")).limits).toBeUndefined();
  await page.screenshot({ path: "artifacts/settings-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "工作台配置", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.getByLabel("当前项目")).toContainText("团队知识库");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
});

test("empty configuration supports adding and removing projects without restarting", async ({
  page,
}) => {
  await writeFile(
    configPath,
    JSON.stringify({ schemaVersion: 1, projects: [] }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "配置项目", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await panel.getByRole("button", { name: "添加项目", exact: true }).click();
  const project = JSON.parse(original).projects[0];
  await panel.getByLabel("项目名称", { exact: true }).fill(project.name);
  await panel.getByLabel("项目标识", { exact: true }).fill(project.id);
  await panel
    .getByLabel("仓库地址", { exact: true })
    .fill(project.repositoryUrl);
  if (project.specBranch)
    await panel
      .getByLabel("默认分支（可选）", { exact: true })
      .fill(project.specBranch);
  if (project.prototypeOrigins)
    await panel
      .getByLabel("原型来源（可选）", { exact: true })
      .fill(project.prototypeOrigins.join("\n"));
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  await panel.getByRole("button", { name: "关闭配置", exact: true }).click();
  await page
    .getByRole("navigation", { name: "能力目录" })
    .getByRole("button", { name: "工程协作", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  await panel
    .getByRole("button", { name: `移除项目 ${project.name}`, exact: true })
    .click();
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "连接你的中心 Git 仓库", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/project=fixture/);
  expect(JSON.parse(await readFile(configPath, "utf8")).projects).toEqual([]);
});

test("conflicts and invalid settings retain drafts and preserve file contents", async ({
  page,
}) => {
  await page.goto("/?project=fixture");
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await panel.getByLabel("项目名称", { exact: true }).fill("我的草稿");
  const changed = JSON.parse(original);
  changed.projects[0].name = "外部更新";
  await writeFile(configPath, JSON.stringify(changed));
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("配置已被修改");
  await expect(panel.getByLabel("项目名称", { exact: true })).toHaveValue(
    "我的草稿",
  );
  expect(JSON.parse(await readFile(configPath, "utf8")).projects[0].name).toBe(
    "外部更新",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await panel
    .getByRole("button", { name: "重新加载配置", exact: true })
    .click();
  await expect(panel.getByLabel("项目名称", { exact: true })).toHaveValue(
    "外部更新",
  );
  await panel
    .getByLabel("仓库地址", { exact: true })
    .fill("http://example.com/repo.git");
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("配置不合法");
  expect(JSON.parse(await readFile(configPath, "utf8"))).toEqual(changed);
});

test("mobile configuration warns before discarding edits and fits narrow screens", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?project=fixture");
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await panel.getByLabel("项目名称", { exact: true }).fill("未保存修改");
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("alert")).toContainText("有未保存的修改");
  await panel.getByRole("button", { name: "继续编辑", exact: true }).click();
  await expect(panel.getByLabel("项目名称", { exact: true })).toHaveValue(
    "未保存修改",
  );
  await page.screenshot({ path: "artifacts/settings-mobile.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await panel.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(panel).not.toBeVisible();
  expect(await readFile(configPath, "utf8")).toBe(original);
});

test("replacing a repository clears stale document selection and snapshot", async ({
  page,
}) => {
  await page.goto("/?project=fixture&m=specs&s=platform");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "工作台配置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "工作台配置", exact: true });
  await panel
    .getByLabel("仓库地址", { exact: true })
    .fill("https://example.invalid/replaced.git");
  await panel.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText("配置已保存");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/s=platform/);
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "暂时没有可读取的版本", exact: true }),
  ).toBeVisible();
});
