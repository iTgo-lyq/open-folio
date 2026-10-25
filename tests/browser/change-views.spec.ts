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
});
