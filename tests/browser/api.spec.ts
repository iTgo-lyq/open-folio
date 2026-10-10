import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
const origin = "http://127.0.0.1:10682";
test("API accepts unregistered Hosts and enforces project, snapshot, document and Origin boundaries", async ({
  request,
}) => {
  const projects = await request.get("/api/projects");
  expect(projects.ok()).toBe(true);
  expect(projects.headers()["cache-control"]).toContain("no-store");
  const snapshot = (await projects.json()).projects[0].snapshotId;
  const workbench = await request.get(
    `/api/projects/fixture/workbench?snapshot=${snapshot}`,
  );
  const data = await workbench.json();
  expect(data.specs).toHaveLength(3);
  const doc = data.documents.find(
    (d: { path: string; branch: string }) =>
      d.branch === "main" && d.path === "docs/project/specs/platform/spec.md",
  );
  expect(
    (
      await request.get(
        `/api/projects/fixture/documents/${doc.id}?snapshot=${snapshot}`,
      )
    ).ok(),
  ).toBe(true);
  for (const [path, status] of [
    ["/api/projects/missing/workbench", 404],
    ["/api/projects/fixture/workbench?branch=missing", 404],
    ["/api/projects/fixture/workbench?snapshot=..%2Fconfig", 400],
    [
      "/api/projects/fixture/workbench?snapshot=00000000-0000-4000-8000-000000000000",
      410,
    ],
    [`/api/projects/fixture/documents/not-in-list?snapshot=${snapshot}`, 404],
    [`/api/projects/fixture/documents/${doc.id}`, 400],
    [`/api/projects/fixture/assets/${doc.id}?snapshot=${snapshot}`, 404],
  ] as const)
    expect((await request.get(path)).status(), path).toBe(status);
  expect(
    (
      await request.get("/api/projects", {
        headers: { host: "proxy.internal:9000" },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get("/api/projects", {
        headers: { origin: "https://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post("/api/projects/fixture/refresh")).status()).toBe(
    403,
  );
  expect(
    (
      await request.post("/api/projects/fixture/refresh", {
        headers: { origin, host: "proxy.internal:9000" },
        data: "unexpected",
      })
    ).status(),
  ).toBe(400);
  const asset = data.documents.find(
    (d: { path: string; branch: string }) =>
      d.path.endsWith("/pixel.png") && d.branch === "main",
  );
  const image = await request.get(
    `/api/projects/fixture/assets/${asset.id}?snapshot=${snapshot}`,
  );
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["x-content-type-options"]).toBe("nosniff");
});
test("removing a configured project hides all cached content immediately", async ({
  request,
}) => {
  const runtime = JSON.parse(
      await readFile("artifacts/e2e-runtime.json", "utf8"),
    ),
    original = await readFile(runtime.config, "utf8"),
    config = JSON.parse(original);
  try {
    await writeFile(
      runtime.config,
      JSON.stringify({ ...config, projects: [] }),
    );
    expect(
      (await (await request.get("/api/projects")).json()).projects,
    ).toHaveLength(0);
    expect(
      (await request.get("/api/projects/fixture/workbench")).status(),
    ).toBe(404);
  } finally {
    await writeFile(runtime.config, original);
  }
});
test("failed refresh retains the readable snapshot and deleted branch links recover", async ({
  page,
}) => {
  await page.goto("/?project=fixture&m=specs&s=platform");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "刷新中心仓库" }).click();
  await expect(page.locator(".error-notice[role=alert]")).toContainText(
    "当前继续显示上次成功版本",
  );
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".error-notice[role=alert]")).toContainText(
    "当前继续显示上次成功版本",
  );
  await page.goto("/?project=fixture&m=specs&branch=deleted-branch&s=platform");
  await expect(
    page.getByRole("heading", { name: "工程协作", exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/branch=/);
});
