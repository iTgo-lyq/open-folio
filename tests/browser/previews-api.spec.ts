import { test, expect, repositoryQuery } from "./connected";
async function prepare(
  request: import("@playwright/test").APIRequestContext,
  personal: { id: string; url: (path: string) => string },
) {
  const response = await request.post(personal.url("previews/prepare"), {
    headers: { origin: "http://127.0.0.1:10682" },
    data: {
      connectionId: personal.id,
      change: "document-reader",
      entry: "orders",
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).publication;
}
test("anonymous preview serves only listed immutable assets with sandbox headers and no CORS", async ({
  request,
  personal,
  browser,
}) => {
  const meta = await prepare(request, personal);
  const anonymous = await browser.newContext({
    baseURL: "http://127.0.0.1:10682",
  });
  try {
    const url = `/api/public-previews/${meta.id}/index.html`;
    const res = await anonymous.request.get(url);
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-security-policy"]).toContain(
      "sandbox allow-scripts;",
    );
    expect(res.headers()["content-security-policy"]).not.toContain(
      "allow-same-origin",
    );
    expect(res.headers()["content-security-policy"]).toContain(
      "connect-src 'none'",
    );
    expect(res.headers()["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers()["cache-control"]).toContain("public");
    expect((await anonymous.request.head(url)).status()).toBe(200);
    expect(
      (
        await anonymous.request.get(url.replace("index.html", "source.ts"))
      ).status(),
    ).toBe(404);
    expect(
      (
        await anonymous.request.get(
          `/api/public-previews/${"f".repeat(64)}/index.html`,
        )
      ).status(),
    ).toBe(404);
  } finally {
    await anonymous.close();
  }
});
test("opaque iframe interaction cannot reach host storage, DOM or engineering API", async ({
  page,
  request,
  personal,
}) => {
  const meta = await prepare(request, personal);
  await page.goto(`/preview/${meta.id}`);
  const frame = page.frameLocator("iframe");
  await expect(
    frame.getByRole("heading", { name: "订单列表原型" }),
  ).toBeVisible();
  await frame.getByRole("button", { name: "0", exact: true }).click();
  await expect(
    frame.getByRole("button", { name: "1", exact: true }),
  ).toBeVisible();
  const content = page
    .frames()
    .find((f) => f.url().includes("/api/public-previews/"))!;
  const result = await content.evaluate(async () => {
    const out = { storage: false, dom: false, api: false };
    try {
      localStorage.getItem("x");
      out.storage = true;
    } catch {}
    try {
      parent.document.body;
      out.dom = true;
    } catch {}
    try {
      await fetch("/api/session");
      out.api = true;
    } catch {}
    return out;
  });
  expect(result).toEqual({ storage: false, dom: false, api: false });
});
test("public assets survive removing the publisher connection and never prepare an unknown version", async ({
  request,
  personal,
}) => {
  const meta = await prepare(request, personal);
  await request.delete("/api/session", {
    headers: { origin: "http://127.0.0.1:10682", "X-OpenFolio-Revision": "2" },
  });
  const before = await (await request.get("/_fixture/info")).json();
  for (const suffix of ["index.html", "mobile.jpg", "metadata"])
    expect(
      (await request.get(`/api/public-previews/${meta.id}/${suffix}`)).status(),
    ).toBe(200);
  expect(
    (
      await request.get(`/api/public-previews/${"0".repeat(64)}/index.html`)
    ).status(),
  ).toBe(404);
  const after = await (await request.get("/_fixture/info")).json();
  expect(after.attempts).toBe(before.attempts);
});
