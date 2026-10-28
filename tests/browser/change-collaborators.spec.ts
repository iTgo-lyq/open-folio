import { test, expect, repositoryQuery, changeDisplay } from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("collaborator groups match the approved prototype across themes, widths, keyboard and board navigation", async ({
  page,
  request,
  personal,
}, testInfo) => {
  test.setTimeout(90000);
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const change = data.changes.find((c) => c.id === "document-reader")!;
  change.title = "多人协作交付";
  change.creator = { name: "林知远", login: "demo-lin", subjectId: "1" };
  change.collaborators = [
    change.creator,
    ...[
      "陈一",
      "周屿",
      "许宁",
      "唐禾",
      "宋遥",
      "陆青",
      "何川",
      "沈言",
      "苏雨",
      "叶舟",
      "顾澄",
    ].map((name, i) => ({ name, login: `demo-person-${i}` })),
  ];
  change.diagnostics = [];
  const record = primaryRecord(change)!;
  record.diagnostics = [];
  record.state = {
    ...record.state!,
    status: "active",
    stage: "execution",
    tasks: {},
  };
  delete record.state.waitingFor;
  data.changes = [change];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const theme of ["light", "dark"])
    for (const [width, height] of [
      [1440, 900],
      [834, 1194],
      [390, 844],
      [320, 720],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?${repositoryQuery}&m=changes&scope=active`);
      await page.evaluate(
        (theme) => document.documentElement.setAttribute("data-theme", theme),
        theme,
      );
      const trigger = page.locator(
        '[data-collaborators-for="document-reader"]',
      );
      await expect(trigger).toHaveText(/\+9/);
      await expect(page.locator("[data-show-creator]")).toHaveCount(0);
      await trigger.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "协作者 12" });
      await expect(dialog).toBeVisible();
      const members = dialog.getByRole("listitem");
      await expect(members).toHaveCount(12);
      await expect(members.first()).toContainText("林知远");
      await expect(members.first()).toContainText("创建者");
      expect(
        await dialog
          .getByRole("list")
          .evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      await members.last().scrollIntoViewIfNeeded();
      await expect(members.last()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/change-collaborators-${theme}-${width}.png`,
      });
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(page).not.toHaveURL(/&c=/);
      if (width >= 834) {
        await changeDisplay(page, "看板");
        await trigger.click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "关闭协作者" }).click();
        await expect(trigger).toBeFocused();
        await expect(page).not.toHaveURL(/&c=/);
        await page
          .getByRole("link", { name: "打开 多人协作交付", exact: true })
          .click();
        await expect(page).toHaveURL(/c=document-reader/);
      }
    }
  expect(errors).toEqual([]);
  await testInfo.attach("prototype states", {
    body: "12 members; creator first; 2 themes x 4 widths; list/board; keyboard and real pointer; focus restored",
    contentType: "text/plain",
  });
});

test("creator column preference saves with a personal view and restores after reopening", async ({
  page,
  request,
  personal,
}) => {
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page.getByRole("tab", { name: /^我的/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "显示", exact: true }).click();
  const choice = page.getByRole("menuitemcheckbox", {
    name: "创建者",
    exact: true,
  });
  await expect(choice).not.toBeChecked();
  await choice.click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/showCreator=1/);
  await page
    .getByRole("button", { name: "保存到当前视图", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (await request.get(personal.url("change-views"))).json()
        ).views.find((v: { id: string }) => v.id === "mine").query.showCreator,
    )
    .toBe(true);
  await page.goto(`/?${repositoryQuery}&m=changes`);
  await expect(page).toHaveURL(/showCreator=1/);
  await page.getByRole("button", { name: "显示", exact: true }).click();
  await expect(choice).toBeChecked();
});
