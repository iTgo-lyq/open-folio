import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  digestPrefix,
  encodeUploadHeader,
  uploadType,
} from "../../.agents/skills/spec-trail/prototype/scripts/upload-protocol.mjs";
import { requestIdentity } from "../../.agents/skills/spec-trail/prototype/scripts/publication-contract.mjs";

test("built-in public assets load modules, styles and images on same and other origins while isolating the workbench", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const discovery = await request.get("/api/prototype-hosting");
  expect(discovery.ok()).toBeTruthy();
  const { uploadPath } = await discovery.json();
  const content: Record<string, string> = {
    "assets/chunk.js": "export const label='模块已加载';",
    "assets/pixel.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="blue"/></svg>',
    "assets/start.js":
      "const {label}=await import('./chunk.js');document.querySelector('h1').textContent=label;let n=0;document.querySelector('button').onclick=e=>e.target.textContent=String(++n);",
    "assets/style.css": "h1 { color: rgb(10, 20, 30); }",
    "index.html":
      '<!doctype html><html><head><link rel="stylesheet" href="./assets/style.css"></head><body><h1>加载中</h1><button>0</button><img src="./assets/pixel.svg" alt="图标"><script type="module" src="./assets/start.js"></script></body></html>',
  };
  const files = Object.entries(content).map(([path, body]) => ({
    path,
    size: Buffer.byteLength(body),
  }));
  const hash = createHash("sha256");
  for (const f of files)
    hash.update(digestPrefix(f.path, f.size)).update(content[f.path]);
  const publication = {
    schemaVersion: 1,
    repository: "https://example.test/unregistered.git",
    sourceCommit: "a".repeat(40),
    artifactDirectory: "/local/dist",
    digest: `sha256:${hash.digest("hex")}`,
    entries: [{ id: "screen", entryPath: "index.html" }],
    requestId: "",
  };
  publication.requestId = requestIdentity(publication);
  const bytes = Buffer.concat([
    encodeUploadHeader(publication, files),
    ...files.map((f) => Buffer.from(content[f.path])),
  ]);
  const publicContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  try {
    // The cross-origin test stays on loopback; Chromium requires an explicit local-network grant.
    await page.context().grantPermissions(["local-network-access"]);
    expect(
      (
        await publicContext.request.get(baseURL + "/api/prototype-hosting")
      ).status(),
    ).toBe(401);
    const uploaded = await publicContext.request.post(baseURL + uploadPath, {
      headers: { "content-type": uploadType },
      data: bytes,
    });
    expect(uploaded.ok(), await uploaded.text()).toBeTruthy();
    const result = await uploaded.json();
    const url = new URL(result.entries[0].path, baseURL + "/").href;
    const response = await publicContext.request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-frame-options"]).toBeUndefined();
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    const html = `<iframe title="hosted" sandbox="allow-scripts" src="${url}"></iframe>`;
    await page.route("**/hosting-check", (route) =>
      route.fulfill({ contentType: "text/html", body: html }),
    );
    for (const origin of [
      baseURL!,
      baseURL!.replace("127.0.0.1", "localhost"),
    ]) {
      await page.goto(origin + "/hosting-check");
      const frame = page.frameLocator("iframe");
      await expect(
        frame.getByRole("heading", { name: "模块已加载" }),
      ).toHaveCSS("color", "rgb(10, 20, 30)");
      await frame.getByRole("button").click();
      await expect(frame.getByRole("button")).toHaveText("1");
      expect(
        await frame
          .getByAltText("图标")
          .evaluate(
            (el: HTMLImageElement) => el.complete && el.naturalWidth > 0,
          ),
      ).toBeTruthy();
      const child = page.frames().find((f) => f.url() === url)!;
      expect(
        await child.evaluate(() => {
          try {
            return !!parent.document;
          } catch {
            return false;
          }
        }),
      ).toBe(false);
      expect(
        await child.evaluate(() => {
          try {
            return document.cookie;
          } catch {
            return "isolated";
          }
        }),
      ).toBe("isolated");
      expect(
        await child.evaluate(async () => {
          try {
            await fetch("/api/config", { credentials: "include" });
            return "exposed";
          } catch {
            return "blocked";
          }
        }),
      ).toBe("blocked");
    }
    const anonymous = await publicContext.newPage();
    await anonymous.goto(url);
    await expect(
      anonymous.getByRole("heading", { name: "模块已加载" }),
    ).toBeVisible();
    expect(
      await anonymous.evaluate(() => {
        try {
          return document.cookie;
        } catch {
          return "isolated";
        }
      }),
    ).toBe("isolated");
  } finally {
    await publicContext.close();
  }
});
