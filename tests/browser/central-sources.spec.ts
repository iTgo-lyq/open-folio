import { test, expect, repositoryQuery } from "./connected";
import { primaryRecord, type Snapshot } from "../../src/lib/model";

test("central entry and target record remain distinct when progress differs or the target is unavailable", async ({
  page,
  request,
  personal,
}) => {
  const data: Snapshot = await (
    await request.get(personal.url("workbench"))
  ).json();
  const group = data.changes.find((g) => g.id === "document-reader")!;
  expect(primaryRecord(group)?.state?.stage).toBe("execution");
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  const entry = page.getByRole("region", { name: "集中入口" });
  await expect(entry).toContainText("develop");
  await expect(entry).toContainText("完整记录来源：change/document-reader");
  await entry.getByRole("button", { name: "查看入口记录" }).click();
  await expect(page.locator(".raw-document")).toContainText(
    '"stage":"requirement"',
  );
  group.primary = null;
  group.candidates = [];
  group.diagnostics = [
    {
      code: "SOURCE_INVALID",
      severity: "error",
      message: "登记的工作分支不存在；不采用集中旧副本。",
    },
  ];
  await page.route("**/api/repositories/*/workbench*", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto(`/?${repositoryQuery}&m=changes&c=document-reader`);
  await expect(
    page.getByText("登记的工作分支不存在；不采用集中旧副本。", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "集中入口" })).toContainText(
    "change/document-reader",
  );
});
