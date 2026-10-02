import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
async function description(
  request: import("@playwright/test").APIRequestContext,
) {
  const response = await request.get(
    "/api/projects/fixture/previews/document-reader",
  );
  expect(response.ok()).toBe(true);
  return response.json();
}
test("same-origin preview serves only associated HTML with sandbox headers and no CORS", async ({
  request,
}) => {
  const data = await description(request);
  expect(data.entries).toHaveLength(4);
  expect(data.entries[3].available).toBe(false);
  const url = data.entries[0].url;
  const page = await request.get(url);
  expect(page.ok()).toBe(true);
  expect(page.headers()["content-security-policy"]).toContain(
    "sandbox allow-scripts;",
  );
  expect(page.headers()["content-security-policy"]).not.toContain(
    "allow-same-origin",
  );
  expect(page.headers()["content-security-policy"]).toContain(
    "connect-src 'none'",
  );
  expect(page.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(page.headers()["cache-control"]).toContain("private, no-store");
  expect(page.headers()["access-control-allow-origin"]).toBeUndefined();
  expect((await request.head(url)).status()).toBe(200);
  expect(
    (await request.get(url.replace("/orders/", "/missing/"))).status(),
  ).toBe(404);
  expect(
    (await request.get(url.replace("/index.html", "/source.ts"))).status(),
  ).toBe(404);
  expect(
    (await request.get(url, { headers: { origin: "null" } })).status(),
  ).toBe(403);
  expect(
    (
      await request.get("/api/projects", { headers: { origin: "null" } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(
        "/api/projects/fixture/previews/document-reader?revision=abc",
      )
    ).status(),
  ).toBe(400);
});
test("same-origin iframe runs local interaction and cannot reach parent storage, DOM or API", async ({
  page,
  request,
}) => {
  const data = await description(request);
  await page.goto("/");
  await page.evaluate((url) => {
    localStorage.setItem("private-marker", "private");
    const frame = document.createElement("iframe");
    frame.id = "preview-probe";
    frame.sandbox.add("allow-scripts");
    frame.src = url;
    document.body.append(frame);
  }, data.entries[0].url);
  const frame = page.frameLocator("#preview-probe");
  await expect(
    frame.getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "0", exact: true }).click();
  await expect(
    frame.getByRole("button", { name: "1", exact: true }),
  ).toBeVisible();
  const child = page.frames().find((f) => f.url().includes("/preview/"))!;
  const result = await child.evaluate(async () => {
    const blocked = (fn: () => unknown) => {
      try {
        fn();
        return false;
      } catch {
        return true;
      }
    };
    return {
      parent: blocked(() => parent.document.body),
      storage: blocked(() => localStorage.getItem("private-marker")),
      cookie: blocked(() => document.cookie),
      frameElement: window.frameElement === null,
      api: await fetch("/api/projects").then(
        () => false,
        () => true,
      ),
    };
  });
  expect(Object.values(result).every(Boolean)).toBe(true);
  await page.goto(data.entries[0].url);
  expect(
    await page.evaluate(() => {
      try {
        localStorage.getItem("private-marker");
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
});
test("project removal and configured size limits revoke even an already obtained preview URL", async ({
  request,
}) => {
  const data = await description(request),
    url = data.entries[0].url;
  const runtime = JSON.parse(
      await readFile("artifacts/e2e-runtime.json", "utf8"),
    ),
    original = await readFile(runtime.config, "utf8"),
    config = JSON.parse(original);
  try {
    await writeFile(
      runtime.config,
      JSON.stringify({ ...config, limits: { previewBytes: 2 } }),
    );
    expect((await request.get(url)).status()).toBe(404);
    await writeFile(
      runtime.config,
      JSON.stringify({ ...config, projects: [] }),
    );
    expect((await request.get(url)).status()).toBe(404);
  } finally {
    await writeFile(runtime.config, original);
  }
  expect((await request.get(url)).ok()).toBe(true);
});
